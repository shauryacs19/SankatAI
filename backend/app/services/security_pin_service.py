"""Account-level security PINs.

Users create one or more PINs on their profile; files reference a PIN by id
rather than storing their own. Only PBKDF2 hashes (+ per-PIN salt) are stored —
never the PIN itself. PIN records live on the user item (users table).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.repositories import profile_repository

_PIN_ITERATIONS = 120_000
_MAX_PINS = 10


class PinValidationError(Exception):
    """Invalid PIN input (mapped to HTTP 400)."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_pin(pin: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, _PIN_ITERATIONS).hex()


def _is_valid(pin: Optional[str]) -> bool:
    return bool(pin) and pin.isdigit() and len(pin) == 6


def _public(rec: dict) -> dict:
    return {"id": rec["id"], "label": rec.get("label") or "PIN", "createdAt": rec.get("created_at")}


def list_pins(user_id: str) -> list[dict]:
    """Public metadata only — no hashes/salts."""
    return [_public(p) for p in profile_repository.get_security_pins(user_id)]


def has_pins(user_id: str) -> bool:
    return len(profile_repository.get_security_pins(user_id)) > 0


def pin_exists(user_id: str, pin_id: Optional[str]) -> bool:
    if not pin_id:
        return False
    return any(p.get("id") == pin_id for p in profile_repository.get_security_pins(user_id))


def create_pin(user_id: str, label: Optional[str], pin: str) -> dict:
    if not _is_valid(pin):
        raise PinValidationError("PIN must be exactly 6 digits.")
    pins = profile_repository.get_security_pins(user_id)
    if len(pins) >= _MAX_PINS:
        raise PinValidationError(f"You can have at most {_MAX_PINS} PINs.")
    salt = secrets.token_bytes(16)
    rec = {
        "id": uuid.uuid4().hex,
        "label": (label or "").strip()[:40] or f"PIN {len(pins) + 1}",
        "pin_salt": salt.hex(),
        "pin_hash": _hash_pin(pin, salt),
        "created_at": _now_iso(),
    }
    pins.append(rec)
    profile_repository.set_security_pins(user_id, pins)
    return _public(rec)


def verify_pin(user_id: str, pin_id: Optional[str], pin: Optional[str]) -> bool:
    if not pin or not pin_id:
        return False
    for p in profile_repository.get_security_pins(user_id):
        if p.get("id") == pin_id:
            salt_hex = p.get("pin_salt")
            expected = p.get("pin_hash")
            if not salt_hex or not expected:
                return False
            return hmac.compare_digest(_hash_pin(pin, bytes.fromhex(salt_hex)), expected)
    return False


def delete_pin(user_id: str, pin_id: str) -> bool:
    pins = profile_repository.get_security_pins(user_id)
    remaining = [p for p in pins if p.get("id") != pin_id]
    if len(remaining) == len(pins):
        return False
    profile_repository.set_security_pins(user_id, remaining)
    return True
