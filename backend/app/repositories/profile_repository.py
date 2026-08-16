"""Profile persistence (DynamoDB ``users`` table).

Single responsibility: read/write one profile item per user. Hash key
``user_id``. Knows nothing about HTTP or business rules.
"""

from __future__ import annotations

from typing import Optional

from app.integrations.aws.dynamo_client import get_users_table, now_iso


def get_profile(user_id: str) -> Optional[dict]:
    resp = get_users_table().get_item(Key={"user_id": user_id})
    item = resp.get("Item")
    if not item:
        return None
    return item.get("profile", {})


def put_profile(user_id: str, email: Optional[str], profile: dict) -> dict:
    # UpdateItem (upsert) so we don't drop `security_pins` or other attributes.
    get_users_table().update_item(
        Key={"user_id": user_id},
        UpdateExpression="SET profile = :p, email = :e, updated_at = :u",
        ExpressionAttributeValues={":p": profile, ":e": email, ":u": now_iso()},
    )
    return profile


# --- account security PINs (raw records, hashes included) ------------------

def get_security_pins(user_id: str) -> list[dict]:
    resp = get_users_table().get_item(Key={"user_id": user_id})
    item = resp.get("Item") or {}
    pins = item.get("security_pins")
    return pins if isinstance(pins, list) else []


def set_security_pins(user_id: str, pins: list[dict]) -> None:
    get_users_table().update_item(
        Key={"user_id": user_id},
        UpdateExpression="SET security_pins = :s, updated_at = :u",
        ExpressionAttributeValues={":s": pins, ":u": now_iso()},
    )
