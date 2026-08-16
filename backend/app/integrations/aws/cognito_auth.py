"""Request identity, resolved from API Gateway-injected claim headers.

The backend performs **no JWT validation**. Both clients (web and mobile) send a
Cognito ACCESS token as ``Authorization: Bearer``; the API Gateway HTTP API JWT
authorizer verifies the signature, issuer, ``client_id`` and expiry, then
parameter mapping projects the verified subject onto a request header:

    x-user-id <- $context.authorizer.claims.sub   (overwrite:, not append)

A request reaching FastAPI has therefore already been authenticated. This module
only reads the resulting identity.

There is no ``x-user-email``: Cognito **access** tokens do not carry an ``email``
claim (that is ID-token-only), so ``CurrentUser.email`` is always ``None``. Call
sites persist it as-is; the clients already know the signed-in user's email from
Cognito if a screen needs to display it.

SECURITY — why the header can be trusted:
  1. ``overwrite:header.x-user-id`` in the integration REPLACES any value the
     caller supplied, so it cannot be injected through the gateway.
  2. The instance is in a private subnet with no public IP, and its security
     group admits the application port only from the internal ALB's security
     group. The ALB is ``internal = true`` and reachable only from the API
     Gateway VPC Link ENIs.
Both must hold. If the instance ever becomes directly reachable, this header
becomes forgeable and the whole authentication model collapses.
"""

from __future__ import annotations

import logging

from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from app.core import config

logger = logging.getLogger("sankatai.auth")


@dataclass
class CurrentUser:
    user_id: str
    email: str | None


def get_current_user(
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
) -> CurrentUser:
    """Return the identity API Gateway verified for this request."""
    if not config.AUTH_ENABLED:
        return CurrentUser(user_id="dev-user", email="dev@example.com")

    if not x_user_id:
        # Either the request bypassed API Gateway, or the authorizer's parameter
        # mapping is misconfigured. Both are failures, not anonymous access.
        # The header value is never logged — it is the user's Cognito subject.
        logger.warning(
            "Request reached the backend without x-user-id. Check the API Gateway "
            "authorizer parameter mapping and that the instance is not directly reachable."
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(user_id=x_user_id, email=None)
