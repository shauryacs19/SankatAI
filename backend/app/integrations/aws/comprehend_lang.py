"""Dominant-language detection for typed messages (Amazon Comprehend).

Single responsibility: text -> (ISO 639-1 code, score). Failures return None so
the caller falls back to the conversation's language; the text is never logged.
"""

from __future__ import annotations

import logging
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core import config

logger = logging.getLogger("sankatai.language")

_MAX_CHARS = 2000  # plenty to identify a language; keeps the per-call cost flat
_client = None


def _comprehend():
    global _client
    if _client is None:
        _client = boto3.client(
            "comprehend",
            region_name=config.AWS_REGION,
            config=Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}),
        )
    return _client


def detect_dominant_language(text: str) -> Optional[tuple[str, float]]:
    """Top language and its score, or None if detection failed."""
    try:
        resp = _comprehend().detect_dominant_language(Text=text[:_MAX_CHARS])
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Comprehend language detection failed: %s", type(exc).__name__)
        return None
    languages = resp.get("Languages") or []
    if not languages:
        return None
    top = max(languages, key=lambda item: item.get("Score", 0))
    return top.get("LanguageCode", ""), float(top.get("Score", 0))
