"""Health check endpoint."""

from __future__ import annotations

import os
import time
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core import config
from app.integrations.aws.dynamo_client import get_resource
from app.schemas.triage import HealthResponse
from app.services.triage_service import ai_key_configured

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Health check")
def health() -> HealthResponse:
    """Returns whether the backend is up and running."""
    return HealthResponse(ok=True, status="Sankat AI Backend is Live")


def _check(check: Callable[[], None]) -> bool:
    """Run one dependency probe without exposing AWS errors to clients."""
    try:
        check()
        return True
    except (BotoCoreError, ClientError, OSError):
        return False


_AI_PROBE_TTL = 300.0  # seconds; keeps the probe off the provider's rate limit
_ai_probe_cache: dict = {"at": 0.0, "status": None}


def _ai_provider_status() -> str:
    """Non-secret check that the AI key is accepted. Cached for 5 minutes.

    Ollama's public ``/v1/models`` answers 200 even with a bogus key, so it
    cannot detect a bad token. ``POST /api/me`` does authenticate and costs no
    tokens. Returns ``ok``, ``missing_key``, ``auth_rejected``, ``unreachable``
    or ``http_<code>``.
    """
    if not ai_key_configured():
        return "missing_key"
    now = time.monotonic()
    if _ai_probe_cache["status"] and now - _ai_probe_cache["at"] < _AI_PROBE_TTL:
        return _ai_probe_cache["status"]

    base = urlsplit(config.AI_BASE_URL)
    # stdlib on purpose: openai>=3 no longer pulls in httpx.
    probe = Request(
        f"{base.scheme}://{base.netloc}/api/me",
        data=b"",
        method="POST",
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
    )
    try:
        with urlopen(probe, timeout=5):  # noqa: S310 - scheme comes from our config
            result = "ok"
    except HTTPError as error:
        result = "auth_rejected" if error.code in (401, 403) else f"http_{error.code}"
    except (URLError, OSError):
        result = "unreachable"
    _ai_probe_cache.update(at=now, status=result)
    return result


@router.get("/health/readiness", summary="Storage readiness check")
def readiness() -> JSONResponse:
    """Confirm storage is usable, and report whether the AI provider accepts the key.

    This is intentionally separate from ``/health`` so a load balancer can keep
    using a fast process liveness probe. It performs metadata-only AWS calls;
    no patient data is read or written.
    """
    dynamodb = get_resource().meta.client
    s3 = boto3.client(
        "s3",
        region_name=config.AWS_REGION,
        config=Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}),
    )

    checks = {
        "dynamodb_users": _check(lambda: dynamodb.describe_table(TableName=config.USERS_TABLE)),
        "dynamodb_chat_history": _check(lambda: dynamodb.describe_table(TableName=config.CHAT_HISTORY_TABLE)),
        "dynamodb_attachments": _check(lambda: dynamodb.describe_table(TableName=config.ATTACHMENTS_TABLE)),
        "s3_chat_uploads": _check(lambda: s3.head_bucket(Bucket=config.CHAT_BUCKET)),
        "s3_documents": _check(lambda: s3.head_bucket(Bucket=config.DOCUMENTS_BUCKET)),
    }
    ready = all(checks.values())
    # Reported separately: a broken AI key degrades answers to the offline
    # keyword engine but does not make the service unready.
    ai = _ai_provider_status()
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "ok": ready,
            "checks": checks,
            "aiProvider": ai,
            "aiMode": "online" if ai == "ok" else "offline_fallback",
        },
    )
