"""Grant the first (or a recovery) admin. Idempotent. Operator-run only.

Adds the Cognito user with email BOOTSTRAP_ADMIN_EMAIL to the ADMIN group and
activates their row in the admins table (with the active-admin counter), then
writes an audit record. Re-running for an existing active admin is a no-op.

This is the ONLY way to create an admin without an invitation, and it needs
AWS credentials that can call cognito-idp:ListUsers/AdminAddUserToGroup and
write the admin tables — i.e. an operator, never the app. There is no
email-based check anywhere in the request path.

BOOTSTRAP_ROOT=true also makes this admin the ROOT admin: permanent (no one can
remove them through the app) and the only admin who can remove other admins.
There is exactly one root; the script refuses if another account already is.
Admin rows whose Cognito user no longer exists in the pool (for example after
moving to a new user pool) are retired first, so they can't block this.

Usage (from backend/, values from `terraform output`):
    BOOTSTRAP_ADMIN_EMAIL=you@gmail.com BOOTSTRAP_ROOT=true \\
    COGNITO_USER_POOL_ID=$(terraform -chdir=../infrastructure/terraform output -raw cognito_user_pool_id) \\
    ADMINS_TABLE=$(terraform -chdir=../infrastructure/terraform output -raw admins_table_name) \\
    ADMIN_AUDIT_TABLE=$(terraform -chdir=../infrastructure/terraform output -raw admin_audit_table_name) \\
    AWS_REGION=ap-south-1 python -m scripts.bootstrap_admin
"""

from __future__ import annotations

import os
import sys

REQUIRED = ("BOOTSTRAP_ADMIN_EMAIL", "COGNITO_USER_POOL_ID", "ADMINS_TABLE", "ADMIN_AUDIT_TABLE")


def main() -> int:
    missing = [name for name in REQUIRED if not os.getenv(name)]
    if missing:
        print(f"Missing env: {', '.join(missing)} (see the module docstring).", file=sys.stderr)
        return 2

    # Imported after the env check: config reads the environment at import.
    from app.integrations.aws import cognito_admin
    from app.services import admin_access_service

    email = os.environ["BOOTSTRAP_ADMIN_EMAIL"].strip().lower()
    if "@" not in email or any(c in email for c in '"\\ '):
        print("BOOTSTRAP_ADMIN_EMAIL is not a valid email address.", file=sys.stderr)
        return 2
    resp = cognito_admin.client().list_users(
        UserPoolId=os.environ["COGNITO_USER_POOL_ID"], Filter=f'email = "{email}"', Limit=2)
    users = resp.get("Users", [])
    if len(users) != 1:
        print(f"Expected exactly one Cognito user with that email, found {len(users)}. "
              "Sign up in the app first.", file=sys.stderr)
        return 1
    user = users[0]
    attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
    if attrs.get("email_verified") != "true":
        print("That user's email is not verified. Verify it first.", file=sys.stderr)
        return 1

    root = os.getenv("BOOTSTRAP_ROOT", "").strip().lower() in {"1", "true", "yes"}
    # Rows left behind by users who no longer exist in this pool (e.g. after the
    # move to a new user pool) would otherwise keep a stale root in place.
    retired = admin_access_service.retire_orphaned_admins()
    if retired:
        print(f"Retired {retired} admin row(s) whose Cognito user no longer exists in this pool.")
    try:
        created = admin_access_service.bootstrap(email, attrs["sub"], user["Username"], root=root)
    except admin_access_service.AdminError as error:
        print(error.message, file=sys.stderr)
        return 1
    print("Admin granted." if created else "Already an active admin; nothing changed (group membership re-applied).")
    if root:
        print("Root admin: permanent, and the only admin who can remove other admins.")
    print("The user must sign out and in again (or wait for a token refresh) to get the ADMIN group claim.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
