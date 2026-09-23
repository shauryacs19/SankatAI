#!/usr/bin/env bash
# Runs ON the backend EC2 instance, delivered by SSM Run Command.
# Not executed on the CI runner. deploy-backend.sh exports the env below and
# sends this file's contents as the command body.
#
# Required env (exported by the SSM preamble):
#   REGION CORS_ORIGINS IMAGE SECRET_ID APP_PORT CONTAINER_PORT
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

docker rm -f sankatai-backend 2>/dev/null || true

# Port mapping reconciles a real mismatch: the container listens on
# CONTAINER_PORT (5174, backend/Dockerfile) while the ALB target group and the
# instance security group use APP_PORT (8000, var.backend_origin_port).
#
# Table and bucket names are passed explicitly - USERS_TABLE in particular
# CANNOT be defaulted, because config.py derives "<project>-users" while the
# real table is sankatai-user-profile-table.
docker run -d \
  --name sankatai-backend \
  --restart unless-stopped \
  -p "${APP_PORT}:${CONTAINER_PORT}" \
  -v /opt/sankatai/secrets/openai_api_key:/run/secrets/openai_api_key:ro \
  -e OPENAI_API_KEY_FILE=/run/secrets/openai_api_key \
  -e AWS_REGION="$REGION" \
  -e PROJECT_NAME=sankatai \
  -e USERS_TABLE=sankatai-user-profile-table \
  -e CHAT_HISTORY_TABLE=sankatai-chat-history \
  -e ATTACHMENTS_TABLE=sankatai-attachments \
  -e CHAT_BUCKET=sankatai-chat-uploads \
  -e DOCUMENTS_BUCKET=sankatai-file-storage \
  -e CORS_ALLOWED_ORIGINS="$CORS_ORIGINS" \
  -e AUTH_ENABLED=true \
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
