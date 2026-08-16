"""Request/response models for the uploads API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Scope = Literal["chat", "vault"]   # chat = uploaded in a conversation; vault = Documents tab
Kind = Literal["photo", "document"]


class PresignRequest(BaseModel):
    scope: Scope
    kind: Kind = "document"
    filename: str = Field(..., min_length=1)
    contentType: str = Field(..., min_length=1)
    chatId: Optional[str] = None  # required when scope == "chat"
    passwordProtected: bool = False
    pinId: Optional[str] = None  # which account security PIN protects the file


class PresignResponse(BaseModel):
    attachmentId: str
    uploadUrl: str
    key: str
    bucket: str
    expiresIn: int


class CompleteRequest(BaseModel):
    size: Optional[int] = None


class UpdateAttachmentRequest(BaseModel):
    # Only the provided fields change. category="" moves the file to Uncategorized.
    filename: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[str] = Field(default=None, max_length=60)


class DownloadRequest(BaseModel):
    pin: Optional[str] = Field(default=None, min_length=6, max_length=6)
    disposition: Literal["inline", "attachment"] = "attachment"


class DeleteAttachmentRequest(BaseModel):
    # Required (and verified) when the file is password-protected.
    pin: Optional[str] = Field(default=None, min_length=6, max_length=6)


class DownloadResponse(BaseModel):
    downloadUrl: str
    expiresIn: int


class AttachmentView(BaseModel):
    attachmentId: str
    scope: str
    kind: str
    filename: str
    contentType: str
    chatId: Optional[str] = None
    status: str
    createdAt: Optional[str] = None
    downloadUrl: Optional[str] = None  # withheld for password-protected files
    size: Optional[int] = None  # bytes, recorded on /complete
    passwordProtected: bool = False
    pinId: Optional[str] = None  # which account PIN protects it (resolve to a label client-side)
    category: Optional[str] = None
