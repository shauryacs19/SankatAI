"""Model-reply JSON extraction (openai_provider._extract_json)."""

from app.integrations.ai.openai_provider import _extract_json


def test_thought_block_with_braces_is_dropped():
    # Gemma 4 on the Gemini API: thinking comes inline, can't be disabled, and may quote JSON.
    reply = '<thought>* Format: {"ok": true}? Yes.</thought>{\n  "severity": "LOW",\n  "riskScore": 20\n}'
    assert _extract_json(reply) == '{\n  "severity": "LOW",\n  "riskScore": 20\n}'


def test_think_tag_and_fence():
    assert _extract_json('<think>hmm {x}</think>\n```json\n{"a": 1}\n```') == '{"a": 1}'


def test_plain_and_wrapped_replies_unchanged():
    assert _extract_json('{"a": 1}') == '{"a": 1}'
    assert _extract_json('Here you go: {"a": 1} thanks') == '{"a": 1}'
    assert _extract_json("") == "{}"
    assert _extract_json(None) == "{}"


class _FakeCompletions:
    def __init__(self):
        self.models = []

    def create(self, **kw):
        self.models.append(kw["model"])
        msg = type("M", (), {"content": '<thought>{"no": 1}</thought>{"ok": true}'})
        return type("R", (), {"choices": [type("C", (), {"message": msg})]})


def _fake_provider(monkeypatch):
    from types import SimpleNamespace

    from app.core import config
    from app.integrations.ai import openai_provider as op

    completions = _FakeCompletions()
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions), with_options=lambda **_: client)
    provider = op.OpenAIProvider()
    monkeypatch.setattr(op.OpenAIProvider, "_client", lambda self: client)
    monkeypatch.setattr(config, "AI_MODEL", "task-model")
    monkeypatch.setattr(config, "AI_CHAT_MODEL", "chat-model")
    return provider, completions


def test_chat_uses_chat_model_and_tasks_use_ai_model(monkeypatch):
    from app.schemas.triage import Message

    provider, completions = _fake_provider(monkeypatch)
    assert provider.analyze([Message(role="user", content="headache")], None) == '{"ok": true}'
    assert provider.generate([{"role": "user", "content": "x"}], model="chat-model", timeout=5) == '{"ok": true}'
    assert provider.generate([{"role": "user", "content": "x"}], seed=1) == '{"ok": true}'
    assert provider.translate('{"advice": "rest"}', next(iter(__import__("app.services.language_service", fromlist=["x"]).TRANSLATION_TARGETS))) == '{"ok": true}'
    assert completions.models == ["chat-model", "chat-model", "task-model", "task-model"]
