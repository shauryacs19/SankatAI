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


def _script_rule(lang: str) -> str:
    if lang.startswith("hi"):
        return "Use Devanagari script, or Latin script only if the user wrote Hindi in Latin letters (Hinglish). "
    return ""


def language_directive(lang: str) -> str:
    name = LANGUAGE_NAMES.get(lang, lang)
    return (
        f"Respond ONLY in {name} ({lang}), even if earlier messages in the conversation used another language. "
        f"{_script_rule(lang)}Keep medical terms accurate; keep drug names in English. "
        'Write the values of "reasoning", "followUpQuestions" and "advice" in that language; keep the '
        'JSON keys and the "severity" values exactly as specified above.'
    )


def language_reminder(lang: str) -> str:
    """Appended to the latest user turn in the prompt (never stored). After a
    Hindi exchange the model tends to keep replying in Hindi despite the system
    prompt; the last thing it reads settles the reply language."""
    name = LANGUAGE_NAMES.get(lang, lang)
    return f"[Reply language for this answer: {name} ({lang}). Write the whole reply in {name} only.]"


# --- translating a reply on request ----------------------------------------
# The reply bubble cycles English -> Hindi -> Hinglish. Hinglish is Hindi in
# the Latin alphabet, so it is read aloud with the Indian English voice.
TRANSLATION_TARGETS = {
    "en": "English",
    "hi": "Hindi in Devanagari script",
    "hinglish": (
        "Hinglish: Hindi written in the Latin alphabet, mixing in everyday English words the way "
        "people in India write messages (for example: 'Aapko turant doctor ko dikhana chahiye.')"
    ),
}
TARGET_LOCALE = {"en": "en-IN", "hi": "hi-IN", "hinglish": "en-IN"}


def target_of(lang: Optional[str], content: str) -> str:
    """Which translation target a reply already is: English, Hindi in
    Devanagari, or Hindi in Latin letters (Hinglish)."""
    if not (lang or "").lower().startswith("hi"):
        return "en"
    return "hi" if any("ऀ" <= ch <= "ॿ" for ch in content or "") else "hinglish"
