"""AI medical report analyzer for Documents-vault files (PDF, text, images).

The analysis is stored on the document's own row in the attachments table
(``report_status`` / ``report_analysis`` / ``report_analyzed_at``), so it lives
in the user's history, is listed with their files, and is deleted with the file.

Pipeline (background thread, the client polls):
  1. read the object (<= 10 MB): PDF/text -> text layer, image -> vision model
  2. extract parameters: the LLM returns name / value / unit / the reference
     range exactly as printed + a plain-language explanation. Without AI, a
     line regex reads "Name value unit low - high" rows from the text.
  3. code (never the LLM) decides high / low / normal by comparing the value
     with the PRINTED range. For text documents every value and range number
     must occur in the document text, otherwise the range is dropped (and an
     unverifiable value is dropped) -- ranges are never invented.

Password-protected files are never read.
"""

from __future__ import annotations

import io
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.aws.dynamo_client import now_iso
from app.services import image_safety

logger = logging.getLogger("sankatai")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="report")
MAX_BYTES = 10 * 1024 * 1024
MAX_TEXT = 12000
MAX_PARAMS = 60
STALE_AFTER = timedelta(minutes=3)  # a "processing" row older than this was lost (restart) -> failed
DISCLAIMER = ("AI-generated informational summary of your report, not a diagnosis. Values are compared only with "
              "the reference ranges printed on the report. Check the original and discuss the results with a doctor.")

analyze_limiter = SlidingWindowLimiter(lambda: 10)


class ReportError(Exception):
    pass


class ReportNotFound(ReportError):
    pass


class ReportRateLimited(ReportError):
    pass


def _repo():
    from app.repositories.attachment_repository import DynamoAttachmentRepository
    return DynamoAttachmentRepository(config.ATTACHMENTS_TABLE, config.AWS_REGION)


def _s3():
    import boto3
    return boto3.client("s3", region_name=config.AWS_REGION)


# --- ranges + flags (deterministic) ----------------------------------------

_NUM = r"\d+(?:[.,]\d+)?"
_RANGE_BETWEEN = re.compile(rf"({_NUM})\s*(?:-|–|—|to)\s*({_NUM})")
_RANGE_BELOW = re.compile(rf"(?:<=?|≤|up\s*to|upto|less than|below)\s*({_NUM})", re.I)
_RANGE_ABOVE = re.compile(rf"(?:>=?|≥|more than|greater than|above)\s*({_NUM})", re.I)


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def parse_range(text: str) -> tuple[Optional[float], Optional[float]]:
    """(low, high) from a printed reference range; (None, None) if unreadable."""
    text = (text or "").strip()
    if m := _RANGE_BETWEEN.search(text):
        lo, hi = _f(m.group(1)), _f(m.group(2))
        return (lo, hi) if lo <= hi else (None, None)
    if m := _RANGE_BELOW.search(text):
        return None, _f(m.group(1))
    if m := _RANGE_ABOVE.search(text):
        return _f(m.group(1)), None
    return None, None


def parse_value(text: str) -> Optional[float]:
    m = re.search(rf"-?{_NUM}", str(text or ""))
    return _f(m.group(0)) if m else None


def flag(value: Optional[float], low: Optional[float], high: Optional[float]) -> str:
    if value is None or (low is None and high is None):
        return "not_assessed"
    if low is not None and value < low:
        return "low"
    if high is not None and value > high:
        return "high"
    return "normal"


def _canon(n: str) -> str:
    n = n.replace(",", ".")
    return (n.rstrip("0").rstrip(".") or "0") if "." in n else (n.lstrip("0") or "0")


def _numbers(text: str) -> set[str]:
    return {_canon(n) for n in re.findall(_NUM, text or "")}


def _in_source(fragment: str, source_numbers: set[str]) -> bool:
    nums = _numbers(fragment)
    return bool(nums) and nums <= source_numbers


