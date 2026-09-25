"""Cognito user-pool administration: ADMIN group membership + pool metadata.

Called as the backend instance role, whose policy allows exactly these actions
on this one pool ARN. ``username`` is the Cognito username; in this pool
(username_attributes = email) that is the user's ``sub``.
"""

from __future__ import annotations

from typing import Any

import boto3
from botocore.config import Config

from app.core import config

_client = None


def client():
    global _client
    if _client is None:
        _client = boto3.client(
            "cognito-idp",
            region_name=config.AWS_REGION,
            config=Config(connect_timeout=3, read_timeout=5, retries={"max_attempts": 2}),
        )
    return _client


def add_to_admin_group(username: str) -> None:
    client().admin_add_user_to_group(
        UserPoolId=config.COGNITO_USER_POOL_ID, Username=username, GroupName=config.ADMIN_GROUP,
    )


def remove_from_admin_group(username: str) -> None:
    client().admin_remove_user_from_group(
        UserPoolId=config.COGNITO_USER_POOL_ID, Username=username, GroupName=config.ADMIN_GROUP,
    )


def global_sign_out(username: str) -> None:
    """Revoke every refresh token of the user (access tokens die at expiry)."""
    client().admin_user_global_sign_out(UserPoolId=config.COGNITO_USER_POOL_ID, Username=username)


def describe_pool() -> dict[str, Any]:
    return client().describe_user_pool(UserPoolId=config.COGNITO_USER_POOL_ID)["UserPool"]


def estimated_user_count() -> int:
    """Cognito's own (approximate) count of users in the pool."""
    return int(describe_pool().get("EstimatedNumberOfUsers", 0))


def is_not_found(error: Exception) -> bool:
    code = getattr(error, "response", {}).get("Error", {}).get("Code")
    return code in {"UserNotFoundException", "ResourceNotFoundException"}
