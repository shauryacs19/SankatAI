# Sankat.AI

AI symptom triage for India. It has a web app (`apps/web`) and a mobile app (`apps/mobile`), which share one FastAPI backend (`backend/`) and one set of AWS resources (`infrastructure/terraform`). The detailed project context is in [`context.md`](context.md).

## Layout

| Path | What |
|---|---|
| `backend/` | FastAPI: routes → services → repositories → AWS |
| `apps/web/` | React + Vite web app, including the admin console (`/admin`) |
| `apps/mobile/` | Expo app |
| `packages/shared/` | Framework-neutral shared logic and tokens |
| `infrastructure/terraform/` | Cognito, DynamoDB, S3, API Gateway, ALB, EC2, IAM, SES |

## Tests

```bash
cd backend && python -m pip install -r requirements-dev.txt && python -m pytest -q
```

```bash
cd apps/web && npm test
```

## Deploying the admin console + analytics

The CD pipeline reads Terraform outputs, so apply first:

```bash
terraform -chdir=infrastructure/terraform apply -var="ses_sender_email=<verified sender>"
```

Set the analytics salt once. Never rotate it casually, because rotation splits every distinct-user count:

```bash
aws secretsmanager put-secret-value --secret-id sankatai/dev/analytics_salt --secret-string "$(openssl rand -hex 32)"
```

Next, click the SES verification email sent to the sender address. **SES starts in the sandbox**, so it only delivers to verified addresses. Until production access is granted (SES console → Account dashboard → Request production access), verify each test Gmail with `aws ses verify-email-identity --email-address <gmail>`.

Then push, or run the CD workflow manually, to deploy the backend and web.

Grant the first admin. This is idempotent, and it is also the recovery path if every admin is lost:

```bash
cd backend && BOOTSTRAP_ADMIN_EMAIL=you@gmail.com COGNITO_USER_POOL_ID=$(terraform -chdir=../infrastructure/terraform output -raw cognito_user_pool_id) ADMINS_TABLE=sankatai-admins ADMIN_AUDIT_TABLE=sankatai-admin-audit-log AWS_REGION=ap-south-1 python -m scripts.bootstrap_admin
```

Backfill historical aggregates. This runs once, and only after the salt is set:

```bash
cd backend && ANALYTICS_SALT_SECRET_ID=sankatai/dev/analytics_salt COGNITO_USER_POOL_ID=$(terraform -chdir=../infrastructure/terraform output -raw cognito_user_pool_id) CHAT_HISTORY_TABLE=sankatai-chat-history ATTACHMENTS_TABLE=sankatai-attachments ANALYTICS_AGG_TABLE=sankatai-analytics-daily-agg AWS_REGION=ap-south-1 python -m scripts.backfill_analytics
```

## Security model (short)

- **Authentication:** Cognito is the IdP. The web app signs in with SRP through its own forms (no Hosted UI redirect). The API Gateway JWT authorizer guards every `/api` route.
- **Admin:** `/api/admin/*` re-verifies the JWT in the backend (JWKS, `iss`, `client_id`, `token_use`, `exp`). It then requires the `ADMIN` group and an active row in the `admins` table, so revoking an admin takes effect immediately.
- **Invitations:** Gmail only, one use, 48 hours. Only a SHA-256 hash of the token is stored. The accepting account's verified email must match the invited address.
- **Last admin:** removing the last admin is blocked by a DynamoDB transaction.
- **Audit log:** append-only (IAM allows `PutItem` and `Query` only).
- **Analytics:** aggregates only. Users appear only as salted hashes, and there is no medical content in events. Anything the platform doesn't record is shown as "Unavailable", never as a made-up number.
