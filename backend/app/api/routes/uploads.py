"""HTTP layer for attachment uploads. Thin — delegates to AttachmentService.

Flow (client talks directly to S3 via pre-signed URLs):
  1. POST  /api/uploads/presign           -> { uploadUrl, attachmentId, ... }
  2. client PUTs the file to uploadUrl (with the same Content-Type)
  3. POST  /api/uploads/{id}/complete      -> marks it uploaded (records size)
  4. GET   /api/uploads?scope=vault        -> list; download URL only for
     unprotected files (protected ones carry passwordProtected=true, no URL)
     GET   /api/uploads?scope=chat&chatId=... -> a chat's attachments
  5. POST  /api/uploads/{id}/download      -> fresh presigned GET URL;
     disposition inline (view) | attachment (download); PIN required + verified
     for password-protected files
  6. PATCH /api/uploads/{id}               -> rename and/or set category
  7. DELETE /api/uploads/{id}              -> remove from S3 + metadata
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.core import config
from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.integrations.aws.s3_storage import S3ObjectStorage
from app.repositories.attachment_repository import DynamoAttachmentRepository
from app.schemas.attachment import (
    AttachmentView,
    CompleteRequest,
    DeleteAttachmentRequest,
    DownloadRequest,
    DownloadResponse,
    PresignRequest,
    PresignResponse,
    UpdateAttachmentRequest,
)
from app.services import security_pin_service
from app.services.attachment_service import AttachmentError, AttachmentService, NotFoundError, PinError

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

# --- dependency wiring (built once, lazily) ---
_service: Optional[AttachmentService] = None


def get_service() -> AttachmentService:
    global _service
    if _service is None:
        storage = S3ObjectStorage(config.AWS_REGION)
        repo = DynamoAttachmentRepository(config.ATTACHMENTS_TABLE, config.AWS_REGION)
        _service = AttachmentService(storage, repo, config)
    return _service


@router.post("/presign", response_model=PresignResponse, summary="Get a pre-signed upload URL")
def presign(body: PresignRequest, user: CurrentUser = Depends(get_current_user), svc: AttachmentService = Depends(get_service)):
    if body.passwordProtected and not security_pin_service.pin_exists(user.user_id, body.pinId):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a valid security PIN (create one in your profile first).")
    try:
        return svc.create_upload(
            user.user_id, user.email, body.scope, body.kind, body.filename, body.contentType,
            body.chatId, body.passwordProtected, body.pinId,
        )
    except AttachmentError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{attachment_id}/complete", status_code=status.HTTP_204_NO_CONTENT, summary="Mark an upload complete")
def complete(attachment_id: str, body: CompleteRequest | None = None, user: CurrentUser = Depends(get_current_user), svc: AttachmentService = Depends(get_service)):
    try:
        svc.mark_uploaded(user.user_id, attachment_id, body.size if body else None)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")


@router.get("", response_model=list[AttachmentView], summary="List attachments")
def list_uploads(scope: str, chatId: Optional[str] = None, user: CurrentUser = Depends(get_current_user), svc: AttachmentService = Depends(get_service)):
    return svc.list(user.user_id, scope, chatId)


@router.post("/{attachment_id}/download", response_model=DownloadResponse, summary="Get a fresh view/download URL (PIN required if protected)")
def download(attachment_id: str, body: DownloadRequest | None = None, user: CurrentUser = Depends(get_current_user), svc: AttachmentService = Depends(get_service)):
    pin = body.pin if body else None
    disposition = body.disposition if body else "attachment"
    verify = lambda pid: security_pin_service.verify_pin(user.user_id, pid, pin)  # noqa: E731
    try:
        url = svc.get_download_url(user.user_id, attachment_id, disposition, verify)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")
    except PinError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect PIN.")
    return DownloadResponse(downloadUrl=url, expiresIn=config.PRESIGN_EXPIRY)


@router.patch("/{attachment_id}", response_model=AttachmentView, summary="Rename and/or set a file's category")
def update(attachment_id: str, body: UpdateAttachmentRequest, user: CurrentUser = Depends(get_current_user), svc: AttachmentService = Depends(get_service)):
    try:
        return svc.update(user.user_id, attachment_id, body.filename, body.category)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")
    except AttachmentError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an attachment (PIN required if protected)")
def delete_upload(attachment_id: str, body: DeleteAttachmentRequest | None = None, user: CurrentUser = Depends(get_current_user), svc: AttachmentService = Depends(get_service)):
    pin = body.pin if body else None
    verify = lambda pid: security_pin_service.verify_pin(user.user_id, pid, pin)  # noqa: E731
    try:
        svc.delete(user.user_id, attachment_id, verify)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")
    except PinError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect PIN.")
