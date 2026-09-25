#!/usr/bin/env bash
# Ship ec2-rollout.sh to the private backend instance via SSM Run Command,
# wait for it, surface the instance-side output, and fail on anything but
# Success.
#
# The target instance is RESOLVED BY TAG, not pinned. Terraform replaces the
# backend instance on several changes (subnet, user_data), after which a pinned
# id refers to a terminated instance and SSM answers
# "InvalidInstanceId: Instances not in a valid state for account".
#
# Required env:
#   IMAGE        - full ECR image ref    (set by push-backend-image.sh)
#   AWS_REGION   - deploy region
#   TAG          - image tag, for the command comment
# Optional env:
#   INSTANCE_NAME_TAG - Name tag to resolve (default: sankatai-backend)
#   INSTANCE_ID       - pin a specific instance, skipping tag discovery
# Optional env:
#   CORS_ORIGINS    - browser origins the API accepts (default: empty)
#   SECRET_ID       - Secrets Manager id for the AI key
#   APP_PORT        - host port the ALB targets        (default 8000)
#   CONTAINER_PORT  - port inside the container        (default 5174)
set -euo pipefail

: "${IMAGE:?missing image ref - did push-backend-image.sh run?}"
: "${AWS_REGION:?missing region}"

INSTANCE_NAME_TAG="${INSTANCE_NAME_TAG:-sankatai-backend}"

# Resource names come from `terraform output` (see terraform-outputs.sh). They
# are deliberately NOT defaulted: a silent wrong default points the backend at
# a table that does not exist, which fails at request time, not deploy time.
: "${USERS_TABLE:?missing - expected from terraform output users_table_name}"
: "${CHAT_HISTORY_TABLE:?missing - expected from terraform output chat_history_table_name}"
: "${ATTACHMENTS_TABLE:?missing - expected from terraform output attachments_table_name}"
: "${CHAT_BUCKET:?missing - expected from terraform output chat_bucket_name}"
: "${DOCUMENTS_BUCKET:?missing - expected from terraform output documents_bucket_name}"
: "${SECRET_ID:?missing - expected from terraform output ai_api_key_secret_name}"
# Admin console + analytics.
: "${COGNITO_USER_POOL_ID:?missing - expected from terraform output cognito_user_pool_id}"
: "${COGNITO_APP_CLIENT_ID:?missing - expected from terraform output cognito_user_pool_client_id}"
: "${ADMINS_TABLE:?missing - expected from terraform output admins_table_name}"
: "${ADMIN_INVITATIONS_TABLE:?missing - expected from terraform output admin_invitations_table_name}"
: "${ADMIN_AUDIT_TABLE:?missing - expected from terraform output admin_audit_table_name}"
: "${ANALYTICS_EVENTS_TABLE:?missing - expected from terraform output analytics_events_table_name}"
: "${ANALYTICS_AGG_TABLE:?missing - expected from terraform output analytics_agg_table_name}"
: "${ANALYTICS_SALT_SECRET_ID:?missing - expected from terraform output analytics_salt_secret_name}"
: "${API_GATEWAY_ID:?missing - expected from terraform output api_gateway_id}"
: "${APP_URL:?missing - expected from terraform output app_url}"
SES_SENDER_EMAIL="${SES_SENDER_EMAIL:-}"

# ── Resolve the target instance ─────────────────────────────────────────────
if [ -n "${INSTANCE_ID:-}" ]; then
  # Supplied from `terraform output backend_instance_id`, so it is current as of
  # the last apply. Still verified to be RUNNING: if the instance was replaced
  # outside Terraform, or state is behind reality, fall through to tag discovery
  # rather than sending to a terminated instance.
  echo "==> Checking instance from Terraform output: $INSTANCE_ID"
  STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[].Instances[].State.Name' --output text 2>/dev/null || true)
  if [ "$STATE" = "running" ]; then
    echo "    running - using it"
  else
    echo "::warning::$INSTANCE_ID is not running (state: ${STATE:-not found}); falling back to tag discovery"
    INSTANCE_ID=""
  fi
fi

if [ -z "${INSTANCE_ID:-}" ]; then
  echo "==> Resolving running instance tagged Name=$INSTANCE_NAME_TAG"
  INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME_TAG" \
              "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].InstanceId' --output text)

  # More than one match means the tag is ambiguous - refuse rather than deploy
  # to an arbitrary box.
  COUNT=$(printf '%s\n' $INSTANCE_ID | grep -c . || true)
  if [ "$COUNT" -eq 0 ]; then
    echo "::error::no RUNNING instance tagged Name=$INSTANCE_NAME_TAG. Has terraform been applied? Is the instance stopped?"
    exit 1
  fi
  if [ "$COUNT" -gt 1 ]; then
    echo "::error::$COUNT running instances tagged Name=$INSTANCE_NAME_TAG: $INSTANCE_ID. Refusing to guess - set INSTANCE_ID."
    exit 1
  fi
  echo "    resolved: $INSTANCE_ID"
