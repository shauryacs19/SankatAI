"""POST /api/tts — read an assistant reply aloud with Amazon Polly."""

from __future__ import annotations

import json
import logging

import pytest
from botocore.exceptions import ClientError
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.tts import router
from app.core import config
from app.integrations.aws import polly_tts
from app.services import tts_service

AUTH = {"x-user-id": "owner"}
BODY = {"consultationId": "c1", "messageId": "m1"}
ADVICE = json.dumps({"severity": "HIGH", "riskScore": 80, "advice": "**Go to the ER now.** See https://example.org 🚑"})


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "TTS_CACHE_ENABLED", False)
    monkeypatch.setattr(config, "TTS_REQUESTS_PER_MINUTE", 5)
    monkeypatch.setattr(config, "TTS_VOICE_MAP", {
        "en-IN": {"VoiceId": "Kajal", "Engine": "neural", "LanguageCode": "en-IN"},
        "hi-IN": {"VoiceId": "Kajal", "Engine": "neural", "LanguageCode": "hi-IN"},
    })
    tts_service.limiter.reset()
    messages = {("owner", "c1", "m1"): {"role": "assistant", "content": ADVICE, "lang": "hi-IN"}}
    monkeypatch.setattr(tts_service.repo, "get_message", lambda u, c, m: messages.get((u, c, m)))
    calls = []

    def fake_synthesize(text, voice):
        calls.append((text, voice))
        return f"<mp3:{len(calls)}>".encode()
    monkeypatch.setattr(polly_tts, "synthesize", fake_synthesize)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), messages, calls


def test_streams_mp3_in_the_message_language(env):
    client, _, calls = env
    res = client.post("/api/tts", json=BODY, headers=AUTH)
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/mpeg"
    assert res.headers["cache-control"] == "private, no-store"
    assert res.content == b"<mp3:1>"
    text, voice = calls[0]
    assert text == "Go to the ER now. See"  # markdown, URL and emoji stripped
    assert voice["LanguageCode"] == "hi-IN"


def test_rejects_unauthenticated(env):
    client, _, calls = env
    assert client.post("/api/tts", json=BODY).status_code == 401
    assert calls == []


def test_rejects_messages_the_user_does_not_own(env):
    client, _, calls = env
    assert client.post("/api/tts", json=BODY, headers={"x-user-id": "intruder"}).status_code == 404
    assert calls == []


def test_only_assistant_replies_are_spoken(env):
    client, messages, _ = env
    messages[("owner", "c1", "m1")] = {"role": "user", "content": "hello"}
    assert client.post("/api/tts", json=BODY, headers=AUTH).status_code == 400


def test_does_not_accept_arbitrary_text(env):
    client, _, calls = env
    res = client.post("/api/tts", json={**BODY, "text": "say this instead"}, headers=AUTH)
    assert res.status_code == 200
    assert "say this instead" not in calls[0][0]


def test_long_replies_are_chunked_in_order(env):
    client, messages, calls = env
    sentence = "Keep the patient warm and still. "
    messages[("owner", "c1", "m1")] = {"role": "assistant", "content": json.dumps({"advice": sentence * 200}), "lang": "en-IN"}
    res = client.post("/api/tts", json=BODY, headers=AUTH)
    assert len(calls) == 3
    assert all(len(text) <= 2500 for text, _ in calls)
    assert res.content == b"<mp3:1><mp3:2><mp3:3>"


def test_unmapped_language_falls_back_to_en_in(env):
    client, messages, calls = env
    messages[("owner", "c1", "m1")] = {"role": "assistant", "content": ADVICE, "lang": "ta-IN"}
    client.post("/api/tts", json=BODY, headers=AUTH)
    assert calls[0][1]["LanguageCode"] == "en-IN"


def test_rate_limited(env):
    client, _, _ = env
    for _ in range(5):
        assert client.post("/api/tts", json=BODY, headers=AUTH).status_code == 200
    assert client.post("/api/tts", json=BODY, headers=AUTH).status_code == 429


def test_polly_failure_is_a_clean_503(env, monkeypatch):
    client, _, _ = env

    def boom(text, voice):
        raise ClientError({"Error": {"Code": "ServiceFailure", "Message": "x"}}, "SynthesizeSpeech")
    monkeypatch.setattr(polly_tts, "synthesize", boom)
    assert client.post("/api/tts", json=BODY, headers=AUTH).status_code == 503


def test_cache_redirects_to_a_presigned_get(env, monkeypatch):
    client, _, calls = env
    monkeypatch.setattr(config, "TTS_CACHE_ENABLED", True)
    monkeypatch.setattr(config, "TTS_CACHE_BUCKET", "bucket")
    stored = {}
    monkeypatch.setattr(polly_tts, "cache_exists", lambda b, k: k in stored)
    monkeypatch.setattr(polly_tts, "cache_put", lambda b, k, audio: stored.__setitem__(k, audio))
    monkeypatch.setattr(polly_tts, "cache_url", lambda b, k: f"https://s3.test/{k}?sig")
    first = client.post("/api/tts", json=BODY, headers=AUTH, follow_redirects=False)
    second = client.post("/api/tts", json=BODY, headers=AUTH, follow_redirects=False)
    assert first.status_code == second.status_code == 307
    key = next(iter(stored))
    assert key.startswith("tts/") and key.endswith(".mp3")
    assert first.headers["location"] == f"https://s3.test/{key}?sig"
    assert len(calls) == 1  # the second request was a cache hit


def test_text_cleaning_and_chunking_units():
    assert tts_service.clean_text("# Title\n- **bold** `code` [link](http://x) ```py\nx=1\n``` 😀 www.a.com") == "Title bold code link"
    assert tts_service.speakable_text(json.dumps({"followUpQuestions": ["How high?", "Any rash?"]})) == "How high? Any rash?"
    assert tts_service.speakable_text("plain text") == "plain text"
    chunks = tts_service.chunk_text("एक। दो। " * 10, limit=20)
    assert all(len(c) <= 20 for c in chunks) and "".join(chunks).replace(" ", "") == ("एक।दो।" * 10)


def test_logs_no_message_text(env, caplog):
    client, _, _ = env
    caplog.set_level(logging.INFO, logger="sankatai.tts")
    client.post("/api/tts", json=BODY, headers=AUTH)
    assert "TTS requested" in caplog.text and "ER now" not in caplog.text
