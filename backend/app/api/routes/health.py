"""Health check endpoint."""

from __future__ import annotations

from typing import Callable

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core import config
from app.integrations.aws.dynamo_client import get_resource
from app.schemas.triage import HealthResponse

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


@router.get("/health/readiness", summary="Storage readiness check")
def readiness() -> JSONResponse:
    """Confirm that the configured DynamoDB tables and S3 buckets are usable.

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
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"ok": ready, "checks": checks},
    )
