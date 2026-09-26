"""Shared fixtures: moto-backed AWS, Cognito-shaped RS256 tokens, an admin app.

Analytics is OFF for every test unless a test opts in through ``aws``, so no
test can ever write to a real table.
"""

from __future__ import annotations

import os
import time
import uuid

# Fake credentials before anything creates a boto3 client.
for _k, _v in {"AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing",
               "AWS_SESSION_TOKEN": "testing", "AWS_DEFAULT_REGION": "ap-south-1"}.items():
    os.environ[_k] = _v

import jwt  # noqa: E402
import pytest  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import config  # noqa: E402

CLIENT_ID = "test-app-client"
KID = "test-kid"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def _analytics_off(monkeypatch):
    monkeypatch.setattr(config, "ANALYTICS_ENABLED", False)


class _SigningKey:
    def __init__(self, key):
        self.key = key


class FakeJwks:
    """Stands in for PyJWKClient: resolves our test kid to the test public key."""

    def get_signing_key_from_jwt(self, token):
        if jwt.get_unverified_header(token).get("kid") != KID:
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return _SigningKey(_KEY.public_key())


def make_token(sub: str, *, username: str | None = None, groups=(), token_use="access", client_id=CLIENT_ID,
               exp_in=3600, key=None, kid=KID, email=None, email_verified=True, issuer=None) -> str:
    now = int(time.time())
    claims = {
        "sub": sub, "iss": issuer or f"https://cognito-idp.ap-south-1.amazonaws.com/{config.COGNITO_USER_POOL_ID}",
        "iat": now - 10, "exp": now + exp_in, "token_use": token_use, "auth_time": now - 10,
    }
    if token_use == "access":
        claims.update(client_id=client_id, username=username or sub, scope="openid email profile")
        if groups:
            claims["cognito:groups"] = list(groups)
    else:
        claims.update(aud=client_id, email=email, email_verified=email_verified)
    return jwt.encode(claims, key or _KEY, algorithm="RS256", headers={"kid": kid})


def headers_for(sub: str, **kw) -> dict:
    return {"x-user-id": sub, "authorization": f"Bearer {make_token(sub, **kw)}"}


@pytest.fixture
def aws(monkeypatch):
    """moto for every AWS call, all admin/analytics tables, a Cognito pool with
    an ADMIN group, a verified SES sender, and analytics recording inline."""
    from moto import mock_aws

    with mock_aws():
        import boto3

        from app.integrations.aws import cloudwatch_metrics, cognito_admin, cognito_jwt, dynamo_client, ses_mail
        from app.services import admin_access_service, admin_health_service, analytics_service

        # Module-level boto3 clients must be rebuilt inside the mock.
        monkeypatch.setattr(dynamo_client, "_resource", None)
        for module in (cognito_admin, ses_mail, cloudwatch_metrics):
            monkeypatch.setattr(module, "_client", None)

        cognito = boto3.client("cognito-idp", region_name="ap-south-1")
        pool_id = cognito.create_user_pool(PoolName="test", UsernameAttributes=["email"])["UserPool"]["Id"]
        cognito.create_group(UserPoolId=pool_id, GroupName="ADMIN")
        boto3.client("ses", region_name="ap-south-1").verify_email_identity(EmailAddress="noreply@example.com")

        suffix = uuid.uuid4().hex[:6]
        settings = {
            "AUTH_ENABLED": True, "AWS_REGION": "ap-south-1",
            "COGNITO_USER_POOL_ID": pool_id, "COGNITO_APP_CLIENT_ID": CLIENT_ID,
            "ADMINS_TABLE": f"admins-{suffix}", "ADMIN_INVITATIONS_TABLE": f"invites-{suffix}",
            "ADMIN_AUDIT_TABLE": f"audit-{suffix}", "ANALYTICS_EVENTS_TABLE": f"events-{suffix}",
            "ANALYTICS_AGG_TABLE": f"agg-{suffix}", "USERS_TABLE": f"users-{suffix}",
            "CHAT_HISTORY_TABLE": f"chat-{suffix}", "ATTACHMENTS_TABLE": f"att-{suffix}",
            "CHAT_BUCKET": f"chat-bucket-{suffix}", "DOCUMENTS_BUCKET": f"docs-bucket-{suffix}",
            "SES_SENDER_EMAIL": "noreply@example.com", "APP_URL": "https://app.example.com",
            "ANALYTICS_ENABLED": True, "ANALYTICS_SALT": "test-salt", "API_GATEWAY_ID": "",
            "ADMIN_INVITES_PER_HOUR": 10,
        }
        for name, value in settings.items():
            monkeypatch.setattr(config, name, value)
        dynamo_client.ensure_tables()

        monkeypatch.setattr(cognito_jwt, "_jwks_client", FakeJwks())
        analytics_service.set_sync(True)
        analytics_service.reset_caches()
        admin_access_service._invite_limiter.reset()
        admin_health_service.clear_cache()
        try:
            yield {"cognito": cognito, "pool_id": pool_id}
        finally:
            analytics_service.set_sync(False)
            analytics_service.reset_caches()


def create_user(aws_ctx, email: str) -> tuple[str, str]:
    """A Cognito user; returns (sub, username)."""
    resp = aws_ctx["cognito"].admin_create_user(
        UserPoolId=aws_ctx["pool_id"], Username=email,
        UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}],
        MessageAction="SUPPRESS",
    )
    user = resp["User"]
    sub = next(a["Value"] for a in user["Attributes"] if a["Name"] == "sub")
    return sub, user["Username"]


def groups_of(aws_ctx, username: str) -> list[str]:
    resp = aws_ctx["cognito"].admin_list_groups_for_user(UserPoolId=aws_ctx["pool_id"], Username=username)
    return [g["GroupName"] for g in resp["Groups"]]


def make_admin(aws_ctx, email: str, root: bool = False) -> dict:
    """A bootstrapped admin: Cognito group + active row. Returns ids + headers."""
    from app.services import admin_access_service

    sub, username = create_user(aws_ctx, email)
    admin_access_service.bootstrap(email, sub, username, root=root)
    return {"sub": sub, "username": username, "email": email,
            "headers": headers_for(sub, username=username, groups=["ADMIN"])}


@pytest.fixture
def client(aws):
    from app.api.routes.admin import admin_error_handler, router
    from app.services.admin_access_service import AdminError

    app = FastAPI()
    app.include_router(router)
    app.add_exception_handler(AdminError, admin_error_handler)
    return TestClient(app)


__all__ = ["make_token", "headers_for", "create_user", "groups_of", "make_admin", "CLIENT_ID", "_OTHER_KEY"]
