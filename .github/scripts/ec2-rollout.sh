#!/usr/bin/env bash
# Runs ON the backend EC2 instance, delivered by SSM Run Command.
# Not executed on the CI runner. deploy-backend.sh exports the env below and
# sends this file's contents as the command body.
#
# Required env (exported by the SSM preamble, all sourced from terraform output):
#   REGION CORS_ORIGINS IMAGE SECRET_ID APP_PORT CONTAINER_PORT
#   USERS_TABLE CHAT_HISTORY_TABLE ATTACHMENTS_TABLE CHAT_BUCKET DOCUMENTS_BUCKET
#   COGNITO_USER_POOL_ID COGNITO_APP_CLIENT_ID ADMINS_TABLE ADMIN_INVITATIONS_TABLE
#   ADMIN_AUDIT_TABLE ANALYTICS_EVENTS_TABLE ANALYTICS_AGG_TABLE
#   ANALYTICS_SALT_SECRET_ID API_GATEWAY_ID APP_URL SES_SENDER_EMAIL (may be empty)
set -euxo pipefail

# Ubuntu 24.04 does not ship the AWS CLI and user_data installs only
# docker/git/unzip. Installed here, idempotently: editing user_data would force
# an instance replacement.
if ! command -v aws >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y unzip curl
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscli.zip
  unzip -q -o /tmp/awscli.zip -d /tmp
  /tmp/aws/install --update
  rm -rf /tmp/awscli.zip /tmp/aws
fi

REGISTRY="${IMAGE%%/*}"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
docker pull "$IMAGE"

# The AI key goes to a root-only file mounted read-only, so it never lands in
# the container environment or in `docker inspect`. config.py::_secret() reads
# OPENAI_API_KEY_FILE ahead of OPENAI_API_KEY (see context.md 9a).
install -d -m 700 /opt/sankatai/secrets
aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" --region "$REGION" \
  --query SecretString --output text > /opt/sankatai/secrets/openai_api_key
chmod 600 /opt/sankatai/secrets/openai_api_key
# Analytics pseudonymisation salt, same handling. PLACEHOLDER until set out of
# band; the backend then records no per-user metrics (it never crashes).
aws secretsmanager get-secret-value \
  --secret-id "$ANALYTICS_SALT_SECRET_ID" --region "$REGION" \
  --query SecretString --output text > /opt/sankatai/secrets/analytics_salt
chmod 600 /opt/sankatai/secrets/analytics_salt

docker rm -f sankatai-backend 2>/dev/null || true

# Port mapping reconciles a real mismatch: the container listens on
# CONTAINER_PORT (5174, backend/Dockerfile) while the ALB target group and the
# instance security group use APP_PORT (8000, var.backend_origin_port).
#
# Table and bucket names arrive from `terraform output` - they are NOT defaulted
# here. USERS_TABLE in particular cannot be defaulted at all, because config.py
# derives "<project>-users" while the real table is sankatai-user-profile-table.
docker run -d \
  --name sankatai-backend \
  --restart unless-stopped \
  -p "${APP_PORT}:${CONTAINER_PORT}" \
  -v /opt/sankatai/secrets/openai_api_key:/run/secrets/openai_api_key:ro \
  -v /opt/sankatai/secrets/analytics_salt:/run/secrets/analytics_salt:ro \
  -e OPENAI_API_KEY_FILE=/run/secrets/openai_api_key \
  -e ANALYTICS_SALT_FILE=/run/secrets/analytics_salt \
  -e AWS_REGION="$REGION" \
  -e PROJECT_NAME=sankatai \
  -e USERS_TABLE="$USERS_TABLE" \
  -e CHAT_HISTORY_TABLE="$CHAT_HISTORY_TABLE" \
  -e ATTACHMENTS_TABLE="$ATTACHMENTS_TABLE" \
  -e CHAT_BUCKET="$CHAT_BUCKET" \
  -e DOCUMENTS_BUCKET="$DOCUMENTS_BUCKET" \
  -e CORS_ALLOWED_ORIGINS="$CORS_ORIGINS" \
  -e AUTH_ENABLED=true \
  -e COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
  -e COGNITO_APP_CLIENT_ID="$COGNITO_APP_CLIENT_ID" \
  -e ADMINS_TABLE="$ADMINS_TABLE" \
  -e ADMIN_INVITATIONS_TABLE="$ADMIN_INVITATIONS_TABLE" \
  -e ADMIN_AUDIT_TABLE="$ADMIN_AUDIT_TABLE" \
  -e ANALYTICS_EVENTS_TABLE="$ANALYTICS_EVENTS_TABLE" \
  -e ANALYTICS_AGG_TABLE="$ANALYTICS_AGG_TABLE" \
  -e API_GATEWAY_ID="$API_GATEWAY_ID" \
  -e APP_URL="$APP_URL" \
  -e SES_SENDER_EMAIL="$SES_SENDER_EMAIL" \
  "$IMAGE"

# Smoke test from inside the box. The instance is private with no public IP, so
# this is the only place the new container can actually be reached.
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:${APP_PORT}/api/health" >/dev/null; then
    echo "health OK after ${i}s"
    docker image prune -af --filter "until=168h" || true
    exit 0
  fi
  sleep 1
done

echo "health check FAILED - last 50 log lines:"
docker logs --tail 50 sankatai-backend || true
exit 1
