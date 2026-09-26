"""Cognito pre sign-up and post confirmation triggers for the SankatAI pool.

Deployed by infrastructure/terraform/modules/security/cognito (Lambda, Python
3.12), wired to both triggers of the pool:

PreSignUp_SignUp (email or phone sign-up in the apps)
  - require an email address or a phone number
  - refuse an email or phone that another account has already VERIFIED, so the
    person is told to sign in instead. An unverified duplicate (an abandoned
    sign-up) does not block anyone.
  - check the chosen username (ClientMetadata.preferred_username): format and
    not already taken. Cognito won't accept preferred_username on an
    unconfirmed account in a pool where it is an alias, so it can't be a
    sign-up attribute.

PostConfirmation_ConfirmSignUp
  - set preferred_username from ConfirmSignUp's ClientMetadata, so the account
    can sign in with it immediately. If the name was taken in between, the
    account is left without one (the apps ask for it in Settings); this never
    fails the confirmation.

Emails, phone numbers and usernames are never logged.
"""

from __future__ import annotations

import logging
import re

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)

# Same rules as usernameError() in packages/shared/auth.js.
_USERNAME_RE = re.compile(r"^[a-z][a-z0-9_.]{2,19}$")
_RESERVED = {
    "admin", "administrator", "root", "sankatai", "sankat", "support", "help", "system",
    "security", "moderator", "staff", "official", "doctor", "emergency",
}

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


def _requested_username(event: dict):
    raw = (event.get("request", {}).get("clientMetadata") or {}).get("preferred_username")
    return None if raw is None else str(raw).strip().lower()


def _valid_username(handle: str) -> bool:
    return bool(_USERNAME_RE.match(handle)) and ".." not in handle and not handle.endswith(".") and handle not in _RESERVED


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
    handle = _requested_username(event)
    if handle is not None:
        if not _valid_username(handle):
            raise Exception("Choose a username of 3 to 20 letters, numbers, dots or underscores, starting with a letter")
        if _users_with(pool_id, "preferred_username", handle):
            raise Exception("That username is taken. Choose another")


def _set_username(event: dict) -> None:
    handle = _requested_username(event)
    if not handle or not _valid_username(handle):
        return
    try:
        _cognito().admin_update_user_attributes(
            UserPoolId=event["userPoolId"], Username=event["userName"],
            UserAttributes=[{"Name": "preferred_username", "Value": handle}],
        )
    except Exception as error:  # noqa: BLE001 - never fail the confirmation
        log.warning("Could not set the username after confirmation: %s", type(error).__name__)


def handler(event, context):
    source = event.get("triggerSource")
    if source == "PreSignUp_SignUp":
        _check_sign_up(event)
    elif source == "PostConfirmation_ConfirmSignUp":
        _set_username(event)
    return event
