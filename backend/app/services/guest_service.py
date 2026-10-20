"""Guest chat: AI triage for visitors without an account, and saving it later.

Nothing about a guest conversation is stored here — no DynamoDB write, no
analytics event, no log line with message text. The browser keeps the
transcript; each assistant reply is HMAC-signed so that, if the person creates
an account, ``save()`` can import the conversation while refusing any "AI"
text the client wrote itself. The signing key is derived (HMAC, own label) from
the existing analytics salt secret, so no new secret exists; without that salt
(local dev) a per-process key is used and signatures die on restart.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.aws.dynamo_client import now_iso
from app.repositories import consultation_repository as repo
from app.schemas.guest import GuestMessage
from app.schemas.triage import Message as ChatMessage
from app.services import analytics_service, language_service
from app.services.consultation_service import _title_from_text
from app.services.triage_service import run_triage

USER_TEXT_MAX = 2000  # characters per guest message

per_minute = SlidingWindowLimiter(lambda: config.GUEST_CHAT_PER_MINUTE)
per_hour = SlidingWindowLimiter(lambda: config.GUEST_CHAT_PER_HOUR, window_seconds=3600)

_fallback_key = secrets.token_bytes(32)


class GuestError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _key() -> bytes:
    salt = config.ANALYTICS_SALT
    if not salt:
        return _fallback_key
    return hmac.new(salt.encode(), b"sankatai/guest-reply/v1", hashlib.sha256).digest()


def sign(guest_id: str, created_at: str, content: str, lang: Optional[str], offline: bool) -> str:
    payload = json.dumps(["v1", guest_id, created_at, lang or "", bool(offline), content],
                         ensure_ascii=False, separators=(",", ":"))
    mac = hmac.new(_key(), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def _signed(guest_id: str, m: GuestMessage) -> bool:
    if not m.signature or not m.createdAt:
        return False
    expected = sign(guest_id, m.createdAt, m.content, m.lang, m.isOfflineFallback)
    return hmac.compare_digest(expected, m.signature)


def _parse_time(value: str) -> Optional[datetime]:
    try:
        t = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return t if t.tzinfo else None


def _check_transcript(guest_id: str, messages: list[GuestMessage]) -> None:
    """Shared rules: user text is bounded, every assistant turn is one we signed."""
    user_turns = 0
    for m in messages:
        if m.role == "user":
            user_turns += 1
            if len(m.content.strip()) == 0 or len(m.content) > USER_TEXT_MAX:
                raise GuestError(400, f"Each message must be between 1 and {USER_TEXT_MAX} characters.")
        elif not _signed(guest_id, m):
            raise GuestError(400, "This conversation could not be verified. Please start a new one.")
    if user_turns > config.GUEST_MAX_TURNS:
        raise GuestError(409, "This guest conversation is full. Create an account to keep going.")


def chat(guest_id: str, messages: list[GuestMessage], client_key: str) -> dict:
    """One AI turn for a guest. Returns the signed assistant reply."""
    if not config.GUEST_CHAT_ENABLED:
        raise GuestError(503, "Guest chat is not available right now. Please sign in to continue.")
    if messages[-1].role != "user":
        raise GuestError(400, "The last message must be yours.")
    _check_transcript(guest_id, messages)
    if not per_minute.allow(client_key) or not per_hour.allow(client_key):
        raise GuestError(429, "You have sent a lot of messages. Please wait a little, or sign in to continue.")

    text = messages[-1].content.strip()
    previous = next((m.lang for m in reversed(messages) if m.role == "assistant" and m.lang), None)
    reply_lang = language_service.resolve_language(text, None, previous)
    history = [ChatMessage(role=m.role, content=m.content) for m in messages][-8:]

    content, offline = run_triage(history, None, lang=reply_lang, session_id=guest_id)
    lang = language_service.DEFAULT_FALLBACK_LANGUAGE if offline else reply_lang
    created_at = now_iso()
    return {
        "role": "assistant",
        "content": content,
        "createdAt": created_at,
        "lang": lang,
        "isOfflineFallback": offline,
        "signature": sign(guest_id, created_at, content, lang, offline),
    }


def _severity_of(content: str) -> tuple[Optional[str], Optional[int]]:
    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None, None
    if not isinstance(parsed, dict):
        return None, None
    severity = parsed.get("severity") if parsed.get("severity") in analytics_service.SEVERITIES else None
    rs = parsed.get("riskScore")
    return severity, int(rs) if isinstance(rs, (int, float)) else None


def save(user_id: str, guest_id: str, messages: list[GuestMessage]) -> dict:
    """Store a verified guest conversation as one of the user's consultations."""
    _check_transcript(guest_id, messages)
    firsts = [m for m in messages if m.role == "user"]
    if not firsts:
        raise GuestError(400, "There is nothing to save yet.")

    now = datetime.now(timezone.utc)
    oldest = now - timedelta(hours=config.GUEST_SAVE_MAX_AGE_HOURS)
    signed_times: list[Optional[datetime]] = []
    for m in messages:
        if m.role != "assistant":
            signed_times.append(None)
            continue
        t = _parse_time(m.createdAt or "")
        if t is None or t < oldest or t > now + timedelta(minutes=5):
            raise GuestError(410, "This guest conversation is too old to save.")
        if any(p is not None and p > t for p in signed_times):
            raise GuestError(400, "This conversation could not be verified. Please start a new one.")
        signed_times.append(t)

    # Timestamps keep the original order: a reply keeps its signed time, a user
    # message sits 1 ms before the reply that answered it (or "now" if none did).
    times: list[str] = []
    for i, m in enumerate(messages):
        if m.role == "assistant":
            times.append(signed_times[i].isoformat())
            continue
        nxt = next((signed_times[j] for j in range(i + 1, len(messages)) if signed_times[j] is not None), None)
        times.append((nxt - timedelta(milliseconds=1)).isoformat() if nxt else now.isoformat())

    consultation = repo.create_consultation(user_id, _title_from_text(firsts[0].content))
    cid = consultation["consultationId"]
    last_severity = None
    for i, m in enumerate(messages):
        if m.role == "assistant":
            severity, risk = _severity_of(m.content)
            last_severity = severity or last_severity
            repo.add_message(user_id, cid, "assistant", m.content, severity=severity, risk_score=risk,
                             offline_fallback=m.isOfflineFallback, lang=m.lang, created_at=times[i])
        else:
            repo.add_message(user_id, cid, "user", m.content, input_mode="text", created_at=times[i])
    repo.touch_consultation(user_id, cid, last_severity=last_severity)
    analytics_service.emit("CHAT_CREATED", user_id)
    return {**consultation, "lastSeverity": last_severity}
