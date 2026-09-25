"""One-time backfill of the analytics aggregates from existing data. Operator-run.

Reads (projections only, never message text or file names):
  chat-history  consultation rows -> chats_created
                assistant rows    -> ai_requests/ai_responses/ai_failed,
                                     triage_<severity>, emergency_cases,
                                     feedback_up/down (by feedback_at)
                user voice rows   -> ai_requests_voice (text = rest)
  attachments   uploaded rows     -> uploads_vault / uploads_chat
  Cognito       ListUsers         -> users_new by UserCreateDate, plus a
                                     first-seen marker per user

Only rows older than META/LIVE_SINCE (the moment live tracking started) are
counted, and they are ADDed, so live counts are never double counted. A
META/BACKFILL claim makes it run once; users are marked first-seen here so the
live emitter never mistakes an existing user for a new one. AI response time
and distinct active users/conversations were never recorded before, so they
start at LIVE_SINCE and are shown as not recorded before that.

Needs ANALYTICS_SALT identical to the backend's (or ANALYTICS_SALT_SECRET_ID to
read it from Secrets Manager), and every table name, e.g. (from backend/):
    ANALYTICS_SALT_SECRET_ID=sankatai/dev/analytics_salt COGNITO_USER_POOL_ID=... \\
    CHAT_HISTORY_TABLE=sankatai-chat-history ATTACHMENTS_TABLE=sankatai-attachments \\
    ANALYTICS_AGG_TABLE=sankatai-analytics-daily-agg AWS_REGION=ap-south-1 \\
    python -m scripts.backfill_analytics
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

REQUIRED = ("COGNITO_USER_POOL_ID", "CHAT_HISTORY_TABLE", "ATTACHMENTS_TABLE", "ANALYTICS_AGG_TABLE")


def _load_salt() -> None:
    if os.getenv("ANALYTICS_SALT") or not os.getenv("ANALYTICS_SALT_SECRET_ID"):
        return
    import boto3

    value = boto3.client("secretsmanager", region_name=os.getenv("AWS_REGION", "ap-south-1")).get_secret_value(
        SecretId=os.environ["ANALYTICS_SALT_SECRET_ID"])["SecretString"]
    os.environ["ANALYTICS_SALT"] = value.strip()


def _scan(table, projection: str, names: dict):
    kwargs = {"ProjectionExpression": projection, "ExpressionAttributeNames": names}
    while True:
        resp = table.scan(**kwargs)
        yield from resp.get("Items", [])
        if "LastEvaluatedKey" not in resp:
            return
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def main() -> int:
    missing = [name for name in REQUIRED if not os.getenv(name)]
    if missing:
        print(f"Missing env: {', '.join(missing)} (see the module docstring).", file=sys.stderr)
        return 2
    _load_salt()

    from app.core import config
    from app.integrations.aws import cognito_admin
    from app.integrations.aws.dynamo_client import get_chat_table, get_resource
    from app.repositories import analytics_repository as repo
    from app.services import analytics_service as a

    if not config.ANALYTICS_SALT:
        print("ANALYTICS_SALT is not set (or is PLACEHOLDER). Set the real salt first.", file=sys.stderr)
        return 2

    now_iso = datetime.now(timezone.utc).isoformat()
    claim = repo.put_meta_if_absent("BACKFILL", {"status": "in_progress", "started_at": now_iso})
    if claim.get("started_at") != now_iso:
        print(f"Backfill already {claim.get('status')} (started {claim.get('started_at')}). Nothing to do.")
        return 0 if claim.get("status") == "done" else 1

    cutoff = repo.put_meta_if_absent("LIVE_SINCE", {"ts": now_iso})["ts"]
    cutoff_local = a.to_local(cutoff)
    hourly_from = cutoff_local - timedelta(days=7)
    daily: dict[tuple[str, str], int] = defaultdict(int)
    hourly: dict[tuple[str, str], int] = defaultdict(int)
    earliest: list[str] = []

    def count(metric: str, ts) -> None:
        if not ts or str(ts) >= cutoff:
            return
        when = a.to_local(str(ts))
        daily[(metric, a.day_key(when))] += 1
        if when >= hourly_from:
            hourly[(metric, a.hour_key(when))] += 1
        earliest.append(a.day_key(when))

    projection = "chat_id, #role, severity, feedback, feedback_at, created_at, input_mode, offline_fallback"
    for item in _scan(get_chat_table(), projection, {"#role": "role"}):
        key, created = str(item.get("chat_id", "")), item.get("created_at")
        if key.startswith("CONSULT#"):
            count("chats_created", created)
        elif item.get("role") == "assistant":
            count("ai_requests", created)
            count("ai_failed" if item.get("offline_fallback") else "ai_responses", created)
            if item.get("severity") in a.SEVERITIES:
                count("triage_total", created)
                count(f"triage_{item['severity'].lower()}", created)
                if item["severity"] == "EMERGENCY":
                    count("emergency_cases", created)
            if item.get("feedback") in ("like", "dislike"):
                count("feedback_up" if item["feedback"] == "like" else "feedback_down", item.get("feedback_at"))
        elif item.get("role") == "user" and item.get("input_mode") == "voice":
            count("ai_requests_voice", created)

    attachments = get_resource().Table(config.ATTACHMENTS_TABLE)
    for item in _scan(attachments, "#s, #scope, created_at", {"#s": "status", "#scope": "scope"}):
        if item.get("status") == "uploaded" and item.get("scope") in ("vault", "chat"):
            count(f"uploads_{item['scope']}", item.get("created_at"))

    # Text requests = every AI request that was not a voice message.
    for (metric, day), n in list(daily.items()):
        if metric == "ai_requests":
            daily[("ai_requests_text", day)] = max(0, n - daily.get(("ai_requests_voice", day), 0))
    for (metric, hour), n in list(hourly.items()):
        if metric == "ai_requests":
            hourly[("ai_requests_text", hour)] = max(0, n - hourly.get(("ai_requests_voice", hour), 0))

    # Users: every existing Cognito user gets a first-seen marker; each marker
    # created here counts on the day the account was created.
    users_marked = 0
    paginator = cognito_admin.client().get_paginator("list_users")
    for page in paginator.paginate(UserPoolId=config.COGNITO_USER_POOL_ID, AttributesToGet=["sub"]):
        for user in page.get("Users", []):
            sub = next((x["Value"] for x in user.get("Attributes", []) if x["Name"] == "sub"), None)
            created = user.get("UserCreateDate")
            if not sub or not created:
                continue
            when = a.to_local(created)
            if repo.mark_first_seen(a.user_hash(sub), a.day_key(when)):
                users_marked += 1
                daily[("users_new", a.day_key(when))] += 1
                if when >= hourly_from:
                    hourly[("users_new", a.hour_key(when))] += 1
                earliest.append(a.day_key(when))

    totals: dict[str, int] = defaultdict(int)
    for (metric, day), n in daily.items():
        if n:
            repo.add_counter(repo.metric_pk(metric), day, n)
            totals[metric] += n
    hourly_ttl = int(datetime.now(timezone.utc).timestamp()) + 8 * 86400
    for (metric, hour), n in hourly.items():
        if n:
            repo.add_counter(repo.metric_pk(metric, hourly=True), hour, n, ttl=hourly_ttl)
    for metric, n in totals.items():
        repo.add_counter(repo.metric_pk(metric), repo.TOTAL_SK, n)

    # The sources hold full history, so every backfilled metric is "recorded"
    # (zero where nothing happened) from the platform's first activity.
    platform_start = min(earliest) if earliest else a.day_key(cutoff_local)
    backfilled = {
        "users_new", "chats_created", "ai_requests", "ai_requests_text", "ai_requests_voice", "ai_responses",
        "ai_failed", "triage_total", "emergency_cases", "feedback_up", "feedback_down", "uploads_vault",
        "uploads_chat", *[f"triage_{s.lower()}" for s in a.SEVERITIES],
    }
    for metric in backfilled:
        repo.lower_since(metric, platform_start)

    repo.put_meta("BACKFILL", {"status": "done", "started_at": now_iso,
                               "finished_at": datetime.now(timezone.utc).isoformat(), "cutoff": cutoff})
    print(f"Backfill done. Cutoff {cutoff}; platform start {platform_start}; "
          f"{users_marked} users marked; totals: {dict(sorted(totals.items()))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
