"""Cognito JWT verification for the admin routes ONLY.

Every other route trusts the API Gateway JWT authorizer and reads the verified
subject from ``x-user-id`` (see cognito_auth.py). ``/api/admin/*`` verifies the
token a second time here because it grants the most privilege: the gateway is
the first layer, this is the second, and the ``admins`` table is the third.

Checked for every token: RS256 signature against the pool's JWKS (cached),
``iss`` = the pool, ``exp``/``iat`` present and valid, and ``token_use``.
Access tokens carry ``client_id`` (no ``aud``); ID tokens carry ``aud``. Both
must equal the app client id.

Tokens are never logged.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import jwt
from jwt import PyJWKClient

from app.core import config

logger = logging.getLogger("sankatai.auth")

_LEEWAY_SECONDS = 5
_JWKS_CACHE_SECONDS = 3600


class TokenError(Exception):
    """The token is missing, malformed, forged, expired or for another client."""


class VerifierUnavailable(Exception):
    """The verifier is not configured or the JWKS could not be fetched."""


_jwks_client: PyJWKClient | None = None
_jwks_lock = threading.Lock()


def issuer() -> str:
    return f"https://cognito-idp.{config.AWS_REGION}.amazonaws.com/{config.COGNITO_USER_POOL_ID}"


def _client() -> PyJWKClient:
    global _jwks_client
    if not (config.COGNITO_USER_POOL_ID and config.COGNITO_APP_CLIENT_ID):
        raise VerifierUnavailable("COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID are not set.")
    with _jwks_lock:
        if _jwks_client is None:
            _jwks_client = PyJWKClient(
                f"{issuer()}/.well-known/jwks.json",
                cache_keys=True,
                lifespan=_JWKS_CACHE_SECONDS,
                timeout=5,
            )
        return _jwks_client


def _decode(token: str, *, audience: str | None) -> dict[str, Any]:
    if not token or token.count(".") != 2:
        raise TokenError("malformed")
    try:
        signing_key = _client().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as exc:
        raise VerifierUnavailable("JWKS unreachable") from exc
    except (jwt.PyJWKClientError, jwt.DecodeError) as exc:
        # Unknown kid (forged or from another pool) or an unparsable header.
        raise TokenError("unknown signing key") from exc
    try:
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer(),
            audience=audience,
            leeway=_LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "sub", "token_use"]},
        )
    except jwt.InvalidTokenError as exc:
        raise TokenError(type(exc).__name__) from exc


def verify_access_token(token: str) -> dict[str, Any]:
    """Verified claims of a Cognito ACCESS token for this app client."""
    claims = _decode(token, audience=None)
    if claims.get("token_use") != "access":
        raise TokenError("not an access token")
    if claims.get("client_id") != config.COGNITO_APP_CLIENT_ID:
        raise TokenError("wrong client")
    return claims


def verify_id_token(token: str) -> dict[str, Any]:
    """Verified claims of a Cognito ID token for this app client (has email)."""
    claims = _decode(token, audience=config.COGNITO_APP_CLIENT_ID)
    if claims.get("token_use") != "id":
        raise TokenError("not an id token")
    return claims


def claim_groups(claims: dict[str, Any]) -> list[str]:
    groups = claims.get("cognito:groups") or []
    return [str(g) for g in groups] if isinstance(groups, list) else []
