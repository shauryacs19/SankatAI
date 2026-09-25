"""System health for the admin console: real probes only, cached for 60 s.

A dependency that cannot be checked is ``unavailable`` (never ``healthy``).
Responses carry service names, statuses, latencies and short reason codes;
never ARNs, hostnames, secrets or raw AWS error messages.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.api.routes.health import _ai_provider_status
from app.core import config
from app.integrations.aws import cloudwatch_metrics, cognito_admin
from app.integrations.aws.dynamo_client import get_resource
from app.services.analytics_service import metric, unavailable

CACHE_SECONDS = 60
_cache: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()
_failures: deque = deque(maxlen=20)


def _cached(key: str, compute: Callable[[], object]) -> object:
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1]
    value = compute()
    with _lock:
        _cache[key] = (time.monotonic(), value)
    return value


def clear_cache() -> None:
    with _lock:
        _cache.clear()
        _failures.clear()


def _probe(name: str, fn: Callable[[], Optional[str]]) -> dict:
    """Run fn; it returns None when healthy or a status string ('degraded:<why>')."""
    started = time.perf_counter()
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        outcome = fn()
        status, detail = ("healthy", None) if outcome is None else outcome.split(":", 1)
    except (BotoCoreError, ClientError, OSError) as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code") or type(error).__name__
        status, detail = "down", str(code)[:60]
    latency = round((time.perf_counter() - started) * 1000)
    result = {"name": name, "status": status, "latencyMs": latency, "checkedAt": checked_at, "detail": detail}
    if status in ("down", "degraded"):
        _failures.appendleft({"name": name, "status": status, "detail": detail, "at": checked_at})
    return result


def _s3():
    return boto3.client("s3", region_name=config.AWS_REGION,
                        config=Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}))


def _check_dynamodb() -> None:
    client = get_resource().meta.client
    for table in (config.USERS_TABLE, config.CHAT_HISTORY_TABLE, config.ATTACHMENTS_TABLE):
        client.describe_table(TableName=table)


def _check_s3() -> None:
    s3 = _s3()
    for bucket in (config.CHAT_BUCKET, config.DOCUMENTS_BUCKET):
        s3.head_bucket(Bucket=bucket)


def _check_cognito() -> Optional[str]:
    if not config.COGNITO_USER_POOL_ID:
        return "unavailable:COGNITO_USER_POOL_ID not configured"
    cognito_admin.describe_pool()
    return None


def _check_ai() -> Optional[str]:
    status = _ai_provider_status()
    if status == "ok":
        return None
    if status == "missing_key":
        return "degraded:no API key (answers use the offline keyword engine)"
    return f"down:{status}"


def _check_api_gateway() -> tuple[Optional[str], Optional[dict]]:
    if not cloudwatch_metrics.configured():
        return "unavailable:API_GATEWAY_ID not configured", None
    end = datetime.now(timezone.utc)
    stats = cloudwatch_metrics.api_metrics(end - timedelta(hours=1), end)
    if stats["count"] is None:
        return "unavailable:no traffic in the last hour", stats
    rate = (stats["err5xx"] or 0) / stats["count"] if stats["count"] else 0
    return (f"degraded:5xx rate {rate:.1%} in the last hour" if rate >= 0.05 else None), stats


def _compute_health() -> dict:
    checks = [
        {"name": "backend", "status": "healthy", "latencyMs": 0,
         "checkedAt": datetime.now(timezone.utc).isoformat(), "detail": "this response"},
        _probe("dynamodb", _check_dynamodb),
        _probe("s3", _check_s3),
        _probe("cognito", _check_cognito),
        _probe("ai_provider", _check_ai),
    ]
    api_stats: dict = {}

    def api_probe() -> Optional[str]:
        outcome, stats = _check_api_gateway()
        api_stats["last_hour"] = stats
        return outcome

    checks.append(_probe("api_gateway", api_probe))
    stats = api_stats.get("last_hour")
    return {
        "checks": checks,
        "apiGatewayLastHour": None if not stats else {
            "requests": stats["count"], "errors4xx": stats["err4xx"], "errors5xx": stats["err5xx"],
            "avgLatencyMs": None if stats["latency"] is None else round(stats["latency"]),
        },
        "recentFailures": list(_failures),
        "cachedForSeconds": CACHE_SECONDS,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def system_health() -> dict:
    return _cached("health", _compute_health)  # type: ignore[return-value]


def total_users() -> dict:
    """Cognito's estimated user count (the only user registry)."""
    if not config.COGNITO_USER_POOL_ID:
        return unavailable("COGNITO_USER_POOL_ID is not configured.")

    def compute() -> dict:
        try:
            return {**metric(cognito_admin.estimated_user_count()), "note": "Cognito estimate"}
        except (BotoCoreError, ClientError):
            return unavailable("Cognito could not be reached.")

    return _cached("total_users", compute)  # type: ignore[return-value]


def api_traffic(start: datetime, end: datetime) -> dict:
    """API Gateway totals for a window, as analytics metrics."""
    if not cloudwatch_metrics.configured():
        reason = "API_GATEWAY_ID is not configured."
        return {k: unavailable(reason) for k in ("requests", "errors4xx", "errors5xx", "avgLatencyMs")}

    def compute() -> dict:
        try:
            stats = cloudwatch_metrics.api_metrics(start, end)
        except (BotoCoreError, ClientError):
            reason = "CloudWatch could not be reached."
            return {k: unavailable(reason) for k in ("requests", "errors4xx", "errors5xx", "avgLatencyMs")}
        none = "No API traffic recorded by CloudWatch in this range."
        return {
            "requests": metric(stats["count"]) if stats["count"] is not None else unavailable(none),
            "errors4xx": metric(stats["err4xx"]) if stats["err4xx"] is not None else unavailable(none),
            "errors5xx": metric(stats["err5xx"]) if stats["err5xx"] is not None else unavailable(none),
            "avgLatencyMs": metric(round(stats["latency"])) if stats["latency"] is not None else unavailable(none),
        }

    return _cached(f"api:{start.isoformat()}:{end.isoformat()}", compute)  # type: ignore[return-value]