def finalize(params: list[dict], source_text: Optional[str]) -> list[dict]:
    """Clean extracted rows and compute every flag. ``source_text`` (text
    documents) is the grounding check; None for images (cannot be checked)."""
    src = _numbers(source_text) if source_text is not None else None
    out = []
    for p in params[:MAX_PARAMS]:
        if not isinstance(p, dict):
            continue
        name = " ".join(str(p.get("name") or "").split())[:80]
        value = " ".join(str(p.get("value") or "").split())[:40]
        if not name or not value:
            continue
        if src is not None and parse_value(value) is not None and not _in_source(value, src):
            continue  # a number that is not in the document: never shown
        rng = " ".join(str(p.get("referenceRange") or "").split())[:60]
        if rng and src is not None and not _in_source(rng, src):
            rng = ""  # range not printed in the document: dropped, not guessed
        low, high = parse_range(rng)
        num = parse_value(value)
        out.append({
            "name": name, "value": value, "unit": " ".join(str(p.get("unit") or "").split())[:20],
            "referenceRange": rng or None, "low": low, "high": high, "status": flag(num, low, high),
            "explanation": " ".join(str(p.get("explanation") or "").split())[:300],
        })
    return out


# Offline: "Haemoglobin   10.2  g/dL   13.0 - 17.0" style rows only (a printed range is required).
_ROW = re.compile(
    rf"^\s*(?P<name>[A-Za-z][A-Za-z0-9 ()/%,.+\-]{{1,48}}?)\s*[:\-]?\s+(?P<value>{_NUM})\s*(?P<flag>[HL]\b)?\s*"
    rf"(?P<unit>[A-Za-zµμ%/^0-9.]{{0,15}}(?:/[A-Za-z]+)?)?\s+(?P<range>{_NUM}\s*(?:-|–|to)\s*{_NUM}|(?:<=?|>=?|≤|≥)\s*{_NUM})",
    re.M,
)


def regex_parameters(text: str) -> list[dict]:
    rows, seen = [], set()
    for m in _ROW.finditer(text or ""):
        name = m.group("name").strip(" :-")
        if name.lower() in seen or len(name) < 2:
            continue
        seen.add(name.lower())
        unit = (m.group("unit") or "").strip()
        rows.append({"name": name, "value": m.group("value"), "unit": "" if _NUM_ONLY.fullmatch(unit) else unit,
                     "referenceRange": m.group("range"), "explanation": ""})
    return rows


_NUM_ONLY = re.compile(r"[\d.]*")
_DATE = re.compile(r"(?:report|collection|collected|sample|test)\s*(?:date|on)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})", re.I)


def printed_date(text: Optional[str]) -> Optional[str]:
    m = _DATE.search(text or "")
    return m.group(1) if m else None


# --- reading + LLM -----------------------------------------------------------

_TEXT_PROMPT = (
    "You extract test results from ONE medical report for the patient. Output JSON only: "
    '{"isMedical": true|false, "reportType": "...", "reportDate": "YYYY-MM-DD or empty", '
    '"summary": "2-3 plain sentences: what the report is and which results are outside the printed ranges", '
    '"parameters": [{"name": "...", "value": "as printed", "unit": "...", "referenceRange": "exactly as printed, or empty", '
    '"explanation": "one simple sentence: what this test measures"}], '
    '"medications": ["name + dose, only if the document lists medicines"]}. '
    "Rules: copy values and reference ranges EXACTLY as printed; if no range is printed for a test, referenceRange "
    "must be empty -- never use typical or textbook ranges. Do not diagnose. No names, IDs, addresses or phone numbers."
)
_IMAGE_PROMPT = _TEXT_PROMPT.replace("ONE medical report", "ONE photo of a medical report")


def _parse_json(raw: str) -> dict:
    data = json.loads(raw)
    return data if isinstance(data, dict) else {}


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ReportError("This PDF is password-protected. Upload an unlocked copy.")
    out: list[str] = []
    for page in reader.pages[:15]:
        out.append(page.extract_text() or "")
        if sum(map(len, out)) > MAX_TEXT:
            break
    return "\n".join(out)[:MAX_TEXT]


