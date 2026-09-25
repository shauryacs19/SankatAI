"""FastAPI dependencies for the admin console.

Three independent checks, all server-side, all required for ``require_admin``:
  1. API Gateway's JWT authorizer (already passed, or the request never
     arrived) — it put the verified ``sub`` in ``x-user-id``.
  2. This backend re-verifies the bearer token (signature/JWKS, iss, client,
     token_use, exp), requires its ``sub`` to equal ``x-user-id``, and reads
     ``cognito:groups`` from it.
  3. The ``admins`` table row for that ``sub`` must be ``active``. Revoking an
     admin flips this row, so access ends immediately even while an access
     token that still carries the ADMIN group is valid.

Nothing sent by the client (emails, ids, custom headers, flags) is trusted.
``x-client-ip`` / ``x-request-id`` are overwritten by API Gateway and are used
for the audit trail only, never for a decision.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, Request, status

from app.core import config
from app.integrations.aws import cognito_jwt
from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.repositories import admin_repository
from app.services import audit_service
from app.services.audit_service import AuditContext

logger = logging.getLogger("sankatai.auth")


@dataclass
class VerifiedCaller:
    sub: str
    username: str
    claims: dict[str, Any]
    ctx: AuditContext


@dataclass
class AdminPrincipal(VerifiedCaller):
    email_lower: str | None = None


def audit_context(request: Request, sub: str) -> AuditContext:
    return AuditContext(
        actor_sub=sub,
        ip=request.headers.get("x-client-ip"),
        user_agent=request.headers.get("user-agent"),
        request_id=request.headers.get("x-request-id"),
    )


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authentication.", headers={"WWW-Authenticate": "Bearer"})
    return token.strip()


def verified_caller(request: Request, user: CurrentUser = Depends(get_current_user)) -> VerifiedCaller:
    """An authenticated caller whose token this backend has verified itself."""
    if not config.AUTH_ENABLED:
        # Local development only (see config.AUTH_ENABLED): no gateway, no token.
        claims = {"sub": user.user_id, "username": user.user_id, "cognito:groups": [config.ADMIN_GROUP]}
        return VerifiedCaller(user.user_id, user.user_id, claims, audit_context(request, user.user_id))
    try:
        claims = cognito_jwt.verify_access_token(_bearer(request))
    except cognito_jwt.VerifierUnavailable as error:
        logger.error("Admin token verification unavailable: %s", error)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authorization service unavailable.") from error
    except cognito_jwt.TokenError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token.",
                            headers={"WWW-Authenticate": "Bearer"}) from error
    if claims["sub"] != user.user_id:
        # The gateway verified a different token than the one presented here.
        logger.warning("Admin token subject does not match the gateway identity.")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token.")
    username = str(claims.get("username") or claims["sub"])
    return VerifiedCaller(claims["sub"], username, claims, audit_context(request, claims["sub"]))


def require_admin(request: Request, caller: VerifiedCaller = Depends(verified_caller)) -> AdminPrincipal:
    reason = None
    record = None
    if config.ADMIN_GROUP not in cognito_jwt.claim_groups(caller.claims):
        reason = "not_in_admin_group"
    else:
        record = admin_repository.get_admin(caller.sub)
        if not record or record.get("status") != "active":
            reason = "admin_record_inactive"
    if reason:
        audit_service.record(caller.ctx, "access_denied", f"route:{request.url.path}"[:200], "denied", reason)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required.")
    return AdminPrincipal(caller.sub, caller.username, caller.claims, caller.ctx,
                          email_lower=(record or {}).get("email_lower"))
