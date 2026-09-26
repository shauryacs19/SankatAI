"""Admin removal: Cognito cleanup, last-admin guard, self-removal and root-admin rules."""

from __future__ import annotations

from app.repositories import admin_repository

from conftest import groups_of, make_admin


def remove(client, actor, target_sub, confirm_self=False):
    suffix = "?confirm_self=true" if confirm_self else ""
    return client.delete(f"/api/admin/admins/{target_sub}{suffix}", headers=actor["headers"])


def test_remove_other_admin(client, aws):
    boss = make_admin(aws, "boss@gmail.com", root=True)
    other = make_admin(aws, "other@gmail.com")
    res = remove(client, boss, other["sub"])
    assert res.status_code == 200 and res.json()["cognitoCleanup"] == "done"
    assert "ADMIN" not in groups_of(aws, other["username"])
    assert admin_repository.get_admin(other["sub"])["status"] == "revoked"
    assert admin_repository.active_count() == 1


def test_last_admin_cannot_be_removed(client, aws):
    boss = make_admin(aws, "boss@gmail.com")
    res = remove(client, boss, boss["sub"], confirm_self=True)
    assert res.status_code == 409 and res.json()["code"] == "last_admin"
    assert admin_repository.get_admin(boss["sub"])["status"] == "active"
    assert "ADMIN" in groups_of(aws, boss["username"])


def test_last_admin_guard_is_the_counter_not_a_read(client, aws):
    # No root yet (pre-root deployments): two admins leaving; the second must fail.
    a = make_admin(aws, "a@gmail.com")
    b = make_admin(aws, "b@gmail.com")
    assert remove(client, b, b["sub"], confirm_self=True).status_code == 200
    assert remove(client, a, a["sub"], confirm_self=True).status_code == 409
    assert admin_repository.active_count() == 1


def test_self_removal_needs_confirmation(client, aws):
    boss = make_admin(aws, "boss@gmail.com")
    make_admin(aws, "other@gmail.com")
    res = remove(client, boss, boss["sub"])
    assert res.status_code == 400 and res.json()["code"] == "confirm_required"
    res = remove(client, boss, boss["sub"], confirm_self=True)
    assert res.status_code == 200 and res.json()["self"] is True
    # Access is gone immediately for the same token.
    assert client.get("/api/admin/admins", headers=boss["headers"]).status_code == 403


def test_remove_unknown_and_already_revoked(client, aws):
    boss = make_admin(aws, "boss@gmail.com", root=True)
    other = make_admin(aws, "other@gmail.com")
    assert remove(client, boss, "no-such-sub").status_code == 404
    assert remove(client, boss, other["sub"]).status_code == 200
    # Retrying re-runs the Cognito cleanup only; the counter is untouched.
    again = remove(client, boss, other["sub"])
    assert again.status_code == 200 and admin_repository.active_count() == 1


def test_bootstrap_is_idempotent(aws):
    from app.services import admin_access_service

    admin = make_admin(aws, "boss@gmail.com")
    assert admin_access_service.bootstrap("boss@gmail.com", admin["sub"], admin["username"]) is False
    assert admin_repository.active_count() == 1


# --- root admin --------------------------------------------------------------

def test_root_cannot_be_removed_by_anyone(client, aws):
    root = make_admin(aws, "root@gmail.com", root=True)
    other = make_admin(aws, "other@gmail.com")
    res = remove(client, other, root["sub"])
    assert res.status_code == 403 and res.json()["code"] == "root_protected"
    res = remove(client, root, root["sub"], confirm_self=True)
    assert res.status_code == 403 and res.json()["code"] == "root_protected"
    assert admin_repository.get_admin(root["sub"])["status"] == "active"
    assert "ADMIN" in groups_of(aws, root["username"])
    assert admin_repository.active_count() == 2


def test_root_row_is_protected_in_the_transaction(aws):
    # Defence in depth: even a direct repository call cannot revoke the root row.
    import pytest
    from app.repositories.admin_repository import TransactionFailed

    root = make_admin(aws, "root@gmail.com", root=True)
    make_admin(aws, "other@gmail.com")
    with pytest.raises(TransactionFailed):
        admin_repository.revoke_admin(root["sub"], "someone", "2026-01-01T00:00:00+00:00")
    assert admin_repository.get_admin(root["sub"])["status"] == "active"


def test_only_root_removes_other_admins(client, aws):
    make_admin(aws, "root@gmail.com", root=True)
    a = make_admin(aws, "a@gmail.com")
    b = make_admin(aws, "b@gmail.com")
    res = remove(client, a, b["sub"])
    assert res.status_code == 403 and res.json()["code"] == "root_only"
    assert admin_repository.get_admin(b["sub"])["status"] == "active"
    # A regular admin may still leave.
    assert remove(client, a, a["sub"], confirm_self=True).status_code == 200


def test_list_admins_flags_root(client, aws):
    root = make_admin(aws, "root@gmail.com", root=True)
    other = make_admin(aws, "other@gmail.com")
    body = client.get("/api/admin/admins", headers=root["headers"]).json()
    assert body["canRemoveOthers"] is True
    assert body["admins"][0]["sub"] == root["sub"] and body["admins"][0]["isRoot"] is True
    body = client.get("/api/admin/admins", headers=other["headers"]).json()
    assert body["canRemoveOthers"] is False


def test_bootstrap_allows_a_single_root(aws):
    import pytest
    from app.services import admin_access_service

    root = make_admin(aws, "root@gmail.com", root=True)
    other = make_admin(aws, "other@gmail.com")
    # Re-running for the same root is a no-op.
    assert admin_access_service.bootstrap(root["email"], root["sub"], root["username"], root=True) is False
    with pytest.raises(admin_access_service.AdminError) as err:
        admin_access_service.bootstrap(other["email"], other["sub"], other["username"], root=True)
    assert err.value.code == "root_exists"
    assert admin_repository.get_admin(other["sub"]).get("role") is None


def test_existing_admin_can_be_promoted_to_root(aws):
    from app.services import admin_access_service

    admin = make_admin(aws, "boss@gmail.com")
    assert admin_access_service.bootstrap(admin["email"], admin["sub"], admin["username"], root=True) is False
    assert admin_repository.get_admin(admin["sub"])["role"] == "root"
    assert admin_repository.active_count() == 1
