"""Admin access persistence: ``admins`` + ``admin-invitations`` tables.

``admins`` (hash ``pk``, range ``sk``):
  pk=ADMIN  sk=<cognito sub>     one row per admin ever granted; status active|revoked;
                                 role=root on the single root admin (set only by the
                                 operator bootstrap script; absent = regular admin)
  pk=META   sk=ACTIVE_COUNT      active_count (N)

Every grant/revoke changes the row and the counter in ONE TransactWriteItems,
with ``active_count > 1`` as a condition on revoke. That makes "never remove
the last active admin" atomic under concurrency, not a read-then-write race.

``admin-invitations`` (hash ``invitation_id``, TTL ``ttl``, GSIs
``email_lower-index`` and ``status-index``). Only a SHA-256 of the invite
secret is stored. Acceptance flips ``pending -> accepted`` in the same
transaction that activates the admin, so a link works exactly once.
"""

from __future__ import annotations

from typing import Optional

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from app.integrations.aws.dynamo_client import get_admins_table, get_invitations_table, get_resource

ADMIN_PK = "ADMIN"
META_PK = "META"
COUNTER_SK = "ACTIVE_COUNT"
ROOT_ROLE = "root"


class TransactionFailed(Exception):
    """A conditional transaction was cancelled. ``reasons`` has one code per item."""

    def __init__(self, reasons: list[str]):
        super().__init__(",".join(reasons))
        self.reasons = reasons


def _client():
    return get_resource().meta.client


def _transact(items: list[dict]) -> None:
    try:
        _client().transact_write_items(TransactItems=items)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
            raise
        reasons = [r.get("Code", "None") for r in error.response.get("CancellationReasons", [])]
        raise TransactionFailed(reasons) from error


# --- admins ------------------------------------------------------------------

def get_admin(sub: str) -> Optional[dict]:
    return get_admins_table().get_item(Key={"pk": ADMIN_PK, "sk": sub}, ConsistentRead=True).get("Item")


def list_admins() -> list[dict]:
    table = get_admins_table()
    kwargs = {"KeyConditionExpression": Key("pk").eq(ADMIN_PK), "ConsistentRead": True}
    items: list[dict] = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def active_count() -> int:
    item = get_admins_table().get_item(Key={"pk": META_PK, "sk": COUNTER_SK}, ConsistentRead=True).get("Item")
    return int((item or {}).get("active_count", 0))


def _grant_items(sub: str, username: str, email_lower: str, granted_by: str, via: str, now: str) -> list[dict]:
    table = get_admins_table().name
    return [
        {
            "Put": {
                "TableName": table,
                "Item": {
                    "pk": ADMIN_PK, "sk": sub, "username": username, "email_lower": email_lower,
                    "status": "active", "granted_at": now, "granted_by": granted_by, "granted_via": via,
                },
                "ConditionExpression": "attribute_not_exists(pk) OR #s <> :active",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {":active": "active"},
            }
        },
        {
            "Update": {
                "TableName": table,
                "Key": {"pk": META_PK, "sk": COUNTER_SK},
                "UpdateExpression": "ADD active_count :one",
                "ExpressionAttributeValues": {":one": 1},
            }
        },
    ]


def grant_admin(sub: str, username: str, email_lower: str, granted_by: str, via: str, now: str) -> bool:
    """Activate an admin (bootstrap path). False if already active."""
    try:
        _transact(_grant_items(sub, username, email_lower, granted_by, via, now))
        return True
    except TransactionFailed as failed:
        if failed.reasons[0] == "ConditionalCheckFailed":
            return False
        raise


