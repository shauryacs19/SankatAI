"""Invitation lifecycle: create, rotate, accept once, and every refusal."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest

from app.integrations.aws import ses_mail
from app.repositories import admin_repository

from conftest import create_user, groups_of, headers_for, make_admin, make_token

INVITES = "/api/admin/invitations"
ACCEPT = "/api/admin/invitations/accept"


@pytest.fixture
def outbox(monkeypatch):
    """Capture invitation emails (the real SES path is tested separately)."""
    sent = []
    monkeypatch.setattr(ses_mail, "send", lambda to, subject, text, html: sent.append({"to": to, "text": text}))
    return sent


def token_from(mail: dict) -> str:
    return re.search(r"token=([0-9a-f]{32}\.[A-Za-z0-9_-]+)", mail["text"]).group(1)


def invite(client, admin, email, outbox) -> str:
    res = client.post(INVITES, json={"email": email}, headers=admin["headers"])
    assert res.status_code == 201, res.text
    return token_from(outbox[-1])


def accept(client, sub, username, token, *, email, verified=True, id_sub=None):
    id_token = make_token(id_sub or sub, token_use="id", email=email, email_verified=verified)
    return client.post(ACCEPT, json={"token": token, "idToken": id_token}, headers=headers_for(sub, username=username))


def test_create_stores_only_a_hash_and_never_returns_the_token(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.post(INVITES, json={"email": "  New.Admin@Gmail.com "}, headers=admin["headers"])
    assert res.status_code == 201
    body = res.json()
    token = token_from(outbox[0])
    secret = token.split(".")[1]
    assert outbox[0]["to"] == "new.admin@gmail.com"
    assert "https://app.example.com/admin/invite/accept?token=" in outbox[0]["text"]
    assert secret not in res.text and "token" not in body
    item = admin_repository.get_invitation(body["id"])
    assert item["status"] == "pending" and item["email_status"] == "sent"
    assert secret not in str(item) and len(item["token_hash"]) == 64
    listed = client.get(INVITES, headers=admin["headers"]).json()["invitations"]
    assert [i["id"] for i in listed] == [body["id"]] and secret not in str(listed)


def test_real_ses_path_sends(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.post(INVITES, json={"email": "new@gmail.com"}, headers=admin["headers"])
    assert res.status_code == 201 and res.json()["emailStatus"] == "sent"


@pytest.mark.parametrize("email", ["x@yahoo.com", "x@gmail.co", "x@gmail.com.evil.io", "not-an-email"])
def test_only_gmail_addresses(client, aws, outbox, email):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.post(INVITES, json={"email": email}, headers=admin["headers"])
    assert res.status_code == 422 and not outbox


def test_duplicate_pending_invite_rotates_token(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    first = invite(client, admin, "new@gmail.com", outbox)
    second = invite(client, admin, "new@gmail.com", outbox)
    assert first.split(".")[0] == second.split(".")[0] and first != second
    assert len(client.get(INVITES, headers=admin["headers"]).json()["invitations"]) == 1
    sub, username = create_user(aws, "new@gmail.com")
    old = accept(client, sub, username, first, email="new@gmail.com")
    assert old.status_code == 400 and old.json()["code"] == "invalid"
    assert accept(client, sub, username, second, email="new@gmail.com").status_code == 200


def test_invite_existing_admin_is_409(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.post(INVITES, json={"email": "boss@gmail.com"}, headers=admin["headers"])
    assert res.status_code == 409 and res.json()["code"] == "already_admin"


def test_rate_limit_ten_per_hour(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    for i in range(10):
        assert client.post(INVITES, json={"email": f"u{i}@gmail.com"}, headers=admin["headers"]).status_code == 201
    res = client.post(INVITES, json={"email": "u10@gmail.com"}, headers=admin["headers"])
    assert res.status_code == 429 and res.json()["code"] == "rate_limited"


def test_accept_grants_group_and_row_once(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    sub, username = create_user(aws, "new@gmail.com")
    res = accept(client, sub, username, token, email="new@gmail.com")
    assert res.status_code == 200 and res.json() == {"status": "accepted", "refreshRequired": True}
    assert "ADMIN" in groups_of(aws, username)
    assert admin_repository.get_admin(sub)["status"] == "active"
    assert admin_repository.active_count() == 2
    # New tokens (after refresh) carry the group and now pass require_admin.
    assert client.get("/api/admin/admins", headers=headers_for(sub, username=username, groups=["ADMIN"])).status_code == 200
    # Reuse is refused.
    again = accept(client, sub, username, token, email="new@gmail.com")
    assert again.status_code == 409 and again.json()["code"] == "accepted"


def test_accept_reused_by_someone_else(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    sub, username = create_user(aws, "new@gmail.com")
    assert accept(client, sub, username, token, email="new@gmail.com").status_code == 200
    other_sub, other_user = create_user(aws, "other@gmail.com")
    res = accept(client, other_sub, other_user, token, email="other@gmail.com")
    assert res.status_code == 409 and "ADMIN" not in groups_of(aws, other_user)


def test_expired(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    admin_repository.update_invitation(token.split(".")[0], {"expires_at": past})
    sub, username = create_user(aws, "new@gmail.com")
    res = accept(client, sub, username, token, email="new@gmail.com")
    assert res.status_code == 410 and res.json()["code"] == "expired"
    assert "ADMIN" not in groups_of(aws, username)


@pytest.mark.parametrize("mangle", [
    lambda t: t[:-1] + ("A" if t[-1] != "A" else "B"),  # wrong secret
    lambda t: "f" * 32 + "." + t.split(".")[1],  # unknown id
    lambda t: "garbage-token-that-is-long-enough-to-pass-length-checks",  # malformed
])
def test_invalid_token(client, aws, outbox, mangle):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    sub, username = create_user(aws, "new@gmail.com")
    res = accept(client, sub, username, mangle(token), email="new@gmail.com")
    assert res.status_code == 400 and res.json()["code"] == "invalid"


def test_wrong_email(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    sub, username = create_user(aws, "intruder@gmail.com")
    res = accept(client, sub, username, token, email="intruder@gmail.com")
    assert res.status_code == 403 and res.json()["code"] == "wrong_email"
    assert admin_repository.get_invitation(token.split(".")[0])["status"] == "pending"


def test_email_not_verified(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    sub, username = create_user(aws, "new@gmail.com")
    res = accept(client, sub, username, token, email="new@gmail.com", verified=False)
    assert res.status_code == 403 and res.json()["code"] == "email_unverified"


def test_id_token_of_another_user(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    invitee_sub, _ = create_user(aws, "new@gmail.com")
    sub, username = create_user(aws, "attacker@gmail.com")
    res = accept(client, sub, username, token, email="new@gmail.com", id_sub=invitee_sub)
    assert res.status_code == 401


def test_revoked(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "new@gmail.com", outbox)
    invitation_id = token.split(".")[0]
    assert client.delete(f"{INVITES}/{invitation_id}", headers=admin["headers"]).json()["status"] == "revoked"
    sub, username = create_user(aws, "new@gmail.com")
    res = accept(client, sub, username, token, email="new@gmail.com")
    assert res.status_code == 410 and res.json()["code"] == "revoked"
    # Revoking twice is refused.
    assert client.delete(f"{INVITES}/{invitation_id}", headers=admin["headers"]).status_code == 409


def test_already_admin_accepting(client, aws, outbox):
    admin = make_admin(aws, "boss@gmail.com")
    token = invite(client, admin, "second@gmail.com", outbox)
    second = make_admin(aws, "second@gmail.com")  # became admin another way meanwhile
    res = accept(client, second["sub"], second["username"], token, email="second@gmail.com")
    assert res.status_code == 409 and res.json()["code"] == "already_admin"
    assert "ADMIN" in groups_of(aws, second["username"])  # untouched


def test_non_admin_can_accept_but_not_invite(client, aws, outbox):
    sub, username = create_user(aws, "user@gmail.com")
    res = client.post(INVITES, json={"email": "x@gmail.com"}, headers=headers_for(sub, username=username))
    assert res.status_code == 403 and not outbox


def test_email_not_configured_is_503(client, aws, outbox, monkeypatch):
    from app.core import config
    admin = make_admin(aws, "boss@gmail.com")
    monkeypatch.setattr(config, "SES_SENDER_EMAIL", "")
    res = client.post(INVITES, json={"email": "new@gmail.com"}, headers=admin["headers"])
    assert res.status_code == 503 and res.json()["code"] == "email_not_configured"
