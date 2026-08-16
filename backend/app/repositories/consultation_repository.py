"""Consultation + message persistence (DynamoDB ``chat-history`` table).

Single-table design: hash ``user_id`` + range ``chat_id`` where the sort key
prefix distinguishes the two row kinds:

  - ``CONSULT#{created_at}#{consultation_id}`` -> consultation record
  - ``MSG#{consultation_id}#{created_at}#{id}`` -> a chat message

This lets us list a user's consultations and a consultation's messages with a
single ``Query`` (begins_with) each — no GSI or table Scan required.

NOTE: the range-key attribute is ``chat_id`` to match the real
``sankatai-chat-history`` table (Terraform: hash user_id, range chat_id) shared
with the web app. Do not rename it.

Single responsibility: DynamoDB access + row<->view mapping for chat history.
"""

from __future__ import annotations

from typing import Optional

from boto3.dynamodb.conditions import Key

from app.integrations.aws.dynamo_client import get_chat_table, now_iso, short_id

CONSULT_PREFIX = "CONSULT#"
MSG_PREFIX = "MSG#"


# --- Consultations ---------------------------------------------------------

def create_consultation(user_id: str, title: str = "New consultation") -> dict:
    now = now_iso()
    consultation_id = short_id()
    sort_key = f"{CONSULT_PREFIX}{now}#{consultation_id}"
    item = {
        "user_id": user_id,
        "chat_id": sort_key,
        "kind": "consultation",
        "consultation_id": consultation_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "last_severity": None,
    }
    get_chat_table().put_item(Item=item)
    return _consult_view(item)


def _consult_view(item: dict) -> dict:
    return {
        "consultationId": item["consultation_id"],
        "title": item.get("title", "New consultation"),
        "createdAt": item.get("created_at"),
        "updatedAt": item.get("updated_at"),
        "lastSeverity": item.get("last_severity"),
    }


def list_consultations(user_id: str) -> list[dict]:
    resp = get_chat_table().query(
        KeyConditionExpression=Key("user_id").eq(user_id)
        & Key("chat_id").begins_with(CONSULT_PREFIX)
    )
    items = [_consult_view(i) for i in resp.get("Items", [])]
    # Most recently active first.
    items.sort(key=lambda c: c.get("updatedAt") or "", reverse=True)
    return items


def _find_consultation_item(user_id: str, consultation_id: str) -> Optional[dict]:
    resp = get_chat_table().query(
        KeyConditionExpression=Key("user_id").eq(user_id)
        & Key("chat_id").begins_with(CONSULT_PREFIX)
    )
    for item in resp.get("Items", []):
        if item.get("consultation_id") == consultation_id:
            return item
    return None


def get_consultation(user_id: str, consultation_id: str) -> Optional[dict]:
    item = _find_consultation_item(user_id, consultation_id)
    return _consult_view(item) if item else None


def delete_consultation(user_id: str, consultation_id: str) -> bool:
    item = _find_consultation_item(user_id, consultation_id)
    if not item:
        return False
    table = get_chat_table()
    # Delete the consultation record.
    table.delete_item(
        Key={"user_id": user_id, "chat_id": item["chat_id"]}
    )
    # Delete all its messages.
    msgs = table.query(
        KeyConditionExpression=Key("user_id").eq(user_id)
        & Key("chat_id").begins_with(f"{MSG_PREFIX}{consultation_id}#")
    )
    with table.batch_writer() as batch:
        for m in msgs.get("Items", []):
            batch.delete_item(
                Key={"user_id": user_id, "chat_id": m["chat_id"]}
            )
    return True


def rename_consultation(user_id: str, consultation_id: str, title: str) -> Optional[dict]:
    """Update only the consultation title (leaves updated_at / ordering intact)."""
    item = _find_consultation_item(user_id, consultation_id)
    if not item:
        return None
    get_chat_table().update_item(
        Key={"user_id": user_id, "chat_id": item["chat_id"]},
        UpdateExpression="SET #t = :t",
        ExpressionAttributeNames={"#t": "title"},
        ExpressionAttributeValues={":t": title},
    )
    item["title"] = title
    return _consult_view(item)


def touch_consultation(
    user_id: str,
    consultation_id: str,
    *,
    title: Optional[str] = None,
    last_severity: Optional[str] = None,
) -> None:
    item = _find_consultation_item(user_id, consultation_id)
    if not item:
        return
    updates = {"updated_at": now_iso()}
    if title is not None:
        updates["title"] = title
    if last_severity is not None:
        updates["last_severity"] = last_severity

    expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    get_chat_table().update_item(
        Key={"user_id": user_id, "chat_id": item["chat_id"]},
        UpdateExpression=expr,
        ExpressionAttributeNames={f"#{k}": k for k in updates},
        ExpressionAttributeValues={f":{k}": v for k, v in updates.items()},
    )


# --- Messages --------------------------------------------------------------

