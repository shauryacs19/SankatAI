"""Triage feedback store (DynamoDB ``triage-feedback``, pk/sk, on-demand, TTL).

    pk = FB#<YYYY-MM of the reply>   sk = <reply created_at>#<message ref>   one row per rated reply
    pk = BANDIT                      sk = <arm>  (prompt#..., slot#...)      yes / no counters (ADD)

Rows hold no user id, email or name: ``session_id`` / ``message_ref`` are keyed
hashes and every free-text field is PII-scrubbed before it gets here. Retraining
reads one month partition at a time (Query, never Scan).
"""

from __future__ import annotations

from typing import Optional

from boto3.dynamodb.conditions import Key

from app.core import config
from app.integrations.aws.dynamo_client import get_resource

BANDIT_PK = "BANDIT"


def enabled() -> bool:
    return bool(config.TRIAGE_FEEDBACK_TABLE)


def _table():
    return get_resource().Table(config.TRIAGE_FEEDBACK_TABLE)


def put(item: dict) -> None:
    _table().put_item(Item=item)


def get(pk: str, sk: str) -> Optional[dict]:
    return _table().get_item(Key={"pk": pk, "sk": sk}).get("Item")


def delete(pk: str, sk: str) -> None:
    _table().delete_item(Key={"pk": pk, "sk": sk})


def add_counts(arm: str, yes: int = 0, no: int = 0) -> None:
    _table().update_item(
        Key={"pk": BANDIT_PK, "sk": arm},
        UpdateExpression="ADD #y :y, #n :n",
        ExpressionAttributeNames={"#y": "yes", "#n": "no"},
        ExpressionAttributeValues={":y": yes, ":n": no},
    )


def read_counts() -> dict[str, tuple[int, int]]:
    out: dict[str, tuple[int, int]] = {}
    kwargs = {"KeyConditionExpression": Key("pk").eq(BANDIT_PK)}
    while True:
        resp = _table().query(**kwargs)
        for item in resp.get("Items", []):
            out[item["sk"]] = (max(0, int(item.get("yes", 0))), max(0, int(item.get("no", 0))))
        if "LastEvaluatedKey" not in resp:
            return out
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
