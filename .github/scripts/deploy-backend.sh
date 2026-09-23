#!/usr/bin/env bash
# Ship ec2-rollout.sh to the private backend instance via SSM Run Command,
# wait for it, surface the instance-side output, and fail on anything but
# Success.
#
# Required env:
#   INSTANCE_ID  - target EC2 instance   (terraform output backend_instance_id)
#   IMAGE        - full ECR image ref    (set by push-backend-image.sh)
#   AWS_REGION   - deploy region
#   TAG          - image tag, for the command comment
# Optional env:
#   CORS_ORIGINS    - browser origins the API accepts (default: empty)
#   SECRET_ID       - Secrets Manager id for the AI key
#   APP_PORT        - host port the ALB targets        (default 8000)
#   CONTAINER_PORT  - port inside the container        (default 5174)
set -euo pipefail

: "${INSTANCE_ID:?set vars.BACKEND_INSTANCE_ID in repo settings}"
: "${IMAGE:?missing image ref - did push-backend-image.sh run?}"
: "${AWS_REGION:?missing region}"

TAG="${TAG:-manual}"
CORS_ORIGINS="${CORS_ORIGINS:-}"
SECRET_ID="${SECRET_ID:-sankatai/dev/openai_api_key}"
APP_PORT="${APP_PORT:-8000}"
CONTAINER_PORT="${CONTAINER_PORT:-5174}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLOUT="$SCRIPT_DIR/ec2-rollout.sh"
test -f "$ROLLOUT" || { echo "::error::missing $ROLLOUT"; exit 1; }

# Two command entries: an export preamble, then the rollout script verbatim.
# SSM runs them in one shell, so the exports are in scope for the script. jq
# builds the JSON, so no quoting of the script body is needed here.
PREAMBLE=$(cat <<PRE
export REGION='${AWS_REGION}'
export IMAGE='${IMAGE}'
export SECRET_ID='${SECRET_ID}'
export CORS_ORIGINS='${CORS_ORIGINS}'
export APP_PORT='${APP_PORT}'
export CONTAINER_PORT='${CONTAINER_PORT}'
PRE
)

jq -n \
  --arg preamble "$PREAMBLE" \
  --arg body "$(cat "$ROLLOUT")" \
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
