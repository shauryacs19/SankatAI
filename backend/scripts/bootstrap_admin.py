"""Grant the first (or a recovery) admin. Idempotent. Operator-run only.

Adds the Cognito user with email BOOTSTRAP_ADMIN_EMAIL to the ADMIN group and
activates their row in the admins table (with the active-admin counter), then
writes an audit record. Re-running for an existing active admin is a no-op.

This is the ONLY way to create an admin without an invitation, and it needs
AWS credentials that can call cognito-idp:ListUsers/AdminAddUserToGroup and
write the admin tables — i.e. an operator, never the app. There is no
email-based check anywhere in the request path.

Usage (from backend/, values from `terraform output`):
    BOOTSTRAP_ADMIN_EMAIL=you@gmail.com \\
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

    created = admin_access_service.bootstrap(email, attrs["sub"], user["Username"])
    print("Admin granted." if created else "Already an active admin; nothing changed (group membership re-applied).")
    print("The user must sign out and in again (or wait for a token refresh) to get the ADMIN group claim.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
