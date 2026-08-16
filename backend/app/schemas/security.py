"""Schemas for account-level security PINs."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SecurityPinView(BaseModel):
    id: str
    label: str
    createdAt: Optional[str] = None


class CreatePinRequest(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6)
    label: Optional[str] = Field(default=None, max_length=40)


class DeletePinRequest(BaseModel):
    """Deleting a PIN requires proving you know it."""

    pin: str = Field(..., min_length=6, max_length=6)
