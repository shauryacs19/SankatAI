"""Cognito pre sign-up trigger for the SankatAI pool.

Deployed by infrastructure/terraform/modules/security/cognito (Lambda, Python
3.12), wired to the pool's pre sign-up trigger:

PreSignUp_SignUp (email or phone sign-up in the apps)
  - require an email address or a phone number
  - refuse an email or phone that another account has already VERIFIED, so the
    person is told to sign in instead. An unverified duplicate (an abandoned
    sign-up) does not block anyone.

There are no usernames: people sign in with their email or phone. Any other
trigger source passes through unchanged. Emails and phone numbers are never
logged.
"""

from __future__ import annotations

import logging

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)

_client = None


def _cognito():
    global _client
    if _client is None:
        _client = boto3.client("cognito-idp")
    return _client


def _users_with(pool_id: str, attribute: str, value: str) -> list[dict]:
    safe = value.replace("\\", "\\\\").replace('"', '\\"')
    return _cognito().list_users(UserPoolId=pool_id, Filter=f'{attribute} = "{safe}"', Limit=10).get("Users", [])


def _attr(user: dict, name: str):
    return next((a["Value"] for a in user.get("Attributes", []) if a["Name"] == name), None)


def _check_sign_up(event: dict) -> None:
    pool_id = event["userPoolId"]
    attrs = event.get("request", {}).get("userAttributes", {})
    email = (attrs.get("email") or "").strip().lower()
    phone = (attrs.get("phone_number") or "").strip()
    if not email and not phone:
        raise Exception("Add an email address or a phone number")
    if email:
        if any(_attr(u, "email_verified") == "true" for u in _users_with(pool_id, "email", email)):
            raise Exception("An account with this email already exists. Sign in instead")
    if phone:
        if any(_attr(u, "phone_number_verified") == "true" for u in _users_with(pool_id, "phone_number", phone)):
            raise Exception("An account with this phone number already exists. Sign in instead")


def handler(event, context):
    source = event.get("triggerSource")
    if source == "PreSignUp_SignUp":
        _check_sign_up(event)
    return event
