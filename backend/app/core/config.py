"""Runtime configuration loaded from environment variables.

Secrets are supplied as Docker secrets, not environment variables. Compose
mounts each at ``/run/secrets/<name>`` and passes ``<VAR>_FILE`` pointing at it,
so the value never appears in ``docker inspect``, image layers, or the process
environment of a child shell. ``_secret()`` reads the file when ``<VAR>_FILE``
is set and falls back to a plain ``<VAR>`` env var for non-Docker runs.
"""

from __future__ import annotations

import os
from pathlib import Path


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
