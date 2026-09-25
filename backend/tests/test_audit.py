"""Audit trail: every admin action is recorded; only admins can read it."""

from __future__ import annotations

import json

import pytest

from app.integrations.aws import ses_mail
from app.integrations.aws.dynamo_client import get_audit_table
from app.repositories import audit_repository
from app.services import admin_health_service

from conftest import create_user, headers_for, make_admin


def actions() -> list[tuple[str, str]]:
    return [(i["action"], i["result"]) for i in get_audit_table().scan()["Items"]]


@pytest.fixture(autouse=True)
def quiet_mail(monkeypatch):
    monkeypatch.setattr(ses_mail, "send", lambda *args: None)


def test_each_admin_action_writes_a_record(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    other = make_admin(aws, "other@gmail.com")
    h = admin["headers"]
    inv = client.post("/api/admin/invitations", json={"email": "new@gmail.com"}, headers=h).json()
    client.delete(f"/api/admin/invitations/{inv['id']}", headers=h)
    client.delete(f"/api/admin/admins/{other['sub']}", headers=h)
    client.get("/api/admin/analytics", headers=h)
    client.get("/api/admin/analytics?format=csv", headers=h)
    client.get("/api/admin/system-health", headers=h)
    client.get("/api/admin/users", headers=h)
    got = actions()
    for expected in [("admin_bootstrap", "success"), ("invite_create", "success"), ("invite_revoke", "success"),
                     ("admin_remove", "success"), ("permission_change", "success"), ("analytics_view", "success"),
                     ("export", "success"), ("health_view", "success"), ("dashboard_view", "success")]:
        assert expected in got, expected
    blob = json.dumps(get_audit_table().scan()["Items"], default=str)
    assert "new@gmail.com" not in blob  # invitee emails are masked


def test_records_carry_request_context(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    client.get("/api/admin/system-health", headers={**admin["headers"], "x-client-ip": "203.0.113.9",
                                                    "x-request-id": "req-1", "user-agent": "pytest"})
    item = next(i for i in get_audit_table().scan()["Items"] if i["action"] == "health_view")
    assert (item["admin_sub"], item["ip"], item["request_id"], item["user_agent"]) == (admin["sub"], "203.0.113.9", "req-1", "pytest")


def test_non_admin_cannot_read_and_is_recorded(client, aws):
    sub, username = create_user(aws, "user@gmail.com")
    res = client.get("/api/admin/audit-logs", headers=headers_for(sub, username=username))
    assert res.status_code == 403
    assert ("access_denied", "denied") in actions()


def test_pagination_newest_first(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    for _ in range(4):
        client.get("/api/admin/system-health", headers=admin["headers"])
    first = client.get("/api/admin/audit-logs?limit=3", headers=admin["headers"]).json()
    assert len(first["items"]) == 3 and first["nextCursor"]
    stamps = [i["ts"] for i in first["items"]]
    assert stamps == sorted(stamps, reverse=True)
    second = client.get(f"/api/admin/audit-logs?limit=3&cursor={first['nextCursor']}", headers=admin["headers"]).json()
    assert second["items"] and not set(i["ts"] for i in second["items"]) & set(stamps)
    assert client.get("/api/admin/audit-logs?cursor=not-base64!", headers=admin["headers"]).status_code == 400


def test_repository_is_append_only():
    public = {n for n in dir(audit_repository) if not n.startswith("_")}
    assert not {n for n in public if any(w in n for w in ("delete", "update", "remove"))}


def test_health_reports_real_status_and_unavailable(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    body = client.get("/api/admin/system-health", headers=admin["headers"]).json()
    status = {c["name"]: c["status"] for c in body["checks"]}
    assert status["dynamodb"] == "healthy" and status["cognito"] == "healthy"
    assert status["s3"] == "down"  # buckets were never created in this test
    assert status["api_gateway"] == "unavailable"  # API_GATEWAY_ID not configured: never "healthy"
    assert status["ai_provider"] in ("degraded", "down")
    assert any(f["name"] == "s3" for f in body["recentFailures"])
    assert "arn:" not in json.dumps(body)
    # Cached for 60 s.
    again = client.get("/api/admin/system-health", headers=admin["headers"]).json()
    assert again["generatedAt"] == body["generatedAt"]
    admin_health_service.clear_cache()
