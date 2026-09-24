"""Voice input: issue short-lived Amazon Transcribe Streaming sessions.

Owns the rules around a session — language allowlist, per-user rate limit,
URL lifetime — and delegates the signing to the Transcribe integration.

PRIVACY: audio and transcripts never reach this service. Logs record that a
session was issued and its language only: never the user id (their Cognito
subject), never the URL (it embeds the role's session token).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Optional

from botocore.exceptions import BotoCoreError

from app.core import config
from app.integrations.aws import transcribe_presign

logger = logging.getLogger("sankatai.voice")

_WINDOW_SECONDS = 60.0
_PRUNE_ABOVE = 10_000  # tracked users before stale entries are swept

# user_id -> issue times inside the window. In-process: the backend runs one
# uvicorn worker per instance, so this is exact there; more workers or
# instances would each allow the full quota.
_recent: dict[str, deque[float]] = {}
_lock = threading.Lock()


class VoiceError(Exception):
    """Invalid request (e.g. a language outside the allowlist)."""


class VoiceRateLimitError(Exception):
    """Too many sessions for this user in the current window."""


class VoiceUnavailableError(Exception):
    """No AWS credentials available to sign with."""


def _allow(user_id: str, now: float) -> bool:
    with _lock:
        if len(_recent) > _PRUNE_ABOVE:
            for uid in [u for u, q in _recent.items() if not q or now - q[-1] >= _WINDOW_SECONDS]:
                del _recent[uid]
        issued = _recent.setdefault(user_id, deque())
        while issued and now - issued[0] >= _WINDOW_SECONDS:
            issued.popleft()
        if len(issued) >= config.VOICE_SESSIONS_PER_MINUTE:
            return False
        issued.append(now)
        return True


def create_session(user_id: str, language_code: str, now: Optional[float] = None) -> dict:
    if language_code not in config.VOICE_ALLOWED_LANGS:
        raise VoiceError(f"Unsupported language. Choose one of: {', '.join(config.VOICE_ALLOWED_LANGS)}.")
    if not _allow(user_id, time.monotonic() if now is None else now):
        logger.warning("Voice session rate-limited (limit=%s/min).", config.VOICE_SESSIONS_PER_MINUTE)
        raise VoiceRateLimitError("Too many voice sessions. Please wait a moment and try again.")
    try:
        url = transcribe_presign.presign_stream_url(
            config.AWS_REGION, language_code, config.VOICE_SAMPLE_RATE, config.VOICE_URL_EXPIRY,
        )
    except BotoCoreError as exc:
        logger.warning("Voice session could not be signed: %s", type(exc).__name__)
        raise VoiceUnavailableError("Voice input is not available right now.") from exc
    logger.info("Voice session issued (lang=%s, expires=%ss).", language_code, config.VOICE_URL_EXPIRY)
    return {
        "url": url,
        "expiresIn": config.VOICE_URL_EXPIRY,
        "languageCode": language_code,
        "sampleRate": config.VOICE_SAMPLE_RATE,
        "maxSeconds": config.VOICE_MAX_SECONDS,
    }
