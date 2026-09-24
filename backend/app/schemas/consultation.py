"""Pydantic models for consultations (chat history) and messages."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class CreateConsultationRequest(BaseModel):
    title: Optional[str] = None


class RenameConsultationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class PostMessageRequest(BaseModel):
    content: str = ""  # may be empty when attachments are present
    attachmentIds: list[str] = Field(default_factory=list)
    # Voice input sends the language Transcribe identified (BCP-47, e.g. hi-IN).
    lang: Optional[str] = Field(default=None, max_length=16, pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
    inputMode: Literal["voice", "text"] = "text"


class ConsultationView(BaseModel):
    consultationId: str
    title: str
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    lastSeverity: Optional[str] = None


class MessageView(BaseModel):
    id: Optional[str] = None
    role: str
    content: str
    severity: Optional[str] = None
    riskScore: Optional[int] = None
    createdAt: Optional[str] = None
    feedback: Optional[str] = None  # "like" | "dislike" | None (AI messages only)
    attachmentIds: list[str] = Field(default_factory=list)
    # True when this assistant message came from the offline keyword engine
    # rather than the AI model. Persisted, so it survives a history reload.
    isOfflineFallback: bool = False
    lang: Optional[str] = None  # language of this message (assistant: the reply language)
    inputMode: Optional[str] = None  # "voice" | "text" (user messages)


class PostMessageResponse(BaseModel):
    userMessage: MessageView
    assistantMessage: Optional[MessageView] = None  # absent for attachment-only messages
    isOfflineFallback: bool


class FeedbackRequest(BaseModel):
    # None clears any existing feedback for the message.
    feedback: Optional[Literal["like", "dislike"]] = None
