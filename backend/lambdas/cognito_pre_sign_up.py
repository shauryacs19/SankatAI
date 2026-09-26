"""Cognito pre sign-up trigger for the SankatAI user pool.

Deployed by infrastructure/terraform/modules/security/cognito (Lambda, Python
3.12). Runs before Cognito creates any user:

PreSignUp_SignUp (email or phone sign-up in the apps)
  - require an email address or a phone number
  - refuse an email or phone that another account has already VERIFIED, so the
    person is told to sign in instead. An unverified duplicate (an abandoned
    sign-up) does not block anyone.

PreSignUp_ExternalProvider (Google / Facebook)
  - Google, with a verified email that belongs to exactly one existing
    email/password account: link the Google identity to that account
    (AdminLinkProviderForUser), so both sign-ins reach the same user and data.
  - Facebook does not assert that an email is verified, so it is never linked
    automatically; linking on an unverified email would allow account takeover.

Emails and phone numbers are never logged.
"""

from __future__ import annotations

import logging

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)

_PROVIDERS = {"google": "Google", "facebook": "Facebook"}
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


def _is_external(user: dict) -> bool:
    return user.get("UserStatus") == "EXTERNAL_PROVIDER"


def _check_sign_up(event: dict) -> None:
    pool_id = event["userPoolId"]
    attrs = event.get("request", {}).get("userAttributes", {})
    email = (attrs.get("email") or "").strip().lower()
    phone = (attrs.get("phone_number") or "").strip()
    if not email and not phone:
        raise Exception("Add an email address or a phone number")
    if email:
        # A social account's email came from the provider, so it counts as taken.
        if any(_attr(u, "email_verified") == "true" or _is_external(u) for u in _users_with(pool_id, "email", email)):
            raise Exception("An account with this email already exists. Sign in instead")
    if phone:
        if any(_attr(u, "phone_number_verified") == "true" for u in _users_with(pool_id, "phone_number", phone)):
            raise Exception("An account with this phone number already exists. Sign in instead")


def _link_external(event: dict) -> None:
    pool_id = event["userPoolId"]
    attrs = event.get("request", {}).get("userAttributes", {})
    key, _, provider_sub = str(event.get("userName", "")).partition("_")
    provider = _PROVIDERS.get(key.lower())
    email = (attrs.get("email") or "").strip().lower()
    verified = str(attrs.get("email_verified", "")).lower() == "true"
    if provider != "Google" or not (email and verified and provider_sub):
        return
    matches = [
        u for u in _users_with(pool_id, "email", email)
        if not _is_external(u) and _attr(u, "email_verified") == "true"
    ]
    if len(matches) != 1:
        return
    _cognito().admin_link_provider_for_user(
        UserPoolId=pool_id,
        DestinationUser={"ProviderName": "Cognito", "ProviderAttributeValue": matches[0]["Username"]},
        SourceUser={"ProviderName": provider, "ProviderAttributeName": "Cognito_Subject", "ProviderAttributeValue": provider_sub},
    )
    log.info("Linked a %s identity to an existing account", provider)


def handler(event, context):
    source = event.get("triggerSource")
    if source == "PreSignUp_SignUp":
        _check_sign_up(event)
    elif source == "PreSignUp_ExternalProvider":
        _link_external(event)
    return event
