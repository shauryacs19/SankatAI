"""Attachment metadata persistence abstraction + DynamoDB implementation.

Table key schema:
    hash  ``user_id``       (S)
    range ``attachment_id``  (S)

Uses the shared dynamo_client resource so the DynamoDB Local endpoint override
(for dev) is honored. Single responsibility: storing/reading attachment metadata
rows. Knows nothing about S3 or HTTP.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from boto3.dynamodb.conditions import Key

from app.integrations.aws.dynamo_client import get_resource


class AttachmentRepository(ABC):
    """Interface the service depends on (dependency inversion)."""

    @abstractmethod
    def save(self, item: dict) -> None: ...

    @abstractmethod
    def get(self, user_id: str, attachment_id: str) -> Optional[dict]: ...

    @abstractmethod
    def list_by_user(self, user_id: str) -> list[dict]: ...

    @abstractmethod
    def update_status(self, user_id: str, attachment_id: str, status: str, size: Optional[int]) -> None: ...

    @abstractmethod
    def update_filename(self, user_id: str, attachment_id: str, filename: str) -> None: ...

    @abstractmethod
    def update_category(self, user_id: str, attachment_id: str, category: Optional[str]) -> None: ...

    @abstractmethod
    def delete(self, user_id: str, attachment_id: str) -> None: ...


class DynamoAttachmentRepository(AttachmentRepository):
    def __init__(self, table_name: str, region: Optional[str] = None):
        # region kept for signature compatibility; the shared resource already
        # carries region + optional DynamoDB Local endpoint.
        self._table = get_resource().Table(table_name)

    def save(self, item: dict) -> None:
        self._table.put_item(Item=item)

    def get(self, user_id: str, attachment_id: str) -> Optional[dict]:
        return self._table.get_item(Key={"user_id": user_id, "attachment_id": attachment_id}).get("Item")

    def list_by_user(self, user_id: str) -> list[dict]:
        resp = self._table.query(KeyConditionExpression=Key("user_id").eq(user_id))
        return resp.get("Items", [])

    def update_status(self, user_id: str, attachment_id: str, status: str, size: Optional[int]) -> None:
        # `status` and `size` are DynamoDB reserved words -> use name placeholders.
        expr = "SET #s = :s"
        names = {"#s": "status"}
        values = {":s": status}
        if size is not None:
            expr += ", #sz = :sz"
            names["#sz"] = "size"
            values[":sz"] = size
        self._table.update_item(
            Key={"user_id": user_id, "attachment_id": attachment_id},
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )

    def update_filename(self, user_id: str, attachment_id: str, filename: str) -> None:
        self._table.update_item(
            Key={"user_id": user_id, "attachment_id": attachment_id},
            UpdateExpression="SET filename = :f",
            ExpressionAttributeValues={":f": filename},
        )

    def update_category(self, user_id: str, attachment_id: str, category: Optional[str]) -> None:
        key = {"user_id": user_id, "attachment_id": attachment_id}
        if category:
            self._table.update_item(
                Key=key,
                UpdateExpression="SET category = :c",
                ExpressionAttributeValues={":c": category},
            )
        else:
            self._table.update_item(Key=key, UpdateExpression="REMOVE category")

    def delete(self, user_id: str, attachment_id: str) -> None:
        self._table.delete_item(Key={"user_id": user_id, "attachment_id": attachment_id})
