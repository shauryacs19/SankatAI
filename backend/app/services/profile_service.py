"""Profile business logic.

Thin today (the profile is stored/read as-is), but gives the router a stable
seam so validation or enrichment can be added without changing the HTTP layer.
"""

from __future__ import annotations

from typing import Optional

from app.repositories import profile_repository


def get_profile(user_id: str) -> Optional[dict]:
    return profile_repository.get_profile(user_id)


def save_profile(user_id: str, email: Optional[str], profile: dict) -> dict:
    return profile_repository.put_profile(user_id, email, profile)
