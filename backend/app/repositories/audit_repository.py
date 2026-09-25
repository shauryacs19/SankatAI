"""Admin audit log persistence (append-only).

Table ``admin-audit-log``: hash ``pk = AUDIT#<YYYY-MM>``, range
``sk = <iso-ts>#<uuid>``. The backend role holds ONLY ``PutItem`` + ``Query``
on it (no Update/Delete), and every put is conditional on the key not existing,
so the application cannot rewrite history either.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from boto3.dynamodb.conditions import Key

from app.integrations.aws.dynamo_client import get_audit_table


def month_pk(month: str) -> str:
    return f"AUDIT#{month}"


def append(entry: dict) -> dict:
    now = datetime.now(timezone.utc)
    item = {
        "pk": month_pk(now.strftime("%Y-%m")),
        "sk": f"{now.isoformat()}#{uuid.uuid4().hex}",
        "ts": now.isoformat(),
        **{k: v for k, v in entry.items() if v is not None},
    }
    get_audit_table().put_item(Item=item, ConditionExpression="attribute_not_exists(pk)")
    return item


def query_month(month: str, limit: int, start_key: Optional[dict] = None) -> tuple[list[dict], Optional[dict]]:
    kwargs = {
        "KeyConditionExpression": Key("pk").eq(month_pk(month)),
        "ScanIndexForward": False,  # newest first
        "Limit": limit,
    }
    if start_key:
        kwargs["ExclusiveStartKey"] = start_key
    resp = get_audit_table().query(**kwargs)
    return resp.get("Items", []), resp.get("LastEvaluatedKey")
