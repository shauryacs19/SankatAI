"""Translate an assistant reply on request (the reply's English / Hindi /
Hinglish cycle in the chat).

The reply JSON keeps its shape: only the text values are translated, and
severity and risk score are always copied from the original, so a translation
can never change the assessment. Each translation is cached on the message
item, so cycling back is instant and costs no model call. The text is never
logged.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.ai.openai_provider import get_provider
from app.repositories import consultation_repository as repo
from app.services import language_service

logger = logging.getLogger("sankatai.translation")

limiter = SlidingWindowLimiter(lambda: config.TRANSLATIONS_PER_MINUTE)

_TEXT_KEYS = ("reasoning", "advice", "disclaimer")


class TranslationError(Exception):
    status = 500


class TranslationNotFound(TranslationError):
    status = 404


class TranslationNotAllowed(TranslationError):
    status = 400


class TranslationRateLimited(TranslationError):
    status = 429


class TranslationUnavailable(TranslationError):
    status = 503


def _merge(original: dict, translated: dict) -> dict:
    """The original reply with only its text values replaced."""
    merged = dict(original)
    for key in _TEXT_KEYS:
        if isinstance(original.get(key), str) and isinstance(translated.get(key), str) and translated[key].strip():
            merged[key] = translated[key]
    questions = original.get("followUpQuestions")
    new_questions = translated.get("followUpQuestions")
    if (isinstance(questions, list) and isinstance(new_questions, list) and len(questions) == len(new_questions)
            and all(isinstance(q, str) for q in new_questions)):
        merged["followUpQuestions"] = new_questions
    return merged


def _translate(content: str, target: str) -> str:
    try:
        original = json.loads(content)
    except (TypeError, ValueError):
        original = None
    structured = isinstance(original, dict)
    payload = json.dumps(original if structured else {"text": content}, ensure_ascii=False)
    translated = json.loads(get_provider().translate(payload, target))
    if not isinstance(translated, dict):
        raise ValueError("translation is not an object")
    if structured:
        return json.dumps(_merge(original, translated), ensure_ascii=False)
    text = translated.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("translation has no text")
    return text


def translate_message(user_id: str, consultation_id: str, message_id: str, target: str) -> dict:
    """The reply in `target` ('en' | 'hi' | 'hinglish'):
    {"messageId", "target", "content", "lang"} where `lang` is the locale
    read-aloud uses for it."""
    if target not in language_service.TRANSLATION_TARGETS:
        raise TranslationNotAllowed("Unknown language.")
    item = repo.get_message(user_id, consultation_id, message_id)
    if not item:
        raise TranslationNotFound("Message not found.")
    if item.get("role") != "assistant":
        raise TranslationNotAllowed("Only assistant replies can be translated.")

    content = item.get("content", "")
    result = {"messageId": message_id, "target": target, "lang": language_service.TARGET_LOCALE[target]}
    if language_service.target_of(item.get("lang"), content) == target:
        return {**result, "content": content}
    cached: Optional[str] = item.get(f"translation_{target}")
    if cached:
        return {**result, "content": cached}

    if not limiter.allow(user_id):
        raise TranslationRateLimited("Too many translations. Please wait a moment.")
    try:
        translated = _translate(content, target)
    except Exception as exc:  # noqa: BLE001 - any model/parse failure is "unavailable"
        logger.warning("Translation failed: %s", type(exc).__name__)
        raise TranslationUnavailable("Translation isn't available right now. Try again in a moment.") from exc
    repo.save_translation(user_id, item["chat_id"], target, translated)
    return {**result, "content": translated}
