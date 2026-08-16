#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SankatAI backend — EC2 setup (Amazon Linux 2023), NO ECR required.
# Builds the Docker image on the instance from the backend source and runs it
# on port 8000. Real AWS DynamoDB + Cognito.
#
# The backend source must be on the box. Two ways:
#   A) set REPO_URL below to your GitHub repo (script git-clones it), OR
#   B) leave REPO_URL empty and `scp` your ./backend folder to /opt/sankatai/backend
#      before running.
#
# Attach an IAM ROLE to the instance with DynamoDB read/write on your tables
# (then no AWS keys are needed). Set OPENAI_API_KEY below.
# ─────────────────────────────────────────────────────────────────────────────
set -euxo pipefail

# ── config ──
REGION="ap-south-1"
PROJECT_NAME="SankatAI"                        # -> tables SankatAI-users, SankatAI-chat-history
# No Cognito config here: the backend no longer validates JWTs. API Gateway's
# Cognito authorizer does, then injects x-user-id / x-user-email.
OPENAI_API_KEY="REPLACE_ME"                    # blank -> offline keyword fallback
CORS_ORIGINS="https://d3nweisrmywmv4.cloudfront.net"

APP_DIR="/opt/sankatai"
REPO_URL=""                                    # e.g. https://github.com/<you>/SankatAI.git

# 1. Install Docker + git
dnf update -y
dnf install -y docker git
systemctl enable --now docker

# 2. Get the backend source onto the box
mkdir -p "$APP_DIR"
if [ -n "$REPO_URL" ]; then
  rm -rf "$APP_DIR/repo"
  git clone "$REPO_URL" "$APP_DIR/repo"
  BACKEND_DIR="$APP_DIR/repo/backend"          # adjust if your backend path differs
else
  BACKEND_DIR="$APP_DIR/backend"               # you scp'd the code here
fi

# 3. Build the image locally (no ECR) and run it
docker build -t sankatai-backend "$BACKEND_DIR"
docker rm -f sankatai-backend 2>/dev/null || true
docker run -d --name sankatai-backend --restart always \
  -p 8000:5174 \
  -e AWS_REGION="$REGION" \
  -e PROJECT_NAME="$PROJECT_NAME" \
  -e AUTH_ENABLED="true" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e CORS_ORIGINS="$CORS_ORIGINS" \
  sankatai-backend

# 4. Smoke test
sleep 5
curl -fsS http://localhost:8000/api/health && echo "  <- backend is up"
