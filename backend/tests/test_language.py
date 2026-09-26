"""Reply-language resolution and its injection into the LLM system prompt."""

from __future__ import annotations

import pytest

from app.core import config
from app.integrations.ai import openai_provider
from app.integrations.aws import comprehend_lang
from app.services import consultation_service, language_service


@pytest.fixture(autouse=True)
def languages(monkeypatch):
    monkeypatch.setattr(config, "VOICE_LANGUAGE_OPTIONS", ["en-IN", "hi-IN"])
    monkeypatch.setattr(config, "VOICE_PREFERRED_LANGUAGE", "en-IN")


def comprehend(monkeypatch, result):
    calls = []

    def fake(text):
        calls.append(text)
        return result
    monkeypatch.setattr(comprehend_lang, "detect_dominant_language", fake)
    return calls


def test_voice_lang_takes_priority_over_comprehend(monkeypatch):
    calls = comprehend(monkeypatch, ("en", 0.99))
    assert language_service.resolve_language("I have a fever", "hi-IN", "en-IN") == "hi-IN"
    assert calls == []  # no Comprehend call when voice already told us


def test_typed_text_uses_comprehend_mapped_to_locale(monkeypatch):
    comprehend(monkeypatch, ("hi", 0.97))
    assert language_service.resolve_language("मुझे बुखार है", None, "en-IN") == "hi-IN"


def test_low_confidence_falls_back_to_conversation_then_default(monkeypatch):
    comprehend(monkeypatch, ("tl", 0.43))  # e.g. romanised Hinglish
    assert language_service.resolve_language("mujhe bukhar hai", None, "hi-IN") == "hi-IN"
    assert language_service.resolve_language("mujhe bukhar hai", None, None) == "en-IN"


def test_unsupported_or_failed_detection_falls_back(monkeypatch):
    comprehend(monkeypatch, ("fr", 0.99))  # confident, but not a language we answer in
    assert language_service.resolve_language("J'ai de la fièvre", None, "hi-IN") == "hi-IN"
    comprehend(monkeypatch, None)  # Comprehend unavailable
    assert language_service.resolve_language("fever", None, None) == "en-IN"


def test_unknown_voice_lang_is_ignored(monkeypatch):
    comprehend(monkeypatch, ("en", 0.95))
    assert language_service.resolve_language("fever", "ta-IN", None) == "en-IN"


def test_prompt_carries_the_language_instruction():
    prompt = openai_provider.build_prompt(None, "hi-IN")
    assert "Respond ONLY in Hindi (hi-IN)" in prompt
    assert "Devanagari" in prompt and "drug names in English" in prompt
    assert openai_provider.build_prompt(None, None) == openai_provider.build_system_prompt(None)


class FakeRepo:
    def __init__(self, earlier):
        self.earlier = earlier
        self.added = []

    def list_messages(self, user_id, consultation_id):
        return list(self.earlier)

    def add_message(self, user_id, consultation_id, role, content, **kw):
        self.added.append({"role": role, "content": content, **kw})
        return {"id": f"m{len(self.added)}", "role": role, "content": content, "lang": kw.get("lang"), "inputMode": kw.get("input_mode")}

    def touch_consultation(self, *a, **kw):
        pass


@pytest.fixture
def chat(monkeypatch):
    def setup(earlier=(), offline=False):
        repo = FakeRepo(earlier)
        seen = {}

        def fake_triage(history, profile, provider=None, lang=None):
            seen["lang"] = lang
            seen["history"] = history
            return '{"severity": "LOW", "riskScore": 10, "advice": "Rest."}', offline
        monkeypatch.setattr(consultation_service, "repo", repo)
        monkeypatch.setattr(consultation_service.profile_repository, "get_profile", lambda uid: None)
        monkeypatch.setattr(consultation_service, "run_triage", fake_triage)
        return repo, seen
    return setup


def test_voice_message_reply_language_is_persisted_on_both(chat, monkeypatch):
    comprehend(monkeypatch, ("en", 0.99))
    repo, seen = chat()
    consultation_service.post_message("u", "c", "सीने में दर्द", lang="hi-IN", input_mode="voice")
    assert seen["lang"] == "hi-IN"
    user, bot = repo.added
    assert (user["lang"], user["input_mode"]) == ("hi-IN", "voice")
    assert bot["role"] == "assistant" and bot["lang"] == "hi-IN"


def test_switching_language_mid_conversation_follows_the_latest_message(chat, monkeypatch):
    comprehend(monkeypatch, ("en", 0.98))
    earlier = [{"role": "user", "content": "बुखार", "lang": "hi-IN"}, {"role": "assistant", "content": "{}", "lang": "hi-IN"}]
    repo, seen = chat(earlier)
    consultation_service.post_message("u", "c", "Now I also have a cough", input_mode="text")
    assert seen["lang"] == "en-IN"
    assert len(seen["history"]) == 3  # earlier turns + this one


def test_typed_low_confidence_uses_the_conversation_language(chat, monkeypatch):
    comprehend(monkeypatch, ("tl", 0.4))
    repo, seen = chat([{"role": "assistant", "content": "{}", "lang": "hi-IN"}])
    consultation_service.post_message("u", "c", "abhi bhi dard hai")
    assert seen["lang"] == "hi-IN"


def test_offline_fallback_reply_is_marked_english(chat, monkeypatch):
    comprehend(monkeypatch, None)
    repo, _ = chat(offline=True)
    consultation_service.post_message("u", "c", "दर्द", lang="hi-IN", input_mode="voice")
    assert repo.added[1]["lang"] == "en-IN"


def test_attachment_only_message_skips_language_detection(chat, monkeypatch):
    calls = comprehend(monkeypatch, ("en", 0.99))
    repo, seen = chat()
    consultation_service.post_message("u", "c", "", attachment_ids=["a1"])
    assert calls == [] and "lang" not in seen and repo.added[0]["lang"] is None


# --- the reply language survives a history in another language -------------

def test_latest_user_turn_carries_the_reply_language():
    from app.schemas.triage import Message

    history = [
        Message(role="user", content="मुझे बुखार है"),
        Message(role="assistant", content='{"advice": "आराम करें"}'),
        Message(role="user", content="I also have a headache"),
    ]
    sent = openai_provider.build_messages(history, None, "en-IN")
    assert sent[0]["role"] == "system" and "even if earlier messages" in sent[0]["content"]
    assert sent[1]["content"] == "मुझे बुखार है"  # earlier turns untouched
    assert sent[-1]["content"].startswith("I also have a headache")
    assert "Reply language for this answer: English (en-IN)" in sent[-1]["content"]
    assert history[-1].content == "I also have a headache"  # never stored


def test_no_reminder_without_a_language():
    from app.schemas.triage import Message

    sent = openai_provider.build_messages([Message(role="user", content="hi")], None, None)
    assert sent[-1]["content"] == "hi"


def test_english_directive_has_no_hindi_script_rule():
    assert "Devanagari" not in language_service.language_directive("en-IN")
    assert "Devanagari" in language_service.language_directive("hi-IN")


@pytest.mark.parametrize("lang,content,expected", [
    ("en-IN", "Rest and drink water.", "en"),
    ("hi-IN", "आराम करें", "hi"),
    ("hi-IN", "Aaram karein aur paani piyein", "hinglish"),
    (None, "anything", "en"),
    ("en-IN", "आराम करें", "hi"),  # mislabelled older reply: the script wins
])
def test_which_language_a_reply_already_is(lang, content, expected):
    assert language_service.target_of(lang, content) == expected
