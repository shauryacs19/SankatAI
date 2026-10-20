"""Image-first triage uploads (v2).

  1. ``create_upload``  presigned PUT for the chat bucket. Content-Type AND
     Content-Length are signed, so S3 itself refuses another type or size.
     No consultation yet -> one is created (a session can start with a photo).
  2. client PUTs the bytes (the web app has already re-encoded them, which drops
     EXIF on the device).
  3. ``complete``  HeadObject size check, Pillow decode + type check, EXIF strip
     by re-encoding, overwrite, mark uploaded, start vision analysis. A rejected
     file is deleted.

Rows live in the existing attachments table (scope=chat, kind=photo), so the
photo shows in the chat and its history like any other attachment.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core import config
from app.repositories import consultation_repository
from app.services import analytics_service, image_safety, vision_service

UPLOAD_URL_SECONDS = 300
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class ImageError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _repo():
    return vision_service._repo()


def _s3():
    return vision_service._s3()


def create_upload(user_id: str, content_type: str, size: int, consultation_id: Optional[str]) -> dict:
    if content_type not in config.TRIAGE_IMAGE_TYPES:
        raise ImageError(415, "Send a JPEG, PNG or WebP photo.")
    if size > config.TRIAGE_IMAGE_MAX_BYTES:
        raise ImageError(413, f"The photo must be under {config.TRIAGE_IMAGE_MAX_BYTES // (1024 * 1024)} MB.")
    if consultation_id:
        if consultation_repository.get_consultation(user_id, consultation_id) is None:
            raise ImageError(404, "Consultation not found.")
    else:
        consultation_id = consultation_repository.create_consultation(user_id, "New consultation")["consultationId"]
        analytics_service.emit("CHAT_CREATED", user_id)

    image_id = uuid.uuid4().hex
    key = f"photos/{image_id}-triage.{_EXT[content_type]}"
    url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": config.CHAT_BUCKET, "Key": key, "ContentType": content_type, "ContentLength": size},
        ExpiresIn=UPLOAD_URL_SECONDS,
    )
    _repo().save({
        "user_id": user_id, "attachment_id": image_id, "scope": "chat", "kind": "photo",
        "chat_id": consultation_id, "bucket": config.CHAT_BUCKET, "key": key,
        "filename": f"photo.{_EXT[content_type]}", "content_type": content_type, "declared_size": size,
        "status": "pending", "created_at": datetime.now(timezone.utc).isoformat(),
        "password_protected": False, "source": "triage-v2",
    })
    return {
        "imageId": image_id, "consultationId": consultation_id, "uploadUrl": url,
        "uploadHeaders": {"Content-Type": content_type}, "maxBytes": config.TRIAGE_IMAGE_MAX_BYTES,
        "expiresIn": UPLOAD_URL_SECONDS,
    }


def _reject(item: dict, status: int, detail: str) -> ImageError:
    try:
        _s3().delete_object(Bucket=item["bucket"], Key=item["key"])
    finally:
        _repo().update_status(item["user_id"], item["attachment_id"], "rejected", None)
    return ImageError(status, detail)


def complete(user_id: str, image_id: str) -> dict:
    repo = _repo()
    item = repo.get(user_id, image_id)
    if not item or item.get("source") != "triage-v2":
        raise ImageError(404, "Photo not found.")
    s3 = _s3()
    if item.get("status") != "uploaded":
        try:
            head = s3.head_object(Bucket=item["bucket"], Key=item["key"])
        except Exception as err:  # noqa: BLE001 - missing object
            raise ImageError(409, "The photo has not been uploaded yet.") from err
        if head.get("ContentLength", 0) > config.TRIAGE_IMAGE_MAX_BYTES:
            raise _reject(item, 413, "The photo is too large.")
        data = s3.get_object(Bucket=item["bucket"], Key=item["key"])["Body"].read()
        try:
            clean, mime = image_safety.sanitize(data, item.get("content_type"))
        except image_safety.ImageRejected as err:
            raise _reject(item, err.status, err.detail) from err
        s3.put_object(Bucket=item["bucket"], Key=item["key"], Body=clean, ContentType=mime, ServerSideEncryption="AES256")
        repo.mark_sanitized(user_id, image_id, len(clean), mime)
        analytics_service.emit("DOCUMENT_UPLOADED", user_id, scope="chat", kind="photo")
        item.update(status="uploaded", size=len(clean), content_type=mime, sanitized=True)
        vision_service.prefetch(user_id, item)
    preview = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": item["bucket"], "Key": item["key"], "ResponseContentDisposition": "inline"},
        ExpiresIn=config.PRESIGN_EXPIRY,
    )
    return {"imageId": image_id, "consultationId": item["chat_id"], "contentType": item["content_type"],
            "size": int(item.get("size") or 0), "previewUrl": preview}
