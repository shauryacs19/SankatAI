"""require_admin: JWT re-verification, ADMIN group, and the admins table."""

from __future__ import annotations

from app.core import config
from app.repositories import admin_repository

from conftest import _OTHER_KEY, create_user, headers_for, make_admin, make_token

URL = "/api/admin/admins"


def test_admin_gets_200(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.get(URL, headers=admin["headers"])
    assert res.status_code == 200
    assert res.json()["activeCount"] == 1


def test_normal_user_gets_403(client, aws):
    sub, username = create_user(aws, "user@gmail.com")
    res = client.get(URL, headers=headers_for(sub, username=username))
    assert res.status_code == 403


def test_group_claim_without_admin_record_gets_403(client, aws):
    # A forged-looking but validly signed claim is not enough: the row decides.
    sub, username = create_user(aws, "claims@gmail.com")
    res = client.get(URL, headers=headers_for(sub, username=username, groups=["ADMIN"]))
    assert res.status_code == 403


def test_invalid_signature_rejected(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    token = make_token(admin["sub"], groups=["ADMIN"], key=_OTHER_KEY)
    res = client.get(URL, headers={"x-user-id": admin["sub"], "authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_unknown_kid_rejected(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    token = make_token(admin["sub"], groups=["ADMIN"], kid="attacker-kid")
    res = client.get(URL, headers={"x-user-id": admin["sub"], "authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_expired_token_rejected(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.get(URL, headers=headers_for(admin["sub"], groups=["ADMIN"], exp_in=-120))
    assert res.status_code == 401


def test_wrong_audience_rejected(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.get(URL, headers=headers_for(admin["sub"], groups=["ADMIN"], client_id="some-other-client"))
    assert res.status_code == 401


def test_wrong_issuer_rejected(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    res = client.get(URL, headers=headers_for(
        admin["sub"], groups=["ADMIN"], issuer="https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_other"))
    assert res.status_code == 401


def test_id_token_is_not_an_access_token(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    token = make_token(admin["sub"], token_use="id", email="boss@gmail.com")
    res = client.get(URL, headers={"x-user-id": admin["sub"], "authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_token_subject_must_match_gateway_identity(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    headers = headers_for(admin["sub"], groups=["ADMIN"])
    headers["x-user-id"] = "someone-else"
    assert client.get(URL, headers=headers).status_code == 401


def test_missing_gateway_identity_or_token(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    assert client.get(URL, headers={"authorization": admin["headers"]["authorization"]}).status_code == 401
    assert client.get(URL, headers={"x-user-id": admin["sub"]}).status_code == 401


def test_revoked_admin_with_valid_token_gets_403(client, aws):
    admin = make_admin(aws, "boss@gmail.com", root=True)
    other = make_admin(aws, "second@gmail.com")
    assert client.get(URL, headers=other["headers"]).status_code == 200
    res = client.delete(f"/api/admin/admins/{other['sub']}", headers=admin["headers"])
    assert res.status_code == 200
    # Same token, still carrying the ADMIN group claim, still unexpired.
    assert client.get(URL, headers=other["headers"]).status_code == 403
    assert admin_repository.get_admin(other["sub"])["status"] == "revoked"


def test_verifier_not_configured_fails_closed(client, aws, monkeypatch):
    admin = make_admin(aws, "boss@gmail.com")
    headers = admin["headers"]
    monkeypatch.setattr(config, "COGNITO_APP_CLIENT_ID", "")
    from app.integrations.aws import cognito_jwt
    monkeypatch.setattr(cognito_jwt, "_jwks_client", None)
    assert client.get(URL, headers=headers).status_code == 503


def test_every_admin_route_is_gated(client, aws):
    sub, username = create_user(aws, "user@gmail.com")
    headers = headers_for(sub, username=username)
    for method, path in [
        ("get", "/api/admin/analytics"), ("get", "/api/admin/users"), ("get", "/api/admin/feedback"),
        ("get", "/api/admin/system-health"), ("get", "/api/admin/admins"), ("delete", "/api/admin/admins/x"),
        ("get", "/api/admin/invitations"), ("delete", f"/api/admin/invitations/{'a' * 32}"),
        ("get", "/api/admin/audit-logs"),
    ]:
        assert getattr(client, method)(path, headers=headers).status_code == 403, path
    assert client.post("/api/admin/invitations", json={"email": "x@gmail.com"}, headers=headers).status_code == 403
