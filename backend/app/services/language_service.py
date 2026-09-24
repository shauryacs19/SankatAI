"""Which language the assistant replies in.

Resolution order for each message:
  1. `lang` from voice input (Amazon Transcribe language identification);
  2. typed text: Amazon Comprehend DetectDominantLanguage, mapped to a locale
     we support (hi -> hi-IN, en -> en-IN) when its score is >= 0.8;
  3. the conversation's last language;
  4. the default (VOICE_PREFERRED_LANGUAGE, en-IN).
The latest message always wins, so a mid-conversation switch is followed.
"""

from __future__ import annotations

from typing import Optional

from app.core import config
from app.integrations.aws import comprehend_lang

MIN_CONFIDENCE = 0.8
DEFAULT_FALLBACK_LANGUAGE = "en-IN"  # the offline keyword engine's language
LANGUAGE_NAMES = {"en-IN": "English", "hi-IN": "Hindi"}


def supported_languages() -> list[str]:
    return config.VOICE_LANGUAGE_OPTIONS


def _locale_for(base: str) -> Optional[str]:
    base = (base or "").split("-")[0].lower()
    return next((loc for loc in supported_languages() if loc.split("-")[0].lower() == base), None)


def resolve_language(text: str, lang: Optional[str], previous: Optional[str]) -> str:
    supported = supported_languages()
    if lang in supported:
        return lang
    if any(ch.isalpha() for ch in text or ""):
        detected = comprehend_lang.detect_dominant_language(text)
        if detected and detected[1] >= MIN_CONFIDENCE:
            locale = _locale_for(detected[0])
            if locale:
                return locale
    if previous in supported:
        return previous
    return config.VOICE_PREFERRED_LANGUAGE


def last_language(messages: list[dict]) -> Optional[str]:
    """The most recent message's language in a conversation, if any."""
    return next((m["lang"] for m in reversed(messages) if m.get("lang")), None)


def language_directive(lang: str) -> str:
    name = LANGUAGE_NAMES.get(lang, lang)
    return (
        f"Respond ONLY in {name} ({lang}). Match the user's script (Devanagari for Hindi, "
        "or Latin if the user wrote Hinglish). Keep medical terms accurate; keep drug names in English. "
        'Write the values of "reasoning", "followUpQuestions" and "advice" in that language; keep the '
        'JSON keys and the "severity" values exactly as specified above.'
    )
