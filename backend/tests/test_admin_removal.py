"""Admin removal: Cognito cleanup, last-admin guard, self-removal rules."""

from __future__ import annotations

from app.repositories import admin_repository

from conftest import groups_of, make_admin


def remove(client, actor, target_sub, confirm_self=False):
    suffix = "?confirm_self=true" if confirm_self else ""
    return client.delete(f"/api/admin/admins/{target_sub}{suffix}", headers=actor["headers"])


def test_remove_other_admin(client, aws):
    boss = make_admin(aws, "boss@gmail.com")
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
    # Two admins removing each other: the second removal must fail.
    a = make_admin(aws, "a@gmail.com")
    b = make_admin(aws, "b@gmail.com")
    assert remove(client, a, b["sub"]).status_code == 200
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
    boss = make_admin(aws, "boss@gmail.com")
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
