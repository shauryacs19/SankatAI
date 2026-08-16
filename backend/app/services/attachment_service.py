"""Attachment business logic.

Orchestrates the object storage + metadata repository. Owns the rules that map
a request to a concrete (bucket, key):

    scope=chat,  kind=photo     -> CHAT_BUCKET      photos/{id}-{name}
    scope=chat,  kind=document  -> CHAT_BUCKET      documents/{id}-{name}
    scope=vault, kind=photo     -> DOCUMENTS_BUCKET photos/{id}-{name}
    scope=vault, kind=document  -> DOCUMENTS_BUCKET documents/{id}-{name}

Ownership (which user / which chat) is recorded in the DynamoDB metadata, not the
key. Depends only on the ObjectStorage + AttachmentRepository abstractions.

Password protection: when a vault file is protected it references an account-level
security PIN by ``pin_id`` (managed in security_pin_service). The list endpoint
withholds the download URL for protected files; a fresh URL is only minted after
the PIN is verified.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Callable, Optional

from app.integrations.aws.s3_storage import ObjectStorage
from app.repositories.attachment_repository import AttachmentRepository


class AttachmentError(Exception):
    """Raised for invalid requests (mapped to HTTP 400 in the router)."""


class NotFoundError(Exception):
    """Raised when an attachment doesn't exist (mapped to HTTP 404)."""


