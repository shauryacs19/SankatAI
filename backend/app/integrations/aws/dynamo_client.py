"""Shared DynamoDB connection, row helpers, and dev table provisioning.

Single responsibility: own the boto3 resource + table handles. Supports a
DynamoDB Local endpoint override and optional dev-only table creation.
Repositories depend on this module rather than constructing their own clients.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import boto3

from app.core import config


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def short_id() -> str:
    return uuid.uuid4().hex[:12]


_resource = None


def get_resource():
    global _resource
    if _resource is None:
        kwargs: dict[str, Any] = {"region_name": config.AWS_REGION}
        if config.DYNAMODB_ENDPOINT_URL:
            kwargs["endpoint_url"] = config.DYNAMODB_ENDPOINT_URL
        _resource = boto3.resource("dynamodb", **kwargs)
    return _resource


def get_users_table():
    return get_resource().Table(config.USERS_TABLE)


def get_chat_table():
    return get_resource().Table(config.CHAT_HISTORY_TABLE)


def get_admins_table():
    return get_resource().Table(config.ADMINS_TABLE)


def get_invitations_table():
    return get_resource().Table(config.ADMIN_INVITATIONS_TABLE)


def get_audit_table():
    return get_resource().Table(config.ADMIN_AUDIT_TABLE)


def get_analytics_events_table():
    return get_resource().Table(config.ANALYTICS_EVENTS_TABLE)


def get_analytics_agg_table():
    return get_resource().Table(config.ANALYTICS_AGG_TABLE)


# Key schemas of the admin/analytics tables (mirrors Terraform modules/database).
# Used by ensure_tables() for DynamoDB Local and by the tests.
ADMIN_TABLE_SPECS = {
    "ADMINS_TABLE": {
        "KeySchema": [{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        "AttributeDefinitions": [{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
    },
    "ADMIN_INVITATIONS_TABLE": {
        "KeySchema": [{"AttributeName": "invitation_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [
            {"AttributeName": "invitation_id", "AttributeType": "S"},
            {"AttributeName": "email_lower", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
            {"AttributeName": "created_at", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "email_lower-index",
                "KeySchema": [{"AttributeName": "email_lower", "KeyType": "HASH"}, {"AttributeName": "created_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "status-index",
                "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "created_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
    },
    "ADMIN_AUDIT_TABLE": {
        "KeySchema": [{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        "AttributeDefinitions": [{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
    },
    "ANALYTICS_EVENTS_TABLE": {
        "KeySchema": [{"AttributeName": "event_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [{"AttributeName": "event_id", "AttributeType": "S"}],
    },
    "ANALYTICS_AGG_TABLE": {
        "KeySchema": [{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        "AttributeDefinitions": [{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
    },
}


def ensure_admin_tables(client=None) -> None:
    """Create the admin + analytics tables if missing (DynamoDB Local / tests)."""
    client = client or get_resource().meta.client
    existing = set(client.list_tables().get("TableNames", []))
    for setting, spec in ADMIN_TABLE_SPECS.items():
        name = getattr(config, setting)
        if name not in existing:
            client.create_table(TableName=name, BillingMode="PAY_PER_REQUEST", **spec)


# --- Local dev: create tables if missing ----------------------------------

def ensure_tables() -> None:
    """Create the DynamoDB tables if they don't exist (DynamoDB Local / dev)."""
    client = get_resource().meta.client
    existing = set(client.list_tables().get("TableNames", []))

    if config.USERS_TABLE not in existing:
        client.create_table(
            TableName=config.USERS_TABLE,
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "user_id", "AttributeType": "S"}],
        )
    if config.CHAT_HISTORY_TABLE not in existing:
        client.create_table(
            TableName=config.CHAT_HISTORY_TABLE,
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "chat_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "chat_id", "AttributeType": "S"},
            ],
        )
    attachments_table = getattr(config, "ATTACHMENTS_TABLE", None)
    if attachments_table and attachments_table not in existing:
        client.create_table(
            TableName=attachments_table,
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "attachment_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "attachment_id", "AttributeType": "S"},
            ],
        )
    ensure_admin_tables(client)
