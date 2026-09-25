"""Admin console endpoints (/api/admin/*).

Every route depends on ``require_admin`` except ``POST /invitations/accept``,
which only needs a verified (non-admin) caller: accepting is how a user
becomes an admin. Platform analytics here are aggregates only; no endpoint
returns patient data, message content, or per-user records.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, Response

from app.api.admin_auth import AdminPrincipal, VerifiedCaller, require_admin, verified_caller
from app.schemas.admin import AcceptInvitationRequest, CreateInvitationRequest
from app.services import admin_access_service, admin_health_service, analytics_service, audit_service
from app.services.admin_access_service import AdminError

router = APIRouter(prefix="/api/admin", tags=["Admin"])

NO_STORE = {"Cache-Control": "no-store"}


async def admin_error_handler(_request: Request, error: AdminError) -> JSONResponse:
    # `detail` stays a plain string (what both clients already display);
    # `code` lets the admin UI branch on the outcome.
    return JSONResponse(status_code=error.status, content={"detail": error.message, "code": error.code})


def _range(from_: Optional[str], to: Optional[str], granularity: str) -> dict:
    try:
        return analytics_service.parse_range(from_, to, granularity)
    except analytics_service.RangeError as error:
        raise HTTPException(422, str(error)) from error


def _window(rng: dict) -> tuple[datetime, datetime]:
    tz = analytics_service.tz()
    start = datetime.combine(rng["start"], time.min, tz).astimezone(timezone.utc)
    end = datetime.combine(rng["end"] + timedelta(days=1), time.min, tz).astimezone(timezone.utc)
    # Floor "now" to the minute so the 60 s cache can actually hit.
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    return start, min(end, now)


def _json(data: dict) -> str:
    return json.dumps(data, default=str)


def _resource(rng: dict) -> str:
    return f"range:{rng['days'][0]}..{rng['days'][-1]}/{rng['granularity']}"


def _csv(data: dict) -> str:
    """Daily/hourly aggregates only — the same numbers the dashboard shows."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    columns = [
        ("new_users", "users", "new"), ("active_users", "users", "active"),
        ("ai_requests", "ai", "requests"), ("ai_responses", "ai", "responses"), ("ai_failed", "ai", "failed"),
        ("feedback_up", "feedback", "up"), ("feedback_down", "feedback", "down"),
        *[(f"triage_{s.lower()}", "triage", s) for s in analytics_service.SEVERITIES],
        ("conversations_started", "activity", "conversations"), ("vault_uploads", "activity", "vault"),
        ("chat_attachments", "activity", "chat"),
    ]
    writer.writerow(["period", *[c[0] for c in columns]])
    for i, label in enumerate(data["range"]["labels"]):
        row = [label]
        for _, section, key in columns:
            value = data[section]["series"][i].get(key)
            row.append("" if value is None else value)  # blank = not recorded, never 0
        writer.writerow(row)
    return buf.getvalue()


@router.get("/analytics", summary="Platform analytics (aggregates)")
def analytics(
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    granularity: Literal["day", "hour"] = Query(default="day"),
    format: Literal["json", "csv"] = Query(default="json"),
    admin: AdminPrincipal = Depends(require_admin),
):
    rng = _range(from_, to, granularity)
    start, end = _window(rng)
    data = analytics_service.get_analytics(
        rng, total_users=admin_health_service.total_users(), api_traffic=admin_health_service.api_traffic(start, end))
    if format == "csv":
        audit_service.record(admin.ctx, "export", _resource(rng), "success")
        filename = f"sankatai-analytics-{rng['days'][0]}-{rng['days'][-1]}.csv"
        return Response(_csv(data), media_type="text/csv",
                        headers={**NO_STORE, "Content-Disposition": f'attachment; filename="{filename}"'})
    audit_service.record(admin.ctx, "analytics_view", _resource(rng), "success")
    return Response(content=_json(data), media_type="application/json", headers=NO_STORE)


@router.get("/users", summary="User aggregates (no per-user records)")
def users(
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    granularity: Literal["day", "hour"] = Query(default="day"),
    admin: AdminPrincipal = Depends(require_admin),
):
    rng = _range(from_, to, granularity)
    data = analytics_service.get_analytics(rng, ("users",), total_users=admin_health_service.total_users())
    audit_service.record(admin.ctx, "dashboard_view", f"users {_resource(rng)}", "success")
    return Response(content=_json(data), media_type="application/json", headers=NO_STORE)


@router.get("/feedback", summary="Feedback aggregates")
def feedback(
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    granularity: Literal["day", "hour"] = Query(default="day"),
    admin: AdminPrincipal = Depends(require_admin),
):
    rng = _range(from_, to, granularity)
    data = analytics_service.get_analytics(rng, ("feedback",))
    audit_service.record(admin.ctx, "dashboard_view", f"feedback {_resource(rng)}", "success")
    return Response(content=_json(data), media_type="application/json", headers=NO_STORE)


@router.get("/system-health", summary="Dependency health (cached 60 s)")
def system_health(admin: AdminPrincipal = Depends(require_admin)):
    data = admin_health_service.system_health()
    audit_service.record(admin.ctx, "health_view", "system-health", "success")
    return Response(content=_json(data), media_type="application/json", headers=NO_STORE)


@router.get("/admins", summary="List admins")
def list_admins(admin: AdminPrincipal = Depends(require_admin)):
    audit_service.record(admin.ctx, "dashboard_view", "admins", "success")
    return admin_access_service.list_admins(admin.sub)


@router.delete("/admins/{sub}", summary="Remove an admin")
def remove_admin(
    sub: str,
    confirm_self: bool = Query(default=False),
    admin: AdminPrincipal = Depends(require_admin),
):
    if not (0 < len(sub) <= 64):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found.")
    return admin_access_service.remove_admin(admin.ctx, sub, confirm_self)


@router.get("/invitations", summary="List invitations")
def list_invitations(admin: AdminPrincipal = Depends(require_admin)):
    audit_service.record(admin.ctx, "dashboard_view", "invitations", "success")
    return {"invitations": admin_access_service.list_invitations()}


@router.post("/invitations", status_code=status.HTTP_201_CREATED, summary="Invite a Gmail address")
def create_invitation(body: CreateInvitationRequest, admin: AdminPrincipal = Depends(require_admin)):
    return admin_access_service.create_invitation(admin.ctx, body.email)


@router.delete("/invitations/{invitation_id}", summary="Revoke a pending invitation")
def revoke_invitation(invitation_id: str, admin: AdminPrincipal = Depends(require_admin)):
    return admin_access_service.revoke_invitation(admin.ctx, invitation_id)


@router.post("/invitations/accept", summary="Accept an invitation (signed-in invitee)")
def accept_invitation(body: AcceptInvitationRequest, caller: VerifiedCaller = Depends(verified_caller)):
    return admin_access_service.accept_invitation(caller.ctx, caller.sub, caller.username, body.token, body.idToken)


@router.get("/audit-logs", summary="Audit log (newest first, paginated)")
def audit_logs(
    cursor: Optional[str] = Query(default=None, max_length=1024),
    limit: int = Query(default=50, ge=1, le=100),
    admin: AdminPrincipal = Depends(require_admin),
):
    try:
        page = audit_service.list_entries(cursor, limit, datetime.now(timezone.utc).strftime("%Y-%m"))
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor.") from error
    if not cursor:
        audit_service.record(admin.ctx, "audit_view", "audit-logs", "success")
    return Response(content=_json(page), media_type="application/json", headers=NO_STORE)
