"""POST /api/consultations/{id}/messages/{id}/translate — the reply's
English / Hindi / Hinglish cycle."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.consultations import router
from app.core import config
from app.services import translation_service

AUTH = {"x-user-id": "owner"}
URL = "/api/consultations/c1/messages/m1/translate"
REPLY = json.dumps({
    "reasoning": "Likely a viral fever.", "followUpQuestions": ["How high is it?"],
    "severity": "MODERATE", "riskScore": 40, "advice": "Rest and drink water.", "disclaimer": "AI Estimate. Not medical advice.",
})


class FakeProvider:
    def __init__(self):
        self.calls = []
        self.reply = None

    def translate(self, payload, target):
        self.calls.append((json.loads(payload), target))
        if self.reply is not None:
            return self.reply
        data = json.loads(payload)
        out = {k: (f"[{target}] {v}" if isinstance(v, str) else v) for k, v in data.items()}
        if "followUpQuestions" in data:
            out["followUpQuestions"] = [f"[{target}] {q}" for q in data["followUpQuestions"]]
        out["severity"] = "LOW"  # a model trying to change the assessment
        out["riskScore"] = 5
        return json.dumps(out, ensure_ascii=False)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "TRANSLATIONS_PER_MINUTE", 3)
    translation_service.limiter.reset()
    items = {("owner", "c1", "m1"): {"chat_id": "MSG#c1#t#m1", "role": "assistant", "content": REPLY, "lang": "en-IN"}}
    saved = []

    def get_message(u, c, m):
        return items.get((u, c, m))

    def save_translation(u, chat_id, target, content):
        saved.append((u, chat_id, target))
        items[("owner", "c1", "m1")][f"translation_{target}"] = content

    monkeypatch.setattr(translation_service.repo, "get_message", get_message)
    monkeypatch.setattr(translation_service.repo, "save_translation", save_translation)
    provider = FakeProvider()
    monkeypatch.setattr(translation_service, "get_provider", lambda: provider)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), items, saved, provider


def test_translates_text_but_never_the_assessment(env):
    client, _, saved, provider = env
    res = client.post(URL, json={"target": "hi"}, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["target"] == "hi" and body["lang"] == "hi-IN"
    reply = json.loads(body["content"])
    assert reply["advice"] == "[hi] Rest and drink water."
    assert reply["followUpQuestions"] == ["[hi] How high is it?"]
    assert (reply["severity"], reply["riskScore"]) == ("MODERATE", 40)
    assert saved == [("owner", "MSG#c1#t#m1", "hi")]
    assert provider.calls[0][1] == "hi"


def test_second_request_is_served_from_the_cache(env):
    client, _, _, provider = env
    first = client.post(URL, json={"target": "hinglish"}, headers=AUTH).json()
    again = client.post(URL, json={"target": "hinglish"}, headers=AUTH).json()
    assert first["content"] == again["content"] and len(provider.calls) == 1
    assert again["lang"] == "en-IN"  # Hinglish is read aloud with the Indian English voice


def test_the_reply_language_returns_the_original_without_a_model_call(env):
    client, _, _, provider = env
    res = client.post(URL, json={"target": "en"}, headers=AUTH)
    assert res.json()["content"] == REPLY and provider.calls == []


def test_only_the_callers_assistant_replies(env):
    client, items, _, _ = env
    assert client.post("/api/consultations/c1/messages/nope/translate", json={"target": "hi"}, headers=AUTH).status_code == 404
    assert client.post(URL, json={"target": "hi"}, headers={"x-user-id": "someone-else"}).status_code == 404
    items[("owner", "c1", "m1")]["role"] = "user"
    assert client.post(URL, json={"target": "hi"}, headers=AUTH).status_code == 400


def test_rejects_unknown_languages(env):
    client, _, _, _ = env
    assert client.post(URL, json={"target": "fr"}, headers=AUTH).status_code == 422


def test_model_failure_is_a_clean_503_and_nothing_is_cached(env):
    client, _, saved, provider = env
    provider.reply = "not json"
    res = client.post(URL, json={"target": "hi"}, headers=AUTH)
    assert res.status_code == 503 and saved == []


def test_rate_limited(env):
    client, items, _, _ = env
    codes = []
    for target in ("hi", "hinglish"):
        items[("owner", "c1", "m1")].pop(f"translation_{target}", None)
    for _ in range(4):
        for key in ("translation_hi",):
            items[("owner", "c1", "m1")].pop(key, None)
        codes.append(client.post(URL, json={"target": "hi"}, headers=AUTH).status_code)
    assert codes == [200, 200, 200, 429]


def test_plain_text_replies_translate_too(env):
    client, items, _, _ = env
    items[("owner", "c1", "m1")]["content"] = "Please see a doctor."
    res = client.post(URL, json={"target": "hi"}, headers=AUTH)
    assert res.json()["content"] == "[hi] Please see a doctor."
