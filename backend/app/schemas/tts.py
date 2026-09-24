"""Schemas for text-to-speech (read a reply aloud)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TtsRequest(BaseModel):
    # A reference only: the text and its language are read server-side from the
    # caller's own conversation. consultationId scopes the lookup to one query.
    consultationId: str = Field(..., min_length=1, max_length=64)
    messageId: str = Field(..., min_length=1, max_length=64)
