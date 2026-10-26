"""Vault documents the user allowed the AI to read (``ai_access`` on the row).

On upload-complete (or when consent is switched on) the file is read once in the
background: PDF/text -> extracted text, image -> vision model. The LLM condenses
that into a short factual summary stored on the row as ``ai_summary``. Chat turns
only ever read cached summaries (never block on extraction). Withdrawing consent
removes the summary (repository.set_ai_access). PIN-protected files are never read.
"""

from __future__ import annotations

import io
import json
import logging
from concurrent.futures import ThreadPoolExecutor

from app.core import config
from app.integrations.ai.openai_provider import get_provider
from app.services import image_safety

logger = logging.getLogger("sankatai")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="docai")
MAX_BYTES = 10 * 1024 * 1024
MAX_TEXT = 12000
MAX_SUMMARY = 700
MAX_DOCS = 5

_SUMMARY_PROMPT = (
    "You summarise ONE medical document a patient shared with their triage assistant. Output JSON "
    '{"isMedical": true|false, "summary": "..."}. The summary (max 90 words) lists only facts stated in the '
    "document: document type and date, diagnoses, test results with values and units (flag abnormal ones), "
    "medicines with doses, allergies, procedures. No names, IDs, addresses or phone numbers. Never infer or add facts."
)
_IMAGE_PROMPT = (
    "You read ONE image of a medical document (prescription, lab report, discharge summary). Output JSON "
    '{"isMedical": true|false, "summary": "..."} with the same rules: max 90 words, only facts written in the image '
    "(type, date, diagnoses, results with values/units, medicines with doses, allergies). No names, IDs or contact details."
)


def _repo():
    from app.repositories.attachment_repository import DynamoAttachmentRepository
    return DynamoAttachmentRepository(config.ATTACHMENTS_TABLE, config.AWS_REGION)


def _s3():
    import boto3
    return boto3.client("s3", region_name=config.AWS_REGION)


def _eligible(item: dict) -> bool:
    return bool(item and item.get("ai_access") and item.get("scope") == "vault"
                and item.get("status") == "uploaded" and not item.get("password_protected"))


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    out = []
    for page in reader.pages[:10]:
        out.append(page.extract_text() or "")
        if sum(map(len, out)) > MAX_TEXT:
            break
    return "\n".join(out)[:MAX_TEXT]


def _parse(raw: str) -> str | None:
    data = json.loads(raw)
    if not data.get("isMedical", True):
        return None
    return " ".join(str(data.get("summary") or "").split())[:MAX_SUMMARY] or None


def _summarise(item: dict) -> str | None:
    s3 = _s3()
    if s3.head_object(Bucket=item["bucket"], Key=item["key"]).get("ContentLength", 0) > MAX_BYTES:
        return None
    data = s3.get_object(Bucket=item["bucket"], Key=item["key"])["Body"].read()
    ctype = (item.get("content_type") or "").lower()
    name = (item.get("filename") or "").lower()
    provider = get_provider()
    if ctype.startswith("image/") or item.get("kind") == "photo":
        b64, mime = image_safety.for_vision(data, max_side=1600)  # documents need legible text
        return _parse(provider.analyze_image(b64, mime, prompt=_IMAGE_PROMPT))
    if ctype == "application/pdf" or name.endswith(".pdf"):
        text = _pdf_text(data)
    elif ctype.startswith("text/") or name.endswith((".txt", ".csv", ".md")):
        text = data[:MAX_TEXT].decode("utf-8", "replace")
    else:
        return None  # unsupported type (e.g. .docx): stays "failed", never guessed
    if not text.strip():
        return None  # scanned PDF without a text layer
    raw = provider.generate([
        {"role": "system", "content": _SUMMARY_PROMPT},
        {"role": "user", "content": f"Document \"{item.get('filename')}\":\n{text}"},
    ], timeout=config.AI_VISION_TIMEOUT)
    return _parse(raw)


def _task(user_id: str, item: dict) -> None:
    repo = _repo()
    try:
        summary = _summarise(item)
        repo.set_ai_summary(user_id, item["attachment_id"], summary, "ready" if summary else "failed")
    except Exception as err:  # noqa: BLE001 - also covers consent withdrawn meanwhile (condition fails)
        logger.warning("Document AI read failed (%s).", type(err).__name__)
        try:
            repo.set_ai_summary(user_id, item["attachment_id"], None, "failed")
        except Exception:  # noqa: BLE001
            pass


def prefetch_by_id(user_id: str, attachment_id: str) -> None:
    from app.services.triage_service import ai_key_configured
    try:
        item = _repo().get(user_id, attachment_id)
    except Exception:  # noqa: BLE001
        return
    if _eligible(item) and not item.get("ai_summary") and ai_key_configured():
        _executor.submit(_task, user_id, item)


def context(user_id: str) -> list[dict]:
    """Cached summaries of the user's AI-readable documents, newest first."""
    try:
        items = [i for i in _repo().list_by_user(user_id) if _eligible(i)]
    except Exception:  # noqa: BLE001 - never fail a chat turn over documents
        return []
    items.sort(key=lambda i: i.get("created_at") or "", reverse=True)
    out = []
    for item in items:
        if item.get("ai_summary"):
            out.append({"name": item.get("filename"), "date": (item.get("created_at") or "")[:10],
                        "summary": item["ai_summary"]})
        elif not item.get("ai_status"):
            prefetch_by_id(user_id, item["attachment_id"])
        if len(out) >= MAX_DOCS:
            break
    return out
