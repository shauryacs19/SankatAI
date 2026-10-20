"""Photo findings for triage: vision model -> structured JSON, cached per photo.

Findings are computed once per attachment (prefetched in the background when a
v2 upload completes, or on demand within the turn's time budget) and stored on
the attachment row as ``vision_findings``. A failure yields no findings for that
photo, never a failed chat turn.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import OrderedDict
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Optional

from app.core import config
from app.integrations.ai.openai_provider import get_provider
from app.services import image_safety

logger = logging.getLogger("sankatai")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="vision")
_inflight: dict[str, Future] = {}
# Just-finished findings, recorded BEFORE the in-flight entry is dropped: a turn
# that read the row before the prefetch wrote it finds them here instead of
# paying for a second vision call.
_recent: "OrderedDict[str, dict]" = OrderedDict()
_RECENT_MAX = 256
_lock = threading.Lock()
_CUES = ("none", "mild", "moderate", "severe")


def _repo():
    from app.repositories.attachment_repository import DynamoAttachmentRepository
    return DynamoAttachmentRepository(config.ATTACHMENTS_TABLE, config.AWS_REGION)


def _s3():
    import boto3
    from botocore.config import Config
    return boto3.client("s3", region_name=config.AWS_REGION, config=Config(signature_version="s3v4"))


def normalize(raw: dict) -> dict:
    """Keep only the expected keys, bounded; never trust the model's shape."""
    def strings(v, n=8):
        return [str(s)[:80] for s in (v if isinstance(v, list) else [])[:n] if str(s).strip()]
    cue = str(raw.get("severityCue") or "none").lower()
    return {
        "isMedical": bool(raw.get("isMedical", True)),
        "imageQuality": "poor" if str(raw.get("imageQuality")).lower() == "poor" else "good",
        "bodyRegion": str(raw.get("bodyRegion") or "")[:40],
        "visibleSigns": strings(raw.get("visibleSigns")),
        "severityCues": strings(raw.get("severityCues"), 5),
        "redFlags": strings(raw.get("redFlags"), 5),
        "severityCue": cue if cue in _CUES else "none",
        "summary": str(raw.get("summary") or "")[:240],
    }


def photo_items(user_id: str, attachment_ids: list[str]) -> list[dict]:
    """The caller's uploaded photos among these ids (ownership = their partition)."""
    repo = _repo()
    items = []
    for aid in attachment_ids:
        item = repo.get(user_id, aid)
        if item and item.get("kind") == "photo" and item.get("status") == "uploaded":
            items.append(item)
    return items


def cached(item: dict) -> Optional[dict]:
    raw = item.get("vision_findings")
    try:
        return json.loads(raw) if raw else None
    except (TypeError, ValueError):
        return None


def _analyze(user_id: str, item: dict) -> Optional[dict]:
    s3 = _s3()
    head = s3.head_object(Bucket=item["bucket"], Key=item["key"])
    if head.get("ContentLength", 0) > config.TRIAGE_IMAGE_MAX_BYTES:
        return None
    data = s3.get_object(Bucket=item["bucket"], Key=item["key"])["Body"].read()
    b64, mime = image_safety.for_vision(data)
    findings = normalize(json.loads(get_provider().analyze_image(b64, mime)))
    _repo().set_vision_findings(user_id, item["attachment_id"], json.dumps(findings), config.AI_VISION_MODEL)
    return findings


def _task(user_id: str, item: dict) -> Optional[dict]:
    aid = item["attachment_id"]
    try:
        findings = _analyze(user_id, item)
        if findings is not None:
            with _lock:
                _recent[aid] = findings
                _recent.move_to_end(aid)
                while len(_recent) > _RECENT_MAX:
                    _recent.popitem(last=False)
        return findings
    except image_safety.ImageRejected:
        return None
    except Exception as err:  # noqa: BLE001 - no findings, the turn continues
        logger.warning("Vision analysis failed (%s).", type(err).__name__)
        return None
    finally:
        with _lock:
            _inflight.pop(aid, None)


def _submit(user_id: str, item: dict) -> Future:
    with _lock:
        if item["attachment_id"] in _recent:
            done: Future = Future()
            done.set_result(_recent[item["attachment_id"]])
            return done
        fut = _inflight.get(item["attachment_id"])
        if fut is None:
            fut = _executor.submit(_task, user_id, item)
            _inflight[item["attachment_id"]] = fut
        return fut


def prefetch(user_id: str, item: dict) -> None:
    from app.services.triage_service import ai_key_configured
    if ai_key_configured() and cached(item) is None:
        _submit(user_id, item)


def findings_for(user_id: str, items: list[dict], deadline: float) -> list[dict]:
    """Findings for up to the 3 most recent photos, waiting at most until deadline."""
    from app.services.triage_service import ai_key_configured

    out: list[dict] = []
    pending: list[Future] = []
    for item in items[-3:]:
        hit = cached(item)
        if hit is not None:
            out.append(hit)
        elif ai_key_configured():
            pending.append(_submit(user_id, item))
    for fut in pending:
        try:
            result = fut.result(timeout=max(0.0, min(config.AI_VISION_TIMEOUT, deadline - time.monotonic())))
        except Exception:  # noqa: BLE001 - timeout: it keeps running and is cached for the next turn
            result = None
        if result:
            out.append(result)
    return out
