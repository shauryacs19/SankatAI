"""Runtime configuration loaded from environment variables.

Secrets are supplied as Docker secrets, not environment variables. Compose
mounts each at ``/run/secrets/<name>`` and passes ``<VAR>_FILE`` pointing at it,
so the value never appears in ``docker inspect``, image layers, or the process
environment of a child shell. ``_secret()`` reads the file when ``<VAR>_FILE``
is set and falls back to a plain ``<VAR>`` env var for non-Docker runs.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

_log = logging.getLogger("sankatai.config")


def _secret(name: str, default: str = "") -> str:
    """Resolve ``name`` from ``<name>_FILE`` (Docker secret) then ``<name>``."""
    path = os.getenv(f"{name}_FILE")
    if path:
        try:
            value = Path(path).read_text(encoding="utf-8").strip()
            if value:
                return value
        except OSError:
            # Fall through to the env var so a missing mount degrades to the
            # normal "not configured" path rather than crashing at import.
            pass
    return os.getenv(name, default)


# --- AWS / region ---
AWS_REGION = os.getenv("AWS_REGION", os.getenv("COGNITO_REGION", "ap-south-1"))

# --- Authentication ---
# JWT validation happens at the API Gateway Cognito authorizer, not here. The
# backend trusts the x-user-id / x-user-email headers that API Gateway injects
# from the verified claims (see integrations/aws/cognito_auth.py).
#
# Set AUTH_ENABLED=false ONLY for local development without a gateway in front;
# it substitutes a fixed dev identity and accepts every request.
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() in {"1", "true", "yes"}

# Explicit origins are required for browser CORS preflight.
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

# --- DynamoDB ---
# Table names default to the Terraform naming scheme (project_name-*).
PROJECT_NAME = os.getenv("PROJECT_NAME", "sankatai-dev")
USERS_TABLE = os.getenv("USERS_TABLE", f"{PROJECT_NAME}-users")
CHAT_HISTORY_TABLE = os.getenv("CHAT_HISTORY_TABLE", f"{PROJECT_NAME}-chat-history")

# Optional endpoint override for DynamoDB Local (e.g. http://dynamodb-local:8000).
DYNAMODB_ENDPOINT_URL = os.getenv("DYNAMODB_ENDPOINT_URL") or None

# Auto-create tables on startup (only meaningful for DynamoDB Local / dev).
DYNAMODB_AUTO_CREATE = os.getenv("DYNAMODB_AUTO_CREATE", "").lower() in {"1", "true", "yes"}

# --- S3 uploads (attachments) ---
# Two buckets (create them yourself in AWS, each with its own lifecycle rules):
#   CHAT_BUCKET      — files uploaded during a chat (keys under photos/ and
#                      documents/). Transient.
#   DOCUMENTS_BUCKET — the Documents-tab vault. Objects live under photos/ and
#                      documents/ prefixes (by kind). Retained.
# NOTE: presigned S3 uploads require REAL AWS credentials + real buckets. They do
# not work against DynamoDB Local's fake "local" credentials.
CHAT_BUCKET = os.getenv("CHAT_BUCKET", f"{PROJECT_NAME}-chat-uploads")
DOCUMENTS_BUCKET = os.getenv("DOCUMENTS_BUCKET", f"{PROJECT_NAME}-file-storage")

# DynamoDB table holding attachment metadata (which file belongs to which user
# and chat). Key schema: hash `user_id` (S) + range `attachment_id` (S).
ATTACHMENTS_TABLE = os.getenv("ATTACHMENTS_TABLE", f"{PROJECT_NAME}-attachments")

# Pre-signed URL lifetime, in seconds (default 15 minutes).
PRESIGN_EXPIRY = int(os.getenv("PRESIGN_EXPIRY", "900"))


# --- AI provider (OpenAI-compatible endpoint) ---
# The key lives in the `openai_api_key` Docker secret. `ai_provider` and
# `triage_service` read OPENAI_API_KEY from the process environment, so when it
# arrives as a secret we materialise it here, once, and those call sites stay
# unchanged.
#
# The default endpoint is **Ollama Cloud**, which speaks the OpenAI protocol at
# https://ollama.com/v1 — so the existing `openai` SDK is reused, no new
# dependency. Point AI_BASE_URL at https://api.openai.com/v1 (and AI_MODEL at a
# GPT model) to switch back to OpenAI without a code change.
OPENAI_API_KEY = _secret("OPENAI_API_KEY")
if OPENAI_API_KEY:
    os.environ["OPENAI_API_KEY"] = OPENAI_API_KEY

AI_BASE_URL = os.getenv("AI_BASE_URL", "https://ollama.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "gpt-oss:120b")
AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "30"))  # cloud models are slower than gpt-4o-mini


# --- Voice input (Amazon Transcribe Streaming) ---
# The backend only PRESIGNS a WebSocket URL — a local SigV4 computation with the
# instance-role credentials, no network call. Clients stream audio straight to
# Transcribe, so no audio or transcript ever passes through this service.
# Transcribe identifies the spoken language among VOICE_LANGUAGE_OPTIONS.
VOICE_MAX_SECONDS = int(os.getenv("VOICE_MAX_SECONDS", "60"))  # client auto-stops recording
VOICE_SESSIONS_PER_MINUTE = int(os.getenv("VOICE_SESSIONS_PER_MINUTE", "10"))  # per user
VOICE_URL_EXPIRY = 60  # seconds; only has to outlive the WebSocket handshake
VOICE_SAMPLE_RATE = 16000  # 16 kHz mono signed 16-bit little-endian PCM

# --- Text-to-speech (Amazon Polly) ---
# locale -> Polly voice. Kajal (neural) is bilingual en-IN/hi-IN; verified in
# ap-south-1 on 2026-09-24. Unmapped locales fall back to en-IN.
_DEFAULT_TTS_VOICE_MAP = {
    "en-IN": {"VoiceId": "Kajal", "Engine": "neural", "LanguageCode": "en-IN"},
    "hi-IN": {"VoiceId": "Kajal", "Engine": "neural", "LanguageCode": "hi-IN"},
}


def _json_env(name: str, default: dict) -> dict:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) and value else default
    except json.JSONDecodeError:
        _log.error("%s is not valid JSON; using the default.", name)
        return default


TTS_VOICE_MAP = _json_env("TTS_VOICE_MAP", _DEFAULT_TTS_VOICE_MAP)
TTS_DEFAULT_LANGUAGE = "en-IN"
TTS_REQUESTS_PER_MINUTE = int(os.getenv("TTS_REQUESTS_PER_MINUTE", "20"))  # per user
# Optional cache of synthesized MP3s, keyed by sha256(text+voice), under tts/ in
# a private bucket (default: the chat-uploads bucket, which has a 7-day tts/
# lifecycle rule). Served back via a short-lived presigned GET.
TTS_CACHE_ENABLED = os.getenv("TTS_CACHE_ENABLED", "").lower() in {"1", "true", "yes"}
TTS_CACHE_BUCKET = os.getenv("TTS_CACHE_BUCKET", CHAT_BUCKET)

# Streaming language identification supports these (AWS docs); an option must
# ALSO have a Polly voice above, so replies can be read aloud in it.
TRANSCRIBE_LID_LANGS = {
    "de-DE", "en-AU", "en-GB", "en-IN", "en-US", "es-US", "fr-CA", "fr-FR",
    "hi-IN", "it-IT", "ja-JP", "ko-KR", "pt-BR", "zh-CN",
}
_DEFAULT_VOICE_LANGUAGE_OPTIONS = ["en-IN", "hi-IN"]


def _voice_language_options() -> list[str]:
    """VOICE_LANGUAGE_OPTIONS, validated: >= 2 options, one dialect per language,
    each supported by Transcribe LID and mapped to a Polly voice. A bad value
    logs why and falls back to the default instead of breaking voice input."""
    options = [o.strip() for o in os.getenv("VOICE_LANGUAGE_OPTIONS", ",".join(_DEFAULT_VOICE_LANGUAGE_OPTIONS)).split(",") if o.strip()]
    problems = []
    if len(options) < 2:
        problems.append("needs at least 2 options")
    bases = [o.split("-")[0].lower() for o in options]
    if len(set(bases)) != len(bases):
        problems.append("only one dialect per language")
    unsupported = [o for o in options if o not in TRANSCRIBE_LID_LANGS or o not in TTS_VOICE_MAP]
    if unsupported:
        problems.append(f"unsupported by Transcribe LID or TTS_VOICE_MAP: {unsupported}")
    if problems:
        _log.error("VOICE_LANGUAGE_OPTIONS rejected (%s); using %s.", "; ".join(problems), _DEFAULT_VOICE_LANGUAGE_OPTIONS)
        return list(_DEFAULT_VOICE_LANGUAGE_OPTIONS)
    return options


VOICE_LANGUAGE_OPTIONS = _voice_language_options()
VOICE_PREFERRED_LANGUAGE = os.getenv("VOICE_PREFERRED_LANGUAGE", "en-IN").strip()
if VOICE_PREFERRED_LANGUAGE not in VOICE_LANGUAGE_OPTIONS:
    VOICE_PREFERRED_LANGUAGE = VOICE_LANGUAGE_OPTIONS[0]
# Optional custom vocabularies, one per language option, in the same order.
VOICE_VOCABULARY_NAMES = [v.strip() for v in os.getenv("VOICE_VOCABULARY_NAMES", "").split(",") if v.strip()]
