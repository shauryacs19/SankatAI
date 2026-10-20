"""Pydantic models for guest chat (home page, no account) and saving it."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.triage import TriageAnswers

# Upper bound on a transcript the client may send (user + assistant turns).
GUEST_MAX_MESSAGES = 24
_UUID = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"


class GuestMessage(BaseModel):
    """One turn as the browser holds it. Assistant turns must carry the
    signature the server issued with them; user turns are the person's own text."""

    role: Literal["user", "assistant"]  # never "system"
    content: str = Field(..., min_length=1, max_length=6000)
    createdAt: Optional[str] = Field(default=None, max_length=40)
    lang: Optional[str] = Field(default=None, max_length=16)
    isOfflineFallback: bool = False
    signature: Optional[str] = Field(default=None, max_length=128)
    answers: Optional[TriageAnswers] = None  # user turns sent from a questionnaire


class GuestChatRequest(BaseModel):
    guestId: str = Field(..., pattern=_UUID)
    messages: list[GuestMessage] = Field(..., min_length=1, max_length=GUEST_MAX_MESSAGES)


class GuestReply(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
    createdAt: str
    lang: Optional[str] = None
    isOfflineFallback: bool
    signature: str


class GuestChatResponse(BaseModel):
    reply: GuestReply


class GuestSaveRequest(BaseModel):
    guestId: str = Field(..., pattern=_UUID)
    messages: list[GuestMessage] = Field(..., min_length=1, max_length=GUEST_MAX_MESSAGES)
