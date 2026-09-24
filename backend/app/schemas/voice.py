"""Schemas for voice input (Amazon Transcribe Streaming sessions)."""

from __future__ import annotations

from pydantic import BaseModel


class VoiceSessionResponse(BaseModel):
    url: str
    expiresIn: int
    # Transcribe identifies the spoken language among these (no client choice).
    languageOptions: list[str]
    preferredLanguage: str
    sampleRate: int
    # Lets VOICE_MAX_SECONDS drive the clients' auto-stop.
    maxSeconds: int
