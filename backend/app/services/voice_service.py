"""Voice input: issue short-lived Amazon Transcribe Streaming sessions.

Owns the rules around a session — language identification options, per-user
rate limit, URL lifetime — and delegates the signing to the Transcribe
integration. The client no longer picks a language: Transcribe identifies it
among VOICE_LANGUAGE_OPTIONS (validated in config).

PRIVACY: audio and transcripts never reach this service. Logs record that a
session was issued only: never the user id (their Cognito subject), never the
URL (it embeds the role's session token).
"""

from __future__ import annotations

import logging
from typing import Optional

from botocore.exceptions import BotoCoreError

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.aws import transcribe_presign

logger = logging.getLogger("sankatai.voice")

limiter = SlidingWindowLimiter(lambda: config.VOICE_SESSIONS_PER_MINUTE)


class VoiceRateLimitError(Exception):
    """Too many sessions for this user in the current window."""


class VoiceUnavailableError(Exception):
    """No AWS credentials available to sign with."""


def create_session(user_id: str, now: Optional[float] = None) -> dict:
    if not limiter.allow(user_id, now):
        logger.warning("Voice session rate-limited (limit=%s/min).", config.VOICE_SESSIONS_PER_MINUTE)
        raise VoiceRateLimitError("Too many voice sessions. Please wait a moment and try again.")
    options = config.VOICE_LANGUAGE_OPTIONS
    # Vocabularies must line up one-per-option, or Transcribe rejects the stream.
    vocabularies = config.VOICE_VOCABULARY_NAMES if len(config.VOICE_VOCABULARY_NAMES) == len(options) else None
    try:
        url = transcribe_presign.presign_stream_url(
            config.AWS_REGION, options, config.VOICE_PREFERRED_LANGUAGE, config.VOICE_SAMPLE_RATE,
            config.VOICE_URL_EXPIRY, vocabulary_names=vocabularies,
        )
    except BotoCoreError as exc:
        logger.warning("Voice session could not be signed: %s", type(exc).__name__)
        raise VoiceUnavailableError("Voice input is not available right now.") from exc
    logger.info("Voice session issued (options=%s, expires=%ss).", ",".join(options), config.VOICE_URL_EXPIRY)
    return {
        "url": url,
        "expiresIn": config.VOICE_URL_EXPIRY,
        "languageOptions": options,
        "preferredLanguage": config.VOICE_PREFERRED_LANGUAGE,
        "sampleRate": config.VOICE_SAMPLE_RATE,
        "maxSeconds": config.VOICE_MAX_SECONDS,
    }
