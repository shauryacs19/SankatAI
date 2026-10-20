"""Pydantic models for consultations (chat history) and messages."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.triage import TriageAnswers


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
    # Answers picked in a follow-up questionnaire; `content` is their readable summary.
    answers: Optional[TriageAnswers] = None


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
    answers: Optional[dict] = None  # user messages sent from a questionnaire: {values, other, note}


class PostMessageResponse(BaseModel):
    userMessage: MessageView
    assistantMessage: Optional[MessageView] = None  # absent for attachment-only messages
    isOfflineFallback: bool


class FeedbackRequest(BaseModel):
    # None clears any existing feedback for the message.
    feedback: Optional[Literal["like", "dislike"]] = None
    # Optional, additive: why a reply was not helpful (only with "dislike"), and
    # for a wrong severity whether it should have been higher or lower.
    reason: Optional[Literal["inaccurate", "too_generic", "wrong_severity"]] = None
    direction: Optional[Literal["higher", "lower"]] = None
    comment: Optional[str] = Field(default=None, max_length=280)

    @model_validator(mode="after")
    def _reason_needs_dislike(self):
        if self.reason and self.feedback != "dislike":
            raise ValueError("A reason can only be given with a 'No' (dislike).")
        if self.direction and self.reason != "wrong_severity":
            raise ValueError("direction is only valid with reason 'wrong_severity'.")
        return self


class TranslateRequest(BaseModel):
    # The reply's English -> Hindi -> Hinglish cycle in the chat.
    target: Literal["en", "hi", "hinglish"]


class TranslateResponse(BaseModel):
    messageId: str
    target: str
    content: str  # same shape as MessageView.content (the reply JSON)
    lang: str  # locale read-aloud uses for this version
