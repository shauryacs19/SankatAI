"""Platform analytics persistence: raw events + pre-aggregated counters.

``analytics-events`` (hash ``event_id``, TTL ``ttl``) keeps the raw, already
pseudonymised events for a limited time. The dashboard never reads it.

``analytics-daily-agg`` (hash ``pk``, range ``sk``) holds everything the
dashboard reads, so a page load is a handful of Query/BatchGetItem calls and
never a Scan:

  METRIC#<name>        <YYYY-MM-DD> | TOTAL   count (N), sum (N)   atomic ADD
  METRIC#<name>#H      <YYYY-MM-DDTHH>        count, sum, ttl      hourly, expires
  SET#<name>#<shard>   <YYYY-MM-DD>           members (SS)         distinct ids per day
  SET5#<name>#<shard>  <YYYY-MM-DDTHH:MM>     members (SS), ttl    distinct ids per 5 min
  USER#<user_hash>     FIRST_SEEN             day                  registration marker
  META                 LIVE_SINCE | BACKFILL | SINCE#<metric>

Set members are 16 hex chars of a salted SHA-256, never a raw id. Days are in
the configured analytics timezone (IST by default).
"""

from __future__ import annotations

from typing import Iterable, Optional

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from app.integrations.aws.dynamo_client import (
    get_analytics_agg_table,
    get_analytics_events_table,
    get_resource,
)

TOTAL_SK = "TOTAL"
META_PK = "META"
SET_SHARDS = 4  # ~23k members per 400 KB item => ~92k distinct per day


def metric_pk(name: str, hourly: bool = False) -> str:
    return f"METRIC#{name}#H" if hourly else f"METRIC#{name}"


def set_pk(name: str, shard: int, five_minute: bool = False) -> str:
    return f"{'SET5' if five_minute else 'SET'}#{name}#{shard}"


def shard_of(member: str) -> int:
    return int(member[0], 16) % SET_SHARDS


def _is_conditional_failure(error: ClientError) -> bool:
    return error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"


# --- writes ------------------------------------------------------------------

def put_event(item: dict) -> None:
    get_analytics_events_table().put_item(Item=item)


def add_counter(pk: str, sk: str, count: int, amount: Optional[int] = None, ttl: Optional[int] = None) -> None:
    """Atomic ``ADD count :c [, sum :s]`` on one aggregate item (created if missing)."""
    expr = "ADD #c :c"
    names = {"#c": "count"}
    values: dict = {":c": count}
    if amount is not None:
        expr += ", #s :s"
        names["#s"] = "sum"
        values[":s"] = amount
    if ttl is not None:
        expr += " SET #t = if_not_exists(#t, :t)"
        names["#t"] = "ttl"
        values[":t"] = ttl
    get_analytics_agg_table().update_item(
        Key={"pk": pk, "sk": sk}, UpdateExpression=expr,
        ExpressionAttributeNames=names, ExpressionAttributeValues=values,
    )


def add_to_set(pk: str, sk: str, member: str, ttl: Optional[int] = None) -> None:
    """``ADD members :m`` — idempotent, so a repeated member is counted once."""
    expr = "ADD #m :m"
    names = {"#m": "members"}
    values: dict = {":m": {member}}
    if ttl is not None:
        expr += " SET #t = if_not_exists(#t, :t)"
        names["#t"] = "ttl"
        values[":t"] = ttl
    get_analytics_agg_table().update_item(
        Key={"pk": pk, "sk": sk}, UpdateExpression=expr,
        ExpressionAttributeNames=names, ExpressionAttributeValues=values,
    )


def mark_first_seen(user_hash: str, day: str) -> bool:
    """True only the first time this pseudonymous user is ever recorded."""
    try:
        get_analytics_agg_table().put_item(
            Item={"pk": f"USER#{user_hash}", "sk": "FIRST_SEEN", "day": day},
            ConditionExpression="attribute_not_exists(pk)",
        )
        return True
    except ClientError as error:
        if _is_conditional_failure(error):
            return False
        raise


def put_meta_if_absent(sk: str, attrs: dict) -> dict:
    """Create META/<sk> once; returns whichever item is stored afterwards."""
    table = get_analytics_agg_table()
    try:
        table.put_item(Item={"pk": META_PK, "sk": sk, **attrs}, ConditionExpression="attribute_not_exists(pk)")
        return {"pk": META_PK, "sk": sk, **attrs}
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
    return get_meta(sk) or {}


def put_meta(sk: str, attrs: dict) -> None:
    get_analytics_agg_table().put_item(Item={"pk": META_PK, "sk": sk, **attrs})


def lower_since(metric: str, day: str) -> None:
    """META/SINCE#<metric>.day = min(existing, day)."""
    try:
        get_analytics_agg_table().update_item(
            Key={"pk": META_PK, "sk": f"SINCE#{metric}"},
            UpdateExpression="SET #d = :d",
            ConditionExpression="attribute_not_exists(#d) OR #d > :d",
            ExpressionAttributeNames={"#d": "day"},
            ExpressionAttributeValues={":d": day},
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise


# --- reads -------------------------------------------------------------------

def get_meta(sk: str) -> Optional[dict]:
    return get_analytics_agg_table().get_item(Key={"pk": META_PK, "sk": sk}, ConsistentRead=True).get("Item")


def all_meta() -> dict[str, dict]:
    resp = get_analytics_agg_table().query(KeyConditionExpression=Key("pk").eq(META_PK))
    return {item["sk"]: item for item in resp.get("Items", [])}


def query_counters(pk: str, sk_from: str, sk_to: str) -> dict[str, dict]:
    """``{sk: {"count": int, "sum": int}}`` for sk in [sk_from, sk_to]."""
    table = get_analytics_agg_table()
    kwargs = {"KeyConditionExpression": Key("pk").eq(pk) & Key("sk").between(sk_from, sk_to)}
    out: dict[str, dict] = {}
    while True:
        resp = table.query(**kwargs)
        for item in resp.get("Items", []):
            out[item["sk"]] = {"count": int(item.get("count", 0)), "sum": int(item.get("sum", 0))}
        if "LastEvaluatedKey" not in resp:
            return out
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def batch_get(keys: Iterable[tuple[str, str]]) -> dict[tuple[str, str], dict]:
    """BatchGetItem in chunks of 100, retrying UnprocessedKeys."""
    table_name = get_analytics_agg_table().name
    resource = get_resource()
    unique = list(dict.fromkeys(keys))
    out: dict[tuple[str, str], dict] = {}
    for i in range(0, len(unique), 100):
        request = {table_name: {"Keys": [{"pk": pk, "sk": sk} for pk, sk in unique[i:i + 100]]}}
        for _ in range(5):
            resp = resource.batch_get_item(RequestItems=request)
            for item in resp.get("Responses", {}).get(table_name, []):
                out[(item["pk"], item["sk"])] = item
            request = resp.get("UnprocessedKeys") or {}
            if not request:
                break
    return out