class PinError(Exception):
    """Raised when a required PIN is missing or incorrect (mapped to HTTP 403)."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(name: str) -> str:
    base = os.path.basename(name or "file")
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return base[:120] or "file"


class AttachmentService:
    def __init__(self, storage: ObjectStorage, repo: AttachmentRepository, cfg):
        self._storage = storage
        self._repo = repo
        self._cfg = cfg

    # -- key/prefix strategy --
    def _resolve_target(self, user_id: str, scope: str, kind: str, chat_id: Optional[str], filename: str):
        attachment_id = uuid.uuid4().hex
        safe = _safe_name(filename)
        if scope == "chat":
            if not chat_id:
                raise AttachmentError("chatId is required for chat uploads.")
            folder = "photos" if kind == "photo" else "documents"
            key = f"{folder}/{attachment_id}-{safe}"
            bucket = self._cfg.CHAT_BUCKET
        elif scope == "vault":
            folder = "photos" if kind == "photo" else "documents"
            key = f"{folder}/{attachment_id}-{safe}"
            bucket = self._cfg.DOCUMENTS_BUCKET
        else:  # pragma: no cover - guarded by the schema Literal
            raise AttachmentError(f"Unknown scope: {scope}")
        return attachment_id, bucket, key

    # -- use cases --
    def create_upload(self, user_id: str, email: Optional[str], scope: str, kind: str,
                      filename: str, content_type: str, chat_id: Optional[str] = None,
                      password_protected: bool = False, pin_id: Optional[str] = None,
                      category: Optional[str] = None) -> dict:
        attachment_id, bucket, key = self._resolve_target(user_id, scope, kind, chat_id, filename)
        url = self._storage.presigned_put_url(bucket, key, content_type, self._cfg.PRESIGN_EXPIRY)

        item = {
            "user_id": user_id,
            "attachment_id": attachment_id,
            "scope": scope,
            "kind": kind,
            "chat_id": chat_id,
            "bucket": bucket,
            "key": key,
            "filename": filename,
            "content_type": content_type,
            "status": "pending",
            "created_at": _now_iso(),
            "password_protected": False,
        }
        if category and category.strip():
            item["category"] = category.strip()[:60]
        if password_protected:
            if not pin_id:
                raise AttachmentError("Select which security PIN protects this file.")
            item["password_protected"] = True
            item["pin_id"] = pin_id

        self._repo.save(item)
        return {
            "attachmentId": attachment_id,
            "uploadUrl": url,
            "key": key,
            "bucket": bucket,
            "expiresIn": self._cfg.PRESIGN_EXPIRY,
        }

    def mark_uploaded(self, user_id: str, attachment_id: str, size: Optional[int] = None) -> None:
        if not self._repo.get(user_id, attachment_id):
            raise NotFoundError("Attachment not found.")
        self._repo.update_status(user_id, attachment_id, "uploaded", size)

    def list(self, user_id: str, scope: str, chat_id: Optional[str] = None) -> list[dict]:
        views = []
        for item in self._repo.list_by_user(user_id):
            if item.get("scope") != scope:
                continue
            if scope == "chat" and chat_id and item.get("chat_id") != chat_id:
                continue
            views.append(self._to_view(item, with_download=True))
        views.sort(key=lambda v: v.get("createdAt") or "", reverse=True)
        return views

    def update(self, user_id: str, attachment_id: str,
               filename: Optional[str] = None, category: Optional[str] = None) -> dict:
        """Rename and/or (re)assign a category. Only the provided fields change.
        An empty-string category clears it (moves the file to Uncategorized)."""
        item = self._repo.get(user_id, attachment_id)
        if not item:
            raise NotFoundError("Attachment not found.")
        if filename is not None:
            name = filename.strip()[:120]
            if not name:
                raise AttachmentError("File name cannot be empty.")
            self._repo.update_filename(user_id, attachment_id, name)
            item["filename"] = name
        if category is not None:
            cat = category.strip()[:60] or None
            self._repo.update_category(user_id, attachment_id, cat)
            if cat:
                item["category"] = cat
            else:
                item.pop("category", None)
        return self._to_view(item, with_download=False)

    def get_download_url(self, user_id: str, attachment_id: str,
                         disposition: str = "attachment",
                         verify_pin: Optional[Callable[[Optional[str]], bool]] = None) -> str:
        """Mint a fresh pre-signed GET URL. disposition="inline" opens the file
        in the browser (view); "attachment" downloads it.

        For protected files, ``verify_pin`` is invoked with the file's account
        ``pin_id`` and must return True (the caller supplies the entered PIN);
        otherwise PinError is raised."""
        item = self._repo.get(user_id, attachment_id)
        if not item:
            raise NotFoundError("Attachment not found.")
        if item.get("password_protected"):
            if verify_pin is None or not verify_pin(item.get("pin_id")):
                raise PinError("Incorrect PIN.")
        return self._storage.presigned_get_url(
            item["bucket"], item["key"], self._cfg.PRESIGN_EXPIRY, item.get("filename"), disposition
        )

    def delete(self, user_id: str, attachment_id: str,
               verify_pin: Optional[Callable[[Optional[str]], bool]] = None) -> None:
        """Delete an attachment. Password-protected files require a valid PIN —
        ``verify_pin`` is invoked with the file's ``pin_id`` and must return True,
        otherwise PinError is raised and nothing is removed."""
        item = self._repo.get(user_id, attachment_id)
        if not item:
            raise NotFoundError("Attachment not found.")
        if item.get("password_protected"):
            if verify_pin is None or not verify_pin(item.get("pin_id")):
                raise PinError("Incorrect PIN.")
        self._storage.delete(item["bucket"], item["key"])
        self._repo.delete(user_id, attachment_id)

    # -- helpers --
    def _to_view(self, item: dict, *, with_download: bool = False) -> dict:
        protected = bool(item.get("password_protected"))
        view = {
            "attachmentId": item.get("attachment_id"),
            "scope": item.get("scope"),
            "kind": item.get("kind"),
            "filename": item.get("filename"),
            "contentType": item.get("content_type"),
            "chatId": item.get("chat_id"),
            "status": item.get("status", "pending"),
            "createdAt": item.get("created_at"),
            "downloadUrl": None,
            "size": int(item["size"]) if item.get("size") is not None else None,
            "passwordProtected": protected,
            "pinId": item.get("pin_id") if protected else None,
            "category": item.get("category"),
        }
        # Never hand out a download URL for a protected file without a PIN check.
        if with_download and not protected:
            view["downloadUrl"] = self._storage.presigned_get_url(
                item["bucket"], item["key"], self._cfg.PRESIGN_EXPIRY, item.get("filename")
            )
        return view
