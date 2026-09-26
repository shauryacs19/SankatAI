"""Admin access management: invitations, acceptance, removal, listing.

Invitation link token = ``<invitation_id>.<secret>``. The id selects the row;
only ``sha256(secret)`` is stored and it is compared in constant time. The
token is emailed once and never logged, stored, or returned by any API.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.aws import cognito_admin, cognito_jwt, ses_mail
from app.repositories import admin_repository as repo
from app.repositories.admin_repository import TransactionFailed
from app.services import audit_service
from app.services.audit_service import AuditContext, mask_email

logger = logging.getLogger("sankatai.admin")

GMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@gmail\.com$")
_TOKEN_RE = re.compile(r"^([0-9a-f]{32})\.([A-Za-z0-9_-]{32,64})$")
_invite_limiter = SlidingWindowLimiter(lambda: config.ADMIN_INVITES_PER_HOUR, window_seconds=3600)


class AdminError(Exception):
    """A user-facing failure with a stable ``code`` the web app can branch on."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


# Safe, distinct messages for the invitation outcomes.
INVITE_ERRORS = {
    "invalid": (400, "This invitation link is not valid. Ask an admin to send a new one."),
    "expired": (410, "This invitation has expired. Ask an admin to send a new one."),
    "accepted": (409, "This invitation has already been used."),
    "revoked": (410, "This invitation was revoked by an admin."),
    "wrong_email": (403, "This invitation was sent to a different email address. Sign in with the invited Gmail account."),
    "email_unverified": (403, "Your email address is not verified yet. Verify it, then open the link again."),
    "already_admin": (409, "You already have admin access."),
}


