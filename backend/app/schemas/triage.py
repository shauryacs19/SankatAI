"""Pydantic models for the triage/analysis endpoints."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class PatientProfile(BaseModel):
    """Optional patient context. All fields optional; extras are ignored."""

    age: Optional[str | int] = None
    gender: Optional[str] = None
    bloodGroup: Optional[str] = None
    conditions: Optional[str] = None
    allergies: Optional[str] = None
    medications: Optional[str] = None


class AnalyzeRequest(BaseModel):
    messages: list[Message] = Field(..., min_length=1)
    patientProfile: Optional[PatientProfile] = None


class AnalyzeResponse(BaseModel):
    text: str
    isOfflineFallback: bool


class HealthResponse(BaseModel):
    ok: bool
    status: str