fi

# ── Wait for the SSM agent to be Online ─────────────────────────────────────
# An instance that is "running" is not necessarily registered with SSM yet
# (agent still starting, instance profile just attached, no route to the SSM
# endpoints). Sending before then is the other source of InvalidInstanceId.
echo "==> Waiting for SSM agent to register"
PING=""
for i in $(seq 1 30); do
  PING=$(aws ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
  [ "$PING" = "Online" ] && { echo "    Online (check $i)"; break; }
  sleep 10
done

if [ "$PING" != "Online" ]; then
  echo "::error::SSM agent for $INSTANCE_ID is not Online (last status: ${PING:-none})."
  echo "  Check, in order:"
  echo "   1. instance profile has AmazonSSMManagedInstanceCore"
  echo "   2. amazon-ssm-agent is running on the box"
  echo "   3. egress to the SSM endpoints on 443 (NAT instance healthy)"
  exit 1
fi

TAG="${TAG:-manual}"
CORS_ORIGINS="${CORS_ORIGINS:-}"
APP_PORT="${APP_PORT:-8000}"
CONTAINER_PORT="${CONTAINER_PORT:-5174}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLOUT="$SCRIPT_DIR/ec2-rollout.sh"
test -f "$ROLLOUT" || { echo "::error::missing $ROLLOUT"; exit 1; }

# Two command entries: an export preamble, then a line that runs the rollout.
# AWS-RunShellScript executes with /bin/sh (dash on Ubuntu), which rejects
# `set -o pipefail` and ignores the shebang, so the script is shipped base64 and
# run explicitly with bash. The exports are inherited by that child process.
PREAMBLE=$(cat <<PRE
export REGION='${AWS_REGION}'
export IMAGE='${IMAGE}'
export SECRET_ID='${SECRET_ID}'
export CORS_ORIGINS='${CORS_ORIGINS}'
export APP_PORT='${APP_PORT}'
export CONTAINER_PORT='${CONTAINER_PORT}'
export USERS_TABLE='${USERS_TABLE}'
export CHAT_HISTORY_TABLE='${CHAT_HISTORY_TABLE}'
export ATTACHMENTS_TABLE='${ATTACHMENTS_TABLE}'
export CHAT_BUCKET='${CHAT_BUCKET}'
export DOCUMENTS_BUCKET='${DOCUMENTS_BUCKET}'
export COGNITO_USER_POOL_ID='${COGNITO_USER_POOL_ID}'
export COGNITO_APP_CLIENT_ID='${COGNITO_APP_CLIENT_ID}'
export ADMINS_TABLE='${ADMINS_TABLE}'
export ADMIN_INVITATIONS_TABLE='${ADMIN_INVITATIONS_TABLE}'
export ADMIN_AUDIT_TABLE='${ADMIN_AUDIT_TABLE}'
export ANALYTICS_EVENTS_TABLE='${ANALYTICS_EVENTS_TABLE}'
export ANALYTICS_AGG_TABLE='${ANALYTICS_AGG_TABLE}'
export ANALYTICS_SALT_SECRET_ID='${ANALYTICS_SALT_SECRET_ID}'
export API_GATEWAY_ID='${API_GATEWAY_ID}'
export APP_URL='${APP_URL}'
export SES_SENDER_EMAIL='${SES_SENDER_EMAIL}'
PRE
)

jq -n \
  --arg preamble "$PREAMBLE" \
  --arg body "echo '$(base64 -w0 "$ROLLOUT")' | base64 -d > /tmp/sankatai-rollout.sh && bash /tmp/sankatai-rollout.sh" \
  '{commands: [$preamble, $body]}' > /tmp/ssm-params.json

echo "==> Sending rollout to $INSTANCE_ID"
CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "SankatAI deploy $TAG" \
  --parameters file:///tmp/ssm-params.json \
  --query 'Command.CommandId' --output text)
echo "    command id: $CMD_ID"

# `wait` exits non-zero on failure; swallow it so the instance-side output can
# be printed before this job dies.
set +e
aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$INSTANCE_ID"
set -e

invocation() {
  aws ssm get-command-invocation \
    --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --query "$1" --output text
}

echo "--- instance stdout ---"
invocation 'StandardOutputContent'
echo "--- instance stderr ---"
invocation 'StandardErrorContent'

STATUS=$(invocation 'Status')
echo "Status: $STATUS"

if [ "$STATUS" != "Success" ]; then
  echo "::error::backend rollout finished with status $STATUS"
  exit 1
fi

[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "### Backend deployed (\`$TAG\`)" >> "$GITHUB_STEP_SUMMARY"
exit 0
