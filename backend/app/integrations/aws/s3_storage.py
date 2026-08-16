"""Object storage abstraction + S3 implementation.

Single responsibility: turning (bucket, key) into pre-signed URLs and deleting
objects. Knows nothing about users, chats or DynamoDB.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

import boto3
from botocore.config import Config


class ObjectStorage(ABC):
    """Interface the service depends on (dependency inversion)."""

    @abstractmethod
    def presigned_put_url(self, bucket: str, key: str, content_type: str, expires: int) -> str:
        """Pre-signed URL the client uses to PUT (upload) an object directly."""

    @abstractmethod
    def presigned_get_url(self, bucket: str, key: str, expires: int, download_name: Optional[str] = None, disposition: str = "attachment") -> str:
        """Pre-signed URL the client uses to GET an object.

        disposition="attachment" forces a download; "inline" lets the browser
        display it (view in a new tab)."""

    @abstractmethod
    def delete(self, bucket: str, key: str) -> None:
        """Delete an object."""


class S3ObjectStorage(ObjectStorage):
    """AWS S3 implementation. Uses SigV4 (required for presigned PUT/KMS)."""

    def __init__(self, region: str):
        self._s3 = boto3.client(
            "s3",
            region_name=region,
            config=Config(signature_version="s3v4"),
        )

    def presigned_put_url(self, bucket: str, key: str, content_type: str, expires: int) -> str:
        return self._s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )

    def presigned_get_url(self, bucket: str, key: str, expires: int, download_name: Optional[str] = None, disposition: str = "attachment") -> str:
        disp = "inline" if disposition == "inline" else "attachment"
        params = {"Bucket": bucket, "Key": key}
        params["ResponseContentDisposition"] = (
            f'{disp}; filename="{download_name}"' if download_name else disp
        )
        return self._s3.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)

    def delete(self, bucket: str, key: str) -> None:
        self._s3.delete_object(Bucket=bucket, Key=key)
