"""Yes/No feedback -> anonymised training row + bandit credit.

Called after the vote is saved on the chat message (that write is unchanged and
still drives the admin analytics). Here, per rated assistant reply:

* one row in the feedback table: keyed-hash session id and message ref (no user
  id), the scrubbed model input (``query``), features, predicted/final severity,
  confidence, model version, prompt variant, questions asked, the scrubbed reply,
  the vote, optional reason/direction/comment and timestamps. Re-voting
  overwrites the row; clearing the vote deletes it.
* bandit counters: the reply's prompt variant and every slot asked in that
  session move their standing vote from the old value to the new one.

Best-effort: a failure here is logged, never surfaced (the vote itself is saved).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from app.core import config
from app.ml import pii
from app.repositories import feedback_repository as repo
from app.services import bandit_service

logger = logging.getLogger("sankatai")

REASONS = ("inaccurate", "too_generic", "wrong_severity")
_VOTE = {"like": "yes", "dislike": "no"}
_process_key = secrets.token_bytes(32)


def _key() -> bytes:
    salt = config.ANALYTICS_SALT
    return hmac.new(salt.encode(), b"sankatai/triage-feedback/v1", hashlib.sha256).digest() if salt else _process_key


def pseudonym(kind: str, value: str) -> str:
    return hmac.new(_key(), f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()[:24]


def _dyn(value):
    """JSON-safe -> DynamoDB-safe (floats become Decimal)."""
    return json.loads(json.dumps(value), parse_float=Decimal)


def _parse(content: str) -> dict:
    try:
        value = json.loads(content or "")
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def arms_for(triage: dict) -> list[str]:
    arms = [f"prompt#{triage['variant']}"] if triage.get("variant") else []
    slots = list(triage.get("asked") or [])
    if triage.get("mode") == "ask" and triage.get("slot"):
        slots.append(triage["slot"])
    from app.ml.slots import SLOTS
    return arms + [f"slot#{s}" for s in dict.fromkeys(slots) if s in SLOTS]


def build_item(*, consultation_id: str, message: dict, query: str, vote: str, reason: Optional[str],
               direction: Optional[str], comment: Optional[str]) -> dict:
    reply = _parse(message.get("content", ""))
    triage = reply.get("triage") if isinstance(reply.get("triage"), dict) else {}
    reply_at = message.get("createdAt") or datetime.now(timezone.utc).isoformat()
    ref = pseudonym("message", message.get("id") or reply_at)
    response = " ".join(reply.get("followUpQuestions") or []) or reply.get("advice") or ""
    item = {
        "pk": f"FB#{reply_at[:7]}", "sk": f"{reply_at}#{ref}",
        "session_id": pseudonym("session", consultation_id), "message_ref": ref,
        "query": pii.scrub(query, 2000),
        "features": triage.get("features") or {},
        "predicted_severity": triage.get("modelSeverity"),
        "final_severity": reply.get("severity"),
        "provisional_severity": triage.get("provisional"),
        "confidence": reply.get("confidence"),
        "probs": triage.get("probs") or {},
        "source": triage.get("source"), "model_version": triage.get("modelVersion"),
        "mode": triage.get("mode") or ("final" if reply.get("severity") else "legacy"),
        "slot": triage.get("slot"), "asked_slots": list(triage.get("asked") or []),
        "prompt_variant": triage.get("variant"), "stop": triage.get("stop"),
        "response": pii.scrub(response, 1500),
        "feedback": vote, "reason": reason, "direction": direction,
        "comment": pii.scrub(comment, 280) if comment else None,
        "lang": message.get("lang"), "offline": bool(message.get("isOfflineFallback")),
        "engine": triage.get("v", 1),
        "reply_at": reply_at, "created_at": datetime.now(timezone.utc).isoformat(),
        "ttl": int(time.time()) + config.TRIAGE_FEEDBACK_TTL_DAYS * 86400,
    }
    return _dyn({k: v for k, v in item.items() if v is not None})


def model_text(user_id: str, consultation_id: str, messages: list[dict], message_id: str) -> str:
    """The text the model saw for this reply, rebuilt from the turns before it."""
    from app.ml.features import build_features
    from app.schemas.triage import Message
    from app.services import vision_service
    from app.services.triage_engine import to_turns

    idx = next((i for i, m in enumerate(messages) if m.get("id") == message_id), len(messages))
    before = messages[:idx]
    history = [Message(role=m["role"], content=m.get("content") or "") for m in before if m.get("role") in ("user", "assistant")]
    photo_ids = [a for m in before if m.get("role") == "user" for a in (m.get("attachmentIds") or [])]
    findings = []
    if photo_ids:
        findings = [f for f in (vision_service.cached(i) for i in vision_service.photo_items(user_id, photo_ids)) if f]
    turns, _ = to_turns(history)
    return build_features(turns, image_findings=findings).text


def record(user_id: str, consultation_id: str, message: dict, messages: list[dict], *,
           old: Optional[str], new: Optional[str], reason: Optional[str] = None,
           direction: Optional[str] = None, comment: Optional[str] = None) -> None:
    """``old``/``new`` are the message's like|dislike|None before and after."""
    if not repo.enabled():
        return
    try:
        reply = _parse(message.get("content", ""))
        triage = reply.get("triage") if isinstance(reply.get("triage"), dict) else {}
        old_vote, new_vote = _VOTE.get(old), _VOTE.get(new)
        if new_vote is None:
            reply_at = message.get("createdAt") or ""
            repo.delete(f"FB#{reply_at[:7]}", f"{reply_at}#{pseudonym('message', message.get('id') or reply_at)}")
        else:
            query = model_text(user_id, consultation_id, messages, message.get("id"))
            repo.put(build_item(consultation_id=consultation_id, message=message, query=query, vote=new_vote,
                                reason=reason if new_vote == "no" else None,
                                direction=direction if reason == "wrong_severity" else None, comment=comment))
        bandit_service.record(arms_for(triage), old_vote, new_vote)
    except Exception as err:  # noqa: BLE001 - the vote on the message is already saved
        logger.warning("Triage feedback not stored (%s).", type(err).__name__)
