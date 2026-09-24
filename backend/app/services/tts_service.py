"""Text-to-speech for assistant replies (Amazon Polly).

The client sends only a message reference; the text and its language are read
server-side from the caller's own conversation, so arbitrary text can't be
synthesized. The spoken text is what the chat bubble shows (same rules as the
clients' normalizeAssistant), cleaned of markdown/URLs/emoji and chunked at
sentence boundaries to stay within Polly's per-request limit.

PRIVACY: message text and audio are never logged.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Iterator, Optional

from botocore.exceptions import BotoCoreError, ClientError

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.aws import polly_tts
from app.repositories import consultation_repository as repo

logger = logging.getLogger("sankatai.tts")

CHUNK_LIMIT = 2500  # characters per SynthesizeSpeech request
limiter = SlidingWindowLimiter(lambda: config.TTS_REQUESTS_PER_MINUTE)


class TtsNotFound(Exception):
    pass


class TtsNotSpeakable(Exception):
    pass


class TtsRateLimited(Exception):
    pass


class TtsUnavailable(Exception):
    pass


# --- text ------------------------------------------------------------------

_CODE_BLOCK = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE = re.compile(r"`([^`]*)`")
_MD_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_MD_MARKS = re.compile(r"(\*{1,3}|_{2,3}|~~|^#{1,6}\s*|^>\s*|^[-*+]\s+|^\d+\.\s+)", re.MULTILINE)
_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U0000FE0F\U0000200D\U00002B00-\U00002BFF]"
)
_SENTENCE_END = re.compile(r"(?<=[.!?।])\s+")


def speakable_text(content: str) -> str:
    """The text the chat bubble displays for an assistant message."""
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError):
        return content or ""
    if not isinstance(parsed, dict):
        return content or ""
    questions = parsed.get("followUpQuestions") or []
    if isinstance(questions, list) and questions:
        return " ".join(str(q) for q in questions)
    return str(parsed.get("advice") or ("" if parsed.get("severity") else content) or "")


def clean_text(text: str) -> str:
    text = _CODE_BLOCK.sub(" ", text or "")
    text = _INLINE_CODE.sub(r"\1", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _URL.sub(" ", text)
    text = _MD_MARKS.sub("", text)
    text = _EMOJI.sub("", text)
    return " ".join(text.split())


def chunk_text(text: str, limit: int = CHUNK_LIMIT) -> list[str]:
    """Split at sentence boundaries into chunks of at most `limit` chars; a single
    over-long sentence is split at word boundaries (or hard, as a last resort)."""
    chunks: list[str] = []
    current = ""
    for sentence in _SENTENCE_END.split(text.strip()):
        while len(sentence) > limit:
            cut = sentence.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            if current:
                chunks.append(current)
                current = ""
            chunks.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if not sentence:
            continue
        candidate = f"{current} {sentence}" if current else sentence
        if len(candidate) <= limit:
            current = candidate
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks


def voice_for(lang: Optional[str]) -> dict:
    voices = config.TTS_VOICE_MAP
    return voices.get(lang or "") or voices.get(config.TTS_DEFAULT_LANGUAGE) or next(iter(voices.values()))


# --- use case --------------------------------------------------------------

def synthesize_message(user_id: str, consultation_id: str, message_id: str) -> tuple[str, object]:
    """Returns ("audio", iterator of MP3 bytes) or, with the cache on,
    ("redirect", presigned GET URL)."""
    if not limiter.allow(user_id):
        raise TtsRateLimited("Too many read-aloud requests. Please wait a moment.")
    item = repo.get_message(user_id, consultation_id, message_id)
    if not item:
        raise TtsNotFound("Message not found.")
    if item.get("role") != "assistant":
        raise TtsNotSpeakable("Only assistant replies can be read aloud.")
    text = clean_text(speakable_text(item.get("content", "")))
    if not text:
        raise TtsNotSpeakable("This reply has no text to read.")
    voice = voice_for(item.get("lang"))
    chunks = chunk_text(text)
    logger.info("TTS requested (lang=%s, chunks=%d, chars=%d, cache=%s).", voice.get("LanguageCode"), len(chunks), len(text), config.TTS_CACHE_ENABLED)

    try:
        if config.TTS_CACHE_ENABLED:
            key = f"{polly_tts.CACHE_PREFIX}{hashlib.sha256((text + json.dumps(voice, sort_keys=True)).encode()).hexdigest()}.mp3"
            if not polly_tts.cache_exists(config.TTS_CACHE_BUCKET, key):
                polly_tts.cache_put(config.TTS_CACHE_BUCKET, key, b"".join(polly_tts.synthesize(c, voice) for c in chunks))
            return "redirect", polly_tts.cache_url(config.TTS_CACHE_BUCKET, key)
        # Synthesize the first chunk now so a Polly failure becomes a clean 503
        # instead of a truncated stream; the rest stream in order.
        first = polly_tts.synthesize(chunks[0], voice)
    except (BotoCoreError, ClientError) as exc:
        logger.warning("TTS failed: %s", type(exc).__name__)
        raise TtsUnavailable("Read-aloud is not available right now.") from exc

    def stream() -> Iterator[bytes]:
        yield first
        for chunk in chunks[1:]:
            yield polly_tts.synthesize(chunk, voice)

    return "audio", stream()