def _read(item: dict) -> tuple[Optional[str], Optional[bytes]]:
    """(text, image_bytes): exactly one is set."""
    s3 = _s3()
    if s3.head_object(Bucket=item["bucket"], Key=item["key"]).get("ContentLength", 0) > MAX_BYTES:
        raise ReportError("The file is larger than 10 MB.")
    data = s3.get_object(Bucket=item["bucket"], Key=item["key"])["Body"].read()
    ctype = (item.get("content_type") or "").lower()
    name = (item.get("filename") or "").lower()
    if ctype.startswith("image/") or item.get("kind") == "photo":
        return None, data
    if ctype == "application/pdf" or name.endswith(".pdf"):
        text = _pdf_text(data)
        if not text.strip():
            raise ReportError("This PDF has no readable text (it may be a scan). Upload a clear photo of the report instead.")
        return text, None
    if ctype.startswith("text/") or name.endswith((".txt", ".csv")):
        return data[:MAX_TEXT].decode("utf-8", "replace"), None
    raise ReportError("Only PDF, text and image (JPEG/PNG/WebP) reports can be analysed.")


def _analyse(item: dict) -> dict:
    from app.integrations.ai.openai_provider import get_provider
    from app.services.triage_service import ai_key_configured

    text, image = _read(item)
    ai = ai_key_configured()
    llm: dict = {}
    if image is not None:
        if not ai:
            raise ReportError("Reading report photos needs the AI service, which is unavailable right now.")
        try:
            b64, mime = image_safety.for_vision(image, max_side=1600)
        except Exception as err:  # noqa: BLE001 - corrupt or unsupported image
            raise ReportError("This image could not be opened. Use a JPEG, PNG or WebP photo.") from err
        try:
            llm = _parse_json(get_provider().analyze_image(b64, mime, prompt=_IMAGE_PROMPT, timeout=max(config.AI_VISION_TIMEOUT, 45)))
        except Exception as err:  # noqa: BLE001 - provider down, timeout or bad JSON
            logger.warning("Report photo AI read failed (%s).", type(err).__name__)
            raise ReportError("The AI service couldn't read this photo right now. Try again later.") from err
    elif ai:
        try:
            llm = _parse_json(get_provider().generate([
                {"role": "system", "content": _TEXT_PROMPT},
                {"role": "user", "content": f"Report text:\n{text}"},
            ], timeout=max(config.AI_TIMEOUT, 45)))
        except Exception as err:  # noqa: BLE001 - fall back to the regex reader below
            logger.warning("Report AI extraction failed (%s); using the text reader.", type(err).__name__)
    if llm and llm.get("isMedical") is False:
        raise ReportError("This doesn't look like a medical report.")
    raw = llm.get("parameters") if isinstance(llm.get("parameters"), list) else None
    source = "ai" if raw else "rules"
    if not raw:
        if text is None:
            raise ReportError("No test results could be read from this image. Try a sharper, well-lit photo.")
        raw = regex_parameters(text)
    params = finalize(raw, text)
    abnormal = [p for p in params if p["status"] in ("high", "low")]
    summary = " ".join(str(llm.get("summary") or "").split())[:600]
    if not summary:
        summary = (f"{len(params)} result{'s' if len(params) != 1 else ''} read; {len(abnormal)} outside the printed range."
                   if params else "No test results with values could be read from this document.")
    meds = [" ".join(str(m).split())[:120] for m in (llm.get("medications") or []) if str(m).strip()][:20] \
        if isinstance(llm.get("medications"), list) else []
    return {
        "reportType": " ".join(str(llm.get("reportType") or "").split())[:80] or None,
        "reportDate": str(llm.get("reportDate") or "")[:10] or printed_date(text),
        "summary": summary, "parameters": params, "abnormalCount": len(abnormal), "medications": meds,
        "source": source, "verifiedAgainstText": text is not None,
    }


