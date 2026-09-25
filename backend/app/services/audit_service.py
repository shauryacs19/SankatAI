"""Admin audit trail: who did what, from where, with what result.

Records hold identifiers only (Cognito subs, invitation ids, masked emails,
date ranges). Never medical data, tokens, or full email addresses of invitees.
A failed audit write is logged loudly but never undoes or blocks the action.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional

from app.repositories import audit_repository as repo

logger = logging.getLogger("sankatai.audit")

ACTIONS = {
    "invite_create", "invite_rotate", "invite_revoke", "invite_accept",
    "admin_remove", "admin_bootstrap", "permission_change",
    "dashboard_view", "analytics_view", "export", "health_view", "audit_view",
    "access_denied",
}
_MAX_MONTHS_BACK = 24


@dataclass
class AuditContext:
    actor_sub: str
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None


def mask_email(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    return f"{local[:2]}***@{domain}"


def record(ctx: AuditContext, action: str, resource: str, result: str, reason: Optional[str] = None) -> None:
    if action not in ACTIONS:
        raise ValueError(f"unknown audit action {action!r}")
    try:
        repo.append({
            "admin_sub": ctx.actor_sub,
            "action": action,
            "resource": resource[:200],
            "result": result,
            "reason": reason,
            "ip": (ctx.ip or "")[:64] or None,
            "user_agent": (ctx.user_agent or "")[:256] or None,
            "request_id": (ctx.request_id or "")[:128] or None,
        })
    except Exception as error:  # noqa: BLE001 - auditing must not break the action
        logger.error("AUDIT WRITE FAILED action=%s result=%s: %s", action, result, type(error).__name__)


def _encode_cursor(month: str, key: Optional[dict]) -> str:
    return base64.urlsafe_b64encode(json.dumps({"m": month, "k": key}).encode()).decode()


def _decode_cursor(cursor: str) -> tuple[str, Optional[dict]]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        month, key = data["m"], data.get("k")
        date.fromisoformat(f"{month}-01")
        if key is not None and not (isinstance(key, dict) and set(key) == {"pk", "sk"}):
            raise ValueError
        return month, key
    except (ValueError, KeyError, TypeError, binascii.Error, json.JSONDecodeError) as exc:
        raise ValueError("Invalid cursor.") from exc


def _previous_month(month: str) -> str:
    year, mon = int(month[:4]), int(month[5:7])
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def list_entries(cursor: Optional[str], limit: int, current_month: str) -> dict:
    """Newest first across month partitions; ``nextCursor`` None at the end."""
    month, key = _decode_cursor(cursor) if cursor else (current_month, None)
    items: list[dict] = []
    for _ in range(_MAX_MONTHS_BACK):
        page, last = repo.query_month(month, limit - len(items), key)
        items.extend(page)
        if last:
            key = last
        else:
            month, key = _previous_month(month), None
        if len(items) >= limit:
            break
    months_scanned = (int(current_month[:4]) * 12 + int(current_month[5:7])) - (int(month[:4]) * 12 + int(month[5:7]))
    done = key is None and months_scanned >= _MAX_MONTHS_BACK
    return {
        "items": [
            {
                "ts": i.get("ts"), "adminSub": i.get("admin_sub"), "action": i.get("action"),
                "resource": i.get("resource"), "result": i.get("result"), "reason": i.get("reason"),
                "ip": i.get("ip"), "userAgent": i.get("user_agent"), "requestId": i.get("request_id"),
            }
            for i in items
        ],
        "nextCursor": None if done else _encode_cursor(month, key),
    }
