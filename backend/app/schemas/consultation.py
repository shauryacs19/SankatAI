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


class PostMessageResponse(BaseModel):
    userMessage: MessageView
    assistantMessage: Optional[MessageView] = None  # absent for attachment-only messages
    isOfflineFallback: bool


class FeedbackRequest(BaseModel):
    # None clears any existing feedback for the message.
    feedback: Optional[Literal["like", "dislike"]] = None
