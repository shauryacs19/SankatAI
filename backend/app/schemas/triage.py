"""Pydantic models for the triage/analysis endpoints."""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints

Text300 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class AnswerItem(BaseModel):
    """One question the assistant asked, and the person's answer: the option
    they tapped, or what they typed (an "Other" or a text question)."""

    id: str = Field(..., max_length=20)
    question: Text300
    answer: Text300
    kind: Literal["yes_no", "choice", "text"] = "choice"


class TriageAnswers(BaseModel):
    """A questionnaire's answers, sent with their readable summary as the message."""

    items: list[AnswerItem] = Field(default_factory=list, max_length=10)
    note: Optional[str] = Field(default=None, max_length=1000)  # "anything else?" free text


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    answers: Optional[TriageAnswers] = None  # user turns: structured questionnaire answers


class PatientProfile(BaseModel):
    """Optional patient context. All fields optional; extras are ignored."""

    age: Optional[str | int] = None
    gender: Optional[str] = None
    bloodGroup: Optional[str] = None
    conditions: Optional[str] = None
    allergies: Optional[str] = None
    medications: Optional[str] = None
    # Server-side only: summaries of vault documents the user allowed the AI to read.
    documents: Optional[list[dict]] = Field(default=None, exclude=True)


class AnalyzeRequest(BaseModel):
    messages: list[Message] = Field(..., min_length=1)
    patientProfile: Optional[PatientProfile] = None


class AnalyzeResponse(BaseModel):
    text: str
    isOfflineFallback: bool


class HealthResponse(BaseModel):
    ok: bool
    status: str
