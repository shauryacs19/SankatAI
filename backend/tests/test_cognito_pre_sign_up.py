"""Cognito pre sign-up Lambda: duplicate checks and Google account linking."""

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
        self.links = []

    def list_users(self, UserPoolId, Filter, Limit):
        name, value = Filter.split(" = ")
        value = value.strip('"')
        return {"Users": [u for u in self.users if trigger._attr(u, name) == value]}

    def admin_link_provider_for_user(self, **kwargs):
        self.links.append(kwargs)


@pytest.fixture
def cognito(monkeypatch):
    def install(users=()):
        fake = FakeCognito(list(users))
        monkeypatch.setattr(trigger, "_client", fake)
        return fake
    return install


def sign_up(**attrs):
    return {"triggerSource": "PreSignUp_SignUp", "userPoolId": POOL, "userName": "new-uuid",
            "request": {"userAttributes": attrs}}


def social(username, **attrs):
    return {"triggerSource": "PreSignUp_ExternalProvider", "userPoolId": POOL, "userName": username,
            "request": {"userAttributes": attrs}}


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


def test_google_account_email_counts_as_taken(cognito):
    cognito([user("google_1", status="EXTERNAL_PROVIDER", email="asha@gmail.com")])
    with pytest.raises(Exception, match="email already exists"):
        trigger.handler(sign_up(email="asha@gmail.com"), None)


def test_verified_phone_is_taken(cognito):
    cognito([user("u1", phone_number="+919876543210", phone_number_verified="true")])
    with pytest.raises(Exception, match="phone number already exists"):
        trigger.handler(sign_up(phone_number="+919876543210"), None)


def test_google_links_to_the_verified_email_account(cognito):
    fake = cognito([user("native-uuid", email="asha@gmail.com", email_verified="true")])
    trigger.handler(social("google_1234", email="asha@gmail.com", email_verified="true"), None)
    assert fake.links == [{
        "UserPoolId": POOL,
        "DestinationUser": {"ProviderName": "Cognito", "ProviderAttributeValue": "native-uuid"},
        "SourceUser": {"ProviderName": "Google", "ProviderAttributeName": "Cognito_Subject", "ProviderAttributeValue": "1234"},
    }]


@pytest.mark.parametrize("username,attrs", [
    ("google_1234", {"email": "asha@gmail.com", "email_verified": "false"}),   # Google says unverified
    ("facebook_99", {"email": "asha@gmail.com"}),                              # Facebook: never auto-linked
])
def test_no_link_without_a_verified_provider_email(cognito, username, attrs):
    fake = cognito([user("native-uuid", email="asha@gmail.com", email_verified="true")])
    trigger.handler(social(username, **attrs), None)
    assert fake.links == []


def test_no_link_to_an_unverified_or_social_account(cognito):
    fake = cognito([
        user("native-uuid", email="asha@gmail.com", email_verified="false"),
        user("facebook_1", status="EXTERNAL_PROVIDER", email="asha@gmail.com"),
    ])
    trigger.handler(social("google_1234", email="asha@gmail.com", email_verified="true"), None)
    assert fake.links == []


def test_admin_created_users_pass_through(cognito):
    fake = cognito()
    event = {"triggerSource": "PreSignUp_AdminCreateUser", "userPoolId": POOL, "userName": "x", "request": {"userAttributes": {}}}
    assert trigger.handler(event, None) is event and fake.links == []
