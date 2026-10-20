"""Image-first triage (v2) request/response models."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ImagePresignRequest(BaseModel):
    contentType: Literal["image/jpeg", "image/png", "image/webp"]
    size: int = Field(..., gt=0, description="Exact byte size; it is signed into the upload URL")
    consultationId: Optional[str] = Field(default=None, max_length=64, description="Omit to start a new consultation")


class ImagePresignResponse(BaseModel):
    imageId: str
    consultationId: str
    uploadUrl: str
    uploadHeaders: dict[str, str]
    maxBytes: int
    expiresIn: int


class ImageCompleteResponse(BaseModel):
    imageId: str
    consultationId: str
    contentType: str
    size: int
    previewUrl: str