def _invite_error(code: str) -> AdminError:
    status, message = INVITE_ERRORS[code]
    return AdminError(status, code, message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def normalize_gmail(raw: str) -> str:
    email = (raw or "").strip().lower()
    if len(email) > 254 or not GMAIL_RE.match(email):
        raise AdminError(422, "invalid_email", "Enter a Gmail address (name@gmail.com).")
    return email


def _active_admin_by_email(email_lower: str) -> Optional[dict]:
    return next((a for a in repo.list_admins() if a.get("status") == "active" and a.get("email_lower") == email_lower), None)


def _invitation_view(item: dict) -> dict:
    status = item.get("status")
    if status == "pending" and item.get("expires_at", "") <= _iso(_now()):
        status = "expired"
    return {
        "id": item["invitation_id"],
        "email": item.get("email_lower"),
        "status": status,
        "createdAt": item.get("created_at"),
        "expiresAt": item.get("expires_at"),
        "inviterSub": item.get("inviter_sub"),
        "emailStatus": item.get("email_status"),
        "acceptedAt": item.get("accepted_at"),
        "revokedAt": item.get("revoked_at"),
    }


def _send_invite_email(email: str, invitation_id: str, secret: str, expires_at: datetime) -> None:
    link = f"{config.APP_URL}/admin/invite/accept?token={invitation_id}.{secret}"
    expires = expires_at.strftime("%d %b %Y, %H:%M UTC")
    text = (
        "You have been invited to become an administrator of Sankat.AI.\n\n"
        f"Accept the invitation (sign in with this Gmail account):\n{link}\n\n"
        f"The link works once and expires on {expires}. If you did not expect this, ignore this email."
    )
    safe_link = html.escape(link, quote=True)
    body = (
        "<p>You have been invited to become an administrator of <b>Sankat.AI</b>.</p>"
        f'<p><a href="{safe_link}">Accept the invitation</a> and sign in with this Gmail account.</p>'
        f"<p>The link works once and expires on {html.escape(expires)}. "
        "If you did not expect this, ignore this email.</p>"
    )
    ses_mail.send(email, "Your Sankat.AI admin invitation", text, body)


def create_invitation(ctx: AuditContext, raw_email: str) -> dict:
    email = normalize_gmail(raw_email)
    if not ses_mail.configured():
        raise AdminError(503, "email_not_configured", "Invitation email is not configured (SES_SENDER_EMAIL / APP_URL).")
    if not _invite_limiter.allow(ctx.actor_sub):
        audit_service.record(ctx, "invite_create", f"invitee:{mask_email(email)}", "denied", "rate_limited")
        raise AdminError(429, "rate_limited", f"Invite limit reached ({config.ADMIN_INVITES_PER_HOUR} per hour). Try again later.")
    if _active_admin_by_email(email):
        raise AdminError(409, "already_admin", "That account is already an admin.")

    now = _now()
    expires_at = now + timedelta(hours=config.ADMIN_INVITE_TTL_HOURS)
    secret = secrets.token_urlsafe(32)
    common = {
        "token_hash": hash_secret(secret),
        "expires_at": _iso(expires_at),
        # Keep the row 30 days past expiry so an old link still gets "expired".
        "ttl": int(expires_at.timestamp()) + 30 * 86400,
        "last_sent_by": ctx.actor_sub,
        "last_sent_at": _iso(now),
        "email_status": "sending",
    }

    invitation_id = None
    for item in repo.invitations_for_email(email):
        if item.get("status") != "pending":
            continue
        if item.get("expires_at", "") > _iso(now) and invitation_id is None:
            # Rotate the live invite: the old link stops working immediately.
            if repo.update_invitation(item["invitation_id"], common, expect_status="pending"):
                invitation_id = item["invitation_id"]
        else:
            repo.update_invitation(item["invitation_id"], {"status": "expired"}, expect_status="pending")
    action = "invite_rotate" if invitation_id else "invite_create"
    if invitation_id is None:
        invitation_id = uuid.uuid4().hex
        repo.create_invitation({
            "invitation_id": invitation_id, "email_lower": email, "inviter_sub": ctx.actor_sub,
            "created_at": _iso(now), "status": "pending", **common,
        })

    resource = f"invitation:{invitation_id} invitee:{mask_email(email)}"
    try:
        _send_invite_email(email, invitation_id, secret, expires_at)
    except (BotoCoreError, ClientError) as error:
        repo.update_invitation(invitation_id, {"email_status": "failed"})
        logger.error("Invitation email failed: %s", type(error).__name__)
        audit_service.record(ctx, action, resource, "error", "email_failed")
        raise AdminError(502, "email_failed", "The invitation was saved but the email could not be sent. Try again.") from error
    repo.update_invitation(invitation_id, {"email_status": "sent"})
    audit_service.record(ctx, action, resource, "success")
    return _invitation_view(repo.get_invitation(invitation_id))


def list_invitations() -> list[dict]:
    items = repo.invitations_by_status("pending", 100)
    for status in ("accepted", "revoked", "expired"):
        items.extend(repo.invitations_by_status(status, 25))
    views = [_invitation_view(i) for i in items]
    return sorted(views, key=lambda v: v.get("createdAt") or "", reverse=True)


def revoke_invitation(ctx: AuditContext, invitation_id: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", invitation_id or ""):
        raise AdminError(404, "not_found", "Invitation not found.")
    resource = f"invitation:{invitation_id}"
    ok = repo.update_invitation(
        invitation_id, {"status": "revoked", "revoked_at": _iso(_now()), "revoked_by": ctx.actor_sub},
        expect_status="pending",
    )
    if not ok:
        audit_service.record(ctx, "invite_revoke", resource, "denied", "not_pending")
        raise AdminError(409, "not_pending", "Only pending invitations can be revoked.")
    audit_service.record(ctx, "invite_revoke", resource, "success")
    return _invitation_view(repo.get_invitation(invitation_id))


def _email_claims(id_token: str, sub: str) -> tuple[str, bool]:
    if not config.AUTH_ENABLED:
        return "dev@gmail.com", True
    try:
        claims = cognito_jwt.verify_id_token(id_token)
    except cognito_jwt.TokenError as error:
        raise AdminError(401, "invalid_id_token", "Your sign-in could not be verified. Sign in again.") from error
    if claims.get("sub") != sub:
        raise AdminError(401, "invalid_id_token", "Your sign-in could not be verified. Sign in again.")
    verified = claims.get("email_verified")
    return str(claims.get("email") or "").strip().lower(), verified is True or str(verified).lower() == "true"


def accept_invitation(ctx: AuditContext, sub: str, username: str, token: str, id_token: str) -> dict:
    def fail(code: str, resource: str = "invitation:unknown") -> AdminError:
        audit_service.record(ctx, "invite_accept", resource, "denied", code)
        return _invite_error(code)

    match = _TOKEN_RE.match(token or "")
    if not match:
        raise fail("invalid")
    invitation_id, secret = match.groups()
    resource = f"invitation:{invitation_id}"
    item = repo.get_invitation(invitation_id)
    presented = hash_secret(secret)
    # Constant-time comparison; an unknown id still pays for one comparison.
    stored = (item or {}).get("token_hash") or "0" * 64
    if not hmac.compare_digest(presented, stored) or not item:
        raise fail("invalid", resource)

    status = item.get("status")
    if status == "accepted":
        raise fail("accepted", resource)
    if status == "revoked":
        raise fail("revoked", resource)
    if status == "expired" or item.get("expires_at", "") <= _iso(_now()):
        repo.update_invitation(invitation_id, {"status": "expired"}, expect_status="pending")
        raise fail("expired", resource)

    email, email_verified = _email_claims(id_token, sub)
    if not email_verified:
        raise fail("email_unverified", resource)
    if not hmac.compare_digest(email.encode(), str(item["email_lower"]).encode()):
        raise fail("wrong_email", resource)
    existing = repo.get_admin(sub)
    if existing and existing.get("status") == "active":
        raise fail("already_admin", resource)

    # Cognito group first; if the one-time DB transaction then fails, undo it.
    try:
        cognito_admin.add_to_admin_group(username)
    except (BotoCoreError, ClientError) as error:
        logger.error("AdminAddUserToGroup failed: %s", type(error).__name__)
        audit_service.record(ctx, "invite_accept", resource, "error", "cognito_add_failed")
        raise AdminError(502, "cognito_failed", "Could not grant access right now. Try again in a minute.") from error
    try:
        repo.accept_invitation(invitation_id, stored, sub, username, email, item["inviter_sub"], _iso(_now()))
    except TransactionFailed as failed:
        # reasons = [invitation, admin row, counter]. If the row failed, the
        # user became an active admin concurrently: keep their group.
        if failed.reasons[1] != "ConditionalCheckFailed":
            try:
                cognito_admin.remove_from_admin_group(username)
            except (BotoCoreError, ClientError) as error:
                logger.error("Compensating AdminRemoveUserFromGroup failed: %s", type(error).__name__)
        if failed.reasons[0] == "ConditionalCheckFailed":
            latest = repo.get_invitation(invitation_id) or {}
            code = {"accepted": "accepted", "revoked": "revoked"}.get(latest.get("status"), "expired")
            if latest.get("status") == "pending" and latest.get("token_hash") != stored:
                code = "invalid"  # rotated while this request was in flight
            raise fail(code, resource) from failed
        if failed.reasons[1] == "ConditionalCheckFailed":
            raise fail("already_admin", resource) from failed
        audit_service.record(ctx, "invite_accept", resource, "error", "transaction_conflict")
        raise AdminError(503, "busy", "Could not complete the request. Try again.") from failed

    audit_service.record(ctx, "invite_accept", resource, "success")
    audit_service.record(ctx, "permission_change", f"admin:{sub} grant via {resource}", "success")
    return {"status": "accepted", "refreshRequired": True}


def _is_root(record: Optional[dict]) -> bool:
    """The root admin: set only by scripts/bootstrap_admin.py, never via the API."""
    return bool(record) and record.get("role") == repo.ROOT_ROLE


def list_admins(current_sub: str) -> dict:
    items = repo.list_admins()
    admins = [
        {
            "sub": a["sk"], "email": a.get("email_lower"), "status": a.get("status"),
            "grantedAt": a.get("granted_at"), "grantedBy": a.get("granted_by"), "grantedVia": a.get("granted_via"),
            "revokedAt": a.get("revoked_at"), "revokedBy": a.get("revoked_by"),
            "cognitoCleanup": a.get("cognito_cleanup"), "isSelf": a["sk"] == current_sub, "isRoot": _is_root(a),
        }
        for a in items
    ]
    admins.sort(key=lambda a: (not a["isRoot"], a["status"] != "active", a.get("grantedAt") or ""))
    can_remove_others = any(a["sk"] == current_sub and a.get("status") == "active" and _is_root(a) for a in items)
    return {"admins": admins, "activeCount": repo.active_count(), "canRemoveOthers": can_remove_others}


def _cognito_cleanup(username: str) -> str:
    """Remove from the ADMIN group and revoke refresh tokens. 'done' or 'failed'."""
    try:
        for step in (cognito_admin.remove_from_admin_group, cognito_admin.global_sign_out):
            try:
                step(username)
            except ClientError as error:
                if not cognito_admin.is_not_found(error):
                    raise
        return "done"
    except (BotoCoreError, ClientError) as error:
        logger.error("Cognito cleanup after admin removal failed: %s", type(error).__name__)
        return "failed"


def remove_admin(ctx: AuditContext, target_sub: str, confirm_self: bool) -> dict:
    resource = f"admin:{target_sub}"
    if target_sub == ctx.actor_sub and not confirm_self:
        raise AdminError(400, "confirm_required", "Removing yourself needs confirmation.")
    record = repo.get_admin(target_sub)
    if not record:
        raise AdminError(404, "not_found", "Admin not found.")
    # The root admin is permanent, and only the root admin removes OTHER
    # admins; anyone may still leave. Root is a role stored in the admins row
    # (set by the operator bootstrap script), not an email/id allow-list.
    if _is_root(record):
        audit_service.record(ctx, "admin_remove", resource, "denied", "root_protected")
        raise AdminError(403, "root_protected", "The root admin can't be removed.")
    if target_sub != ctx.actor_sub:
        actor = repo.get_admin(ctx.actor_sub)
        if not (_is_root(actor) and actor.get("status") == "active"):
            audit_service.record(ctx, "admin_remove", resource, "denied", "root_only")
            raise AdminError(403, "root_only", "Only the root admin can remove other admins.")

    if record.get("status") == "active":
        try:
            repo.revoke_admin(target_sub, ctx.actor_sub, _iso(_now()))
        except TransactionFailed as failed:
            # reasons = [admin row, counter]
            if failed.reasons[0] == "ConditionalCheckFailed":
                if _is_root(repo.get_admin(target_sub)):
                    audit_service.record(ctx, "admin_remove", resource, "denied", "root_protected")
                    raise AdminError(403, "root_protected", "The root admin can't be removed.") from failed
                audit_service.record(ctx, "admin_remove", resource, "denied", "not_active")
                raise AdminError(409, "not_active", "That admin is no longer active.") from failed
            if failed.reasons[1] == "ConditionalCheckFailed":
                audit_service.record(ctx, "admin_remove", resource, "denied", "last_admin")
                raise AdminError(409, "last_admin", "You can't remove the last active admin. Invite another admin first.") from failed
            raise
    # Revoked in the table (access is already gone); now Cognito. Retrying a
    # removal of an already-revoked admin re-runs just this cleanup.
    cleanup = _cognito_cleanup(str(record.get("username") or target_sub))
    repo.set_admin_attrs(target_sub, {"cognito_cleanup": cleanup})
    audit_service.record(ctx, "admin_remove", resource, "success" if cleanup == "done" else "partial",
                         None if cleanup == "done" else "cognito_cleanup_failed")
    audit_service.record(ctx, "permission_change", f"{resource} revoke", "success")
    return {"status": "revoked", "cognitoCleanup": cleanup, "self": target_sub == ctx.actor_sub}


def bootstrap(email_lower: str, sub: str, username: str, root: bool = False) -> bool:
    """Operator bootstrap/recovery (scripts/bootstrap_admin.py). Idempotent.
    ``root=True`` also makes this admin the single, permanent root admin."""
    if root and any(_is_root(a) and a["sk"] != sub for a in repo.list_admins()):
        raise AdminError(409, "root_exists", "Another account is already the root admin.")
    now = _iso(_now())
    cognito_admin.add_to_admin_group(username)
    created = repo.grant_admin(sub, username, email_lower, "system:bootstrap", "bootstrap", now)
    system = AuditContext(actor_sub="system:bootstrap")
    audit_service.record(system, "admin_bootstrap", f"admin:{sub}", "success" if created else "noop")
    if root and not _is_root(repo.get_admin(sub)):
        repo.set_admin_attrs(sub, {"role": repo.ROOT_ROLE})
        audit_service.record(system, "permission_change", f"admin:{sub} root", "success")
    return created
