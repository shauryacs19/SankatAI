"""POST /api/voice/session — presigned Amazon Transcribe Streaming URLs."""

from __future__ import annotations

import hashlib
import hmac
import logging
from urllib.parse import parse_qsl, quote, urlsplit

import pytest
from botocore.credentials import ReadOnlyCredentials
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.voice import router
from app.core import config
from app.integrations.aws import transcribe_presign
from app.services import voice_service

CREDS = ReadOnlyCredentials("AKIDEXAMPLE", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "session-token-EXAMPLE")
AUTH = {"x-user-id": "user-123"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "AWS_REGION", "ap-south-1")
    monkeypatch.setattr(config, "VOICE_ALLOWED_LANGS", ["en-IN", "hi-IN", "en-US"])
    monkeypatch.setattr(config, "VOICE_SESSIONS_PER_MINUTE", 3)
    monkeypatch.setattr(transcribe_presign, "_credentials", lambda: CREDS)
    voice_service._recent.clear()
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _expected_signature(url: str, secret: str) -> tuple[str, str]:
    """Recompute the SigV4 query signature independently, per the Transcribe
    WebSocket documentation, to prove the URL is signed the way AWS checks it."""
    parts = urlsplit(url)
    params = dict(parse_qsl(parts.query, keep_blank_values=True))
    signature = params.pop("X-Amz-Signature")
    enc = lambda v: quote(v, safe="-_.~")  # noqa: E731
    canonical_query = "&".join(f"{enc(k)}={enc(v)}" for k, v in sorted(params.items()))
    canonical_request = "\n".join([
        "GET", parts.path, canonical_query, f"host:{parts.netloc}\n", "host",
        hashlib.sha256(b"").hexdigest(),  # empty payload, not UNSIGNED-PAYLOAD
    ])
    amz_date = params["X-Amz-Date"]
    scope = params["X-Amz-Credential"].split("/", 1)[1]
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()])
    key = f"AWS4{secret}".encode()
    for part in scope.split("/"):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    return signature, hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()


def test_presign_has_transcribe_params_and_60s_expiry(client):
    res = client.post("/api/voice/session", json={"languageCode": "hi-IN"}, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["expiresIn"] == 60 and body["sampleRate"] == 16000 and body["languageCode"] == "hi-IN"
    assert res.headers["cache-control"] == "no-store"

    parts = urlsplit(body["url"])
    q = dict(parse_qsl(parts.query))
    assert parts.scheme == "wss"
    assert parts.netloc == "transcribestreaming.ap-south-1.amazonaws.com:8443"
    assert parts.path == "/stream-transcription-websocket"
    assert q["language-code"] == "hi-IN"
    assert q["media-encoding"] == "pcm"
    assert q["sample-rate"] == "16000"
    assert q["enable-partial-results-stabilization"] == "true"
    assert q["X-Amz-Expires"] == "60"
    assert q["X-Amz-Algorithm"] == "AWS4-HMAC-SHA256"
    assert q["X-Amz-SignedHeaders"] == "host"
    assert q["X-Amz-Credential"].startswith("AKIDEXAMPLE/") and q["X-Amz-Credential"].endswith("/ap-south-1/transcribe/aws4_request")
    assert q["X-Amz-Security-Token"] == "session-token-EXAMPLE"

    actual, expected = _expected_signature(body["url"], CREDS.secret_key)
    assert actual == expected


def test_defaults_to_en_in_without_body(client):
    res = client.post("/api/voice/session", headers=AUTH)
    assert res.status_code == 200
    assert dict(parse_qsl(urlsplit(res.json()["url"]).query))["language-code"] == "en-IN"


def test_rejects_unauthenticated(client):
    res = client.post("/api/voice/session", json={"languageCode": "en-IN"})
    assert res.status_code == 401


def test_rejects_language_outside_allowlist(client):
    res = client.post("/api/voice/session", json={"languageCode": "fr-FR"}, headers=AUTH)
    assert res.status_code == 400
    assert "Unsupported language" in res.json()["detail"]


def test_rate_limited_per_user(client):
    for _ in range(3):
        assert client.post("/api/voice/session", headers=AUTH).status_code == 200
    blocked = client.post("/api/voice/session", headers=AUTH)
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
    # Quota is per user.
    assert client.post("/api/voice/session", headers={"x-user-id": "someone-else"}).status_code == 200


def test_rate_limit_window_slides():
    voice_service._recent.clear()
    limit = config.VOICE_SESSIONS_PER_MINUTE
    for i in range(limit):
        assert voice_service._allow("u", now=100.0 + i)
    assert not voice_service._allow("u", now=159.0)
    assert voice_service._allow("u", now=160.5)  # the first issue has aged out


def test_logs_neither_url_token_nor_user(client, caplog):
    caplog.set_level(logging.INFO, logger="sankatai.voice")
    res = client.post("/api/voice/session", json={"languageCode": "en-IN"}, headers=AUTH)
    assert res.status_code == 200
    assert "Voice session issued" in caplog.text
    for secret in ("session-token-EXAMPLE", "X-Amz-Signature", "user-123"):
        assert secret not in caplog.text
