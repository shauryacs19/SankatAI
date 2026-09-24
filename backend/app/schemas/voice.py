"""Schemas for voice input (Amazon Transcribe Streaming sessions)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class VoiceSessionRequest(BaseModel):
    languageCode: str = Field(default="en-IN", max_length=10)


class VoiceSessionResponse(BaseModel):
    url: str
    expiresIn: int
    languageCode: str
    sampleRate: int
    # Additive: lets VOICE_MAX_SECONDS drive the clients' auto-stop.
    maxSeconds: int
