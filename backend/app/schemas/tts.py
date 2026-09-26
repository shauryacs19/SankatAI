"""Schemas for text-to-speech (read a reply aloud)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class TtsRequest(BaseModel):
    # A reference only: the text and its language are read server-side from the
    # caller's own conversation. consultationId scopes the lookup to one query.
    consultationId: str = Field(..., min_length=1, max_length=64)
    messageId: str = Field(..., min_length=1, max_length=64)
    # Read the translation currently shown (English/Hindi/Hinglish cycle); only
    # a version already cached on the message is used, else the original.
    variant: Optional[Literal["en", "hi", "hinglish"]] = None
