"""Cognito pre sign-up Lambda: duplicate email/phone checks."""

from __future__ import annotations

import importlib.util
import pathlib

import pytest

_PATH = pathlib.Path(__file__).resolve().parents[1] / "lambdas" / "cognito_pre_sign_up.py"
_spec = importlib.util.spec_from_file_location("cognito_pre_sign_up", _PATH)
trigger = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(trigger)

POOL = "ap-south-1_test"


def user(username, status="CONFIRMED", **attrs):
    return {"Username": username, "UserStatus": status, "Attributes": [{"Name": k, "Value": v} for k, v in attrs.items()]}


class FakeCognito:
    def __init__(self, users):
        self.users = users
        self.updates = []
        self.fail_update = False

    def list_users(self, UserPoolId, Filter, Limit):
        name, value = Filter.split(" = ")
        value = value.strip('"')
        return {"Users": [u for u in self.users if trigger._attr(u, name) == value]}

    def admin_update_user_attributes(self, UserPoolId, Username, UserAttributes):
        if self.fail_update:
            raise RuntimeError("AliasExistsException")
        self.updates.append((Username, UserAttributes))


@pytest.fixture
def cognito(monkeypatch):
    def install(users=()):
        fake = FakeCognito(list(users))
        monkeypatch.setattr(trigger, "_client", fake)
        return fake
    return install


def sign_up(metadata=None, **attrs):
    return {"triggerSource": "PreSignUp_SignUp", "userPoolId": POOL, "userName": "new-uuid",
            "request": {"userAttributes": attrs, "clientMetadata": metadata or {}}}


def confirmed(metadata):
    return {"triggerSource": "PostConfirmation_ConfirmSignUp", "userPoolId": POOL, "userName": "new-uuid",
            "request": {"userAttributes": {}, "clientMetadata": metadata}}


def test_sign_up_needs_email_or_phone(cognito):
    cognito()
    with pytest.raises(Exception, match="email address or a phone number"):
        trigger.handler(sign_up(name="Asha"), None)


def test_verified_email_is_taken(cognito):
    cognito([user("u1", email="asha@gmail.com", email_verified="true")])
    with pytest.raises(Exception, match="email already exists"):
        trigger.handler(sign_up(email="Asha@Gmail.com"), None)


def test_unverified_duplicate_does_not_block(cognito):
    cognito([user("u1", status="UNCONFIRMED", email="asha@gmail.com", email_verified="false")])
    event = sign_up(email="asha@gmail.com")
    assert trigger.handler(event, None) is event


def test_verified_phone_is_taken(cognito):
    cognito([user("u1", phone_number="+919876543210", phone_number_verified="true")])
    with pytest.raises(Exception, match="phone number already exists"):
        trigger.handler(sign_up(phone_number="+919876543210"), None)


def test_admin_created_users_pass_through(cognito):
    fake = cognito()
    event = {"triggerSource": "PreSignUp_AdminCreateUser", "userPoolId": POOL, "userName": "x", "request": {"userAttributes": {}}}
    assert trigger.handler(event, None) is event and fake.updates == []


def test_username_metadata_is_ignored(cognito):
    cognito()
    event = sign_up({"preferred_username": "admin"}, email="asha@gmail.com")
    assert trigger.handler(event, None) is event


def test_post_confirmation_passes_through(cognito):
    fake = cognito()
    event = confirmed({"preferred_username": "asha.k"})
    assert trigger.handler(event, None) is event
    assert fake.updates == []