def _task(user_id: str, attachment_id: str, item: dict) -> None:
    repo = _repo()
    try:
        result = _analyse(item)
        repo.set_report_analysis(user_id, attachment_id, "ready", json.dumps(result, ensure_ascii=False), None)
    except ReportError as err:
        repo.set_report_analysis(user_id, attachment_id, "failed", None, str(err))
    except Exception as err:  # noqa: BLE001
        logger.warning("Report analysis failed (%s).", type(err).__name__)
        try:
            repo.set_report_analysis(user_id, attachment_id, "failed", None, "The report could not be analysed. Try again.")
        except Exception:  # noqa: BLE001 - row deleted meanwhile
            pass


# --- public API --------------------------------------------------------------

def _status(item: dict) -> Optional[str]:
    st = item.get("report_status")
    if st == "processing":
        started = item.get("report_started_at") or ""
        try:
            when = datetime.fromisoformat(started.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - when > STALE_AFTER:
                return "failed"
        except ValueError:
            return "failed"
    return st


def view(item: dict, *, full: bool = True) -> dict:
    st = _status(item)
    out = {
        "attachmentId": item["attachment_id"], "filename": item.get("filename"), "uploadedAt": item.get("created_at"),
        "contentType": item.get("content_type"), "status": st or "none", "analyzedAt": item.get("report_analyzed_at"),
        "error": item.get("report_error") if st == "failed" else None,
        "passwordProtected": bool(item.get("password_protected")),
    }
    if st == "failed" and item.get("report_status") == "processing":
        out["error"] = "The analysis was interrupted. Try again."
    analysis = None
    if st == "ready" and item.get("report_analysis"):
        try:
            analysis = json.loads(item["report_analysis"])
        except (TypeError, ValueError):
            analysis = None
    if analysis:
        out.update(abnormalCount=analysis.get("abnormalCount", 0), reportType=analysis.get("reportType"),
                   reportDate=analysis.get("reportDate"), summary=analysis.get("summary"))
        if full:
            out.update(analysis=analysis, disclaimer=DISCLAIMER)
    return out


def _vault_doc(user_id: str, attachment_id: str) -> dict:
    item = _repo().get(user_id, attachment_id)
    if not item or item.get("scope") != "vault" or item.get("status") != "uploaded":
        raise ReportNotFound("Document not found.")
    return item


def list_reports(user_id: str) -> list[dict]:
    """The caller's uploaded vault documents with their analysis state, newest first."""
    items = [i for i in _repo().list_by_user(user_id) if i.get("scope") == "vault" and i.get("status") == "uploaded"]
    items.sort(key=lambda i: i.get("created_at") or "", reverse=True)
    return [view(i, full=False) for i in items]


def get_report(user_id: str, attachment_id: str) -> dict:
    return view(_vault_doc(user_id, attachment_id))


def start(user_id: str, attachment_id: str) -> dict:
    item = _vault_doc(user_id, attachment_id)
    if item.get("password_protected"):
        raise ReportError("PIN-protected files are never read by the AI. Remove the protection to analyse it.")
    if _status(item) == "processing":
        return view(item)
    if not analyze_limiter.allow(user_id):
        raise ReportRateLimited("Too many analyses. Try again in a minute.")
    _repo().mark_report_processing(user_id, attachment_id, now_iso())
    _executor.submit(_task, user_id, attachment_id, item)
    return view(_vault_doc(user_id, attachment_id))


def analyses(user_id: str, limit: int = 10) -> list[dict]:
    """Ready analyses (full), newest first -- for the timeline and the doctor report."""
    items = [i for i in _repo().list_by_user(user_id)
             if i.get("scope") == "vault" and i.get("report_status") == "ready" and i.get("report_analysis")]
    items.sort(key=lambda i: i.get("report_analyzed_at") or "", reverse=True)
    return [view(i) for i in items[:limit]]