def _msg_view(item: dict) -> dict:
    ids = item.get("attachment_ids")
    return {
        "id": item.get("message_id"),
        "role": item.get("role"),
        "content": item.get("content", ""),
        "severity": item.get("severity"),
        "riskScore": item.get("risk_score"),
        "createdAt": item.get("created_at"),
        "feedback": item.get("feedback"),
        "attachmentIds": list(ids) if isinstance(ids, list) else [],
    }


def _find_message_item(user_id: str, consultation_id: str, message_id: str) -> Optional[dict]:
    resp = get_chat_table().query(
        KeyConditionExpression=Key("user_id").eq(user_id)
        & Key("chat_id").begins_with(f"{MSG_PREFIX}{consultation_id}#")
    )
    for item in resp.get("Items", []):
        if item.get("message_id") == message_id:
            return item
    return None


def set_message_feedback(
    user_id: str, consultation_id: str, message_id: str, feedback: Optional[str]
) -> tuple[str, Optional[dict]]:
    """Set/clear like|dislike feedback on an AI message.

    Returns ``(status, view)`` where status is one of ``ok`` / ``not_found`` /
    ``not_ai``. Scoped to the caller's ``user_id`` partition, so a user can only
    touch their own messages. ``feedback=None`` clears it.
    """
    item = _find_message_item(user_id, consultation_id, message_id)
    if not item:
        return "not_found", None
    if item.get("role") != "assistant":
        return "not_ai", None

    key = {"user_id": user_id, "chat_id": item["chat_id"]}
    if feedback is None:
        get_chat_table().update_item(
            Key=key,
            UpdateExpression="REMOVE #f, #fa",
            ExpressionAttributeNames={"#f": "feedback", "#fa": "feedback_at"},
        )
        item.pop("feedback", None)
    else:
        get_chat_table().update_item(
            Key=key,
            UpdateExpression="SET #f = :f, #fa = :fa",
            ExpressionAttributeNames={"#f": "feedback", "#fa": "feedback_at"},
            ExpressionAttributeValues={":f": feedback, ":fa": now_iso()},
        )
        item["feedback"] = feedback
    return "ok", _msg_view(item)


def list_messages(user_id: str, consultation_id: str) -> list[dict]:
    resp = get_chat_table().query(
        KeyConditionExpression=Key("user_id").eq(user_id)
        & Key("chat_id").begins_with(f"{MSG_PREFIX}{consultation_id}#")
    )
    # Sort-key includes created_at, so results are already chronological.
    # Unsent messages stay in the table (audit trail) but are filtered out here.
    return [_msg_view(i) for i in resp.get("Items", []) if not i.get("deleted")]


def soft_delete_message(user_id: str, consultation_id: str, message_id: str) -> str:
    """Mark a message deleted without removing the row.

    Returns ``ok`` / ``not_found`` / ``not_own`` (only the user's own messages
    can be unsent). Scoped to the caller's partition.
    """
    item = _find_message_item(user_id, consultation_id, message_id)
    if not item:
        return "not_found"
    if item.get("role") != "user":
        return "not_own"
    get_chat_table().update_item(
        Key={"user_id": user_id, "chat_id": item["chat_id"]},
        UpdateExpression="SET #d = :d, #da = :da",
        ExpressionAttributeNames={"#d": "deleted", "#da": "deleted_at"},
        ExpressionAttributeValues={":d": True, ":da": now_iso()},
    )
    return "ok"


def search_consultations(user_id: str, query: str) -> list[dict]:
    """Consultations whose TITLE or any live MESSAGE matches `query`.

    One query per partition prefix; message rows are already scoped to the user.
    """
    q = (query or "").strip().lower()
    consults = list_consultations(user_id)
    if not q:
        return consults

    matched = {c["consultationId"] for c in consults if q in (c.get("title") or "").lower()}

    resp = get_chat_table().query(
        KeyConditionExpression=Key("user_id").eq(user_id) & Key("chat_id").begins_with(MSG_PREFIX)
    )
    for item in resp.get("Items", []):
        if item.get("deleted"):
            continue
        if q in str(item.get("content", "")).lower():
            # chat_id is "MSG#<consultationId>#<created_at>#..."
            parts = str(item.get("chat_id", "")).split("#")
            if len(parts) > 1:
                matched.add(parts[1])

    return [c for c in consults if c["consultationId"] in matched]


def add_message(
    user_id: str,
    consultation_id: str,
    role: str,
    content: str,
    *,
    severity: Optional[str] = None,
    risk_score: Optional[int] = None,
    attachment_ids: Optional[list] = None,
) -> dict:
    now = now_iso()
    message_id = short_id()
    item = {
        "user_id": user_id,
        "chat_id": f"{MSG_PREFIX}{consultation_id}#{now}#{message_id}",
        "kind": "message",
        "consultation_id": consultation_id,
        "message_id": message_id,
        "role": role,
        "content": content,
        "severity": severity,
        "risk_score": risk_score,
        "created_at": now,
    }
    if attachment_ids:
        item["attachment_ids"] = list(attachment_ids)
    get_chat_table().put_item(Item=item)
    return _msg_view(item)