def revoke_admin(sub: str, revoked_by: str, now: str) -> None:
    """Revoke an active, non-root admin. Raises TransactionFailed with reasons
    [row, counter]: row failed = not active or root, counter failed = last admin.
    The root check is in the condition, so the root row can never be revoked
    through the app even if a caller skipped the service-level check."""
    table = get_admins_table().name
    _transact([
        {
            "Update": {
                "TableName": table,
                "Key": {"pk": ADMIN_PK, "sk": sub},
                "UpdateExpression": "SET #s = :revoked, revoked_at = :now, revoked_by = :by",
                "ConditionExpression": "#s = :active AND (attribute_not_exists(#r) OR #r <> :root)",
                "ExpressionAttributeNames": {"#s": "status", "#r": "role"},
                "ExpressionAttributeValues": {
                    ":revoked": "revoked", ":active": "active", ":now": now, ":by": revoked_by, ":root": ROOT_ROLE,
                },
            }
        },
        {
            "Update": {
                "TableName": table,
                "Key": {"pk": META_PK, "sk": COUNTER_SK},
                "UpdateExpression": "ADD active_count :minus",
                "ConditionExpression": "active_count > :one",
                "ExpressionAttributeValues": {":minus": -1, ":one": 1},
            }
        },
    ])


def set_admin_attrs(sub: str, attrs: dict) -> None:
    names = {f"#{k}": k for k in attrs}
    get_admins_table().update_item(
        Key={"pk": ADMIN_PK, "sk": sub},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in attrs),
        ConditionExpression="attribute_exists(pk)",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={f":{k}": v for k, v in attrs.items()},
    )


# --- invitations -------------------------------------------------------------

def get_invitation(invitation_id: str) -> Optional[dict]:
    return get_invitations_table().get_item(Key={"invitation_id": invitation_id}, ConsistentRead=True).get("Item")


def invitations_for_email(email_lower: str) -> list[dict]:
    resp = get_invitations_table().query(
        IndexName="email_lower-index", KeyConditionExpression=Key("email_lower").eq(email_lower))
    return resp.get("Items", [])


def invitations_by_status(status: str, limit: int) -> list[dict]:
    resp = get_invitations_table().query(
        IndexName="status-index", KeyConditionExpression=Key("status").eq(status),
        ScanIndexForward=False, Limit=limit)
    return resp.get("Items", [])


def create_invitation(item: dict) -> None:
    get_invitations_table().put_item(Item=item, ConditionExpression="attribute_not_exists(invitation_id)")


def update_invitation(invitation_id: str, attrs: dict, *, expect_status: Optional[str] = None) -> bool:
    """SET attrs; False when ``expect_status`` did not hold (or the item is gone)."""
    names = {f"#{k}": k for k in attrs}
    values = {f":{k}": v for k, v in attrs.items()}
    kwargs = {}
    if expect_status:
        names["#cur"] = "status"
        values[":expect"] = expect_status
        kwargs["ConditionExpression"] = "attribute_exists(invitation_id) AND #cur = :expect"
    try:
        get_invitations_table().update_item(
            Key={"invitation_id": invitation_id},
            UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in attrs),
            ExpressionAttributeNames=names, ExpressionAttributeValues=values, **kwargs,
        )
        return True
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def accept_invitation(invitation_id: str, token_hash: str, sub: str, username: str,
                      email_lower: str, inviter_sub: str, now: str) -> None:
    """Atomically: invitation pending->accepted (token + expiry re-checked)
    AND admin row active AND counter +1. Raises TransactionFailed with reasons
    [invitation, admin row, counter]."""
    _transact([
        {
            "Update": {
                "TableName": get_invitations_table().name,
                "Key": {"invitation_id": invitation_id},
                "UpdateExpression": "SET #s = :accepted, accepted_by_sub = :sub, accepted_at = :now",
                "ConditionExpression": "#s = :pending AND token_hash = :th AND expires_at > :now",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {
                    ":accepted": "accepted", ":pending": "pending", ":sub": sub, ":now": now, ":th": token_hash,
                },
            }
        },
        *_grant_items(sub, username, email_lower, inviter_sub, f"invitation:{invitation_id}", now),
    ])
