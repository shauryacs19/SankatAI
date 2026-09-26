#!/usr/bin/env bash
# Read resource IDs from Terraform state and publish them as GitHub job outputs.
#
# This is the single source of truth for every AWS resource ID the deploy needs.
# Nothing here is a secret: bucket names, distribution ids, instance ids and
# endpoints are all non-sensitive identifiers. Real secrets stay in GitHub
# Secrets / AWS Secrets Manager and never pass through here.
#
# Runs `terraform init` against the S3 backend in infrastructure/terraform, so
# it reads the SAME state `terraform apply` writes - an instance replaced by an
# apply is reflected on the next deploy with no manual update anywhere.
#
# Requires: AWS credentials (OIDC) with read access to the state object.
set -euo pipefail

TF_DIR="${TF_DIR:-infrastructure/terraform}"

echo "==> terraform init ($TF_DIR)"
# -backend=true is the default but stated explicitly: reading outputs REQUIRES
# the real remote state, and a silent fallback to empty local state would hand
# every downstream job an empty string.
terraform -chdir="$TF_DIR" init -input=false -backend=true >/dev/null

echo "==> terraform output"
# Never echoed: state outputs are dumped to a file, and only the named keys
# below are surfaced. Keeps any output marked sensitive out of the job log.
terraform -chdir="$TF_DIR" output -json > /tmp/tf-outputs.json

# github_output_name:terraform_output_name
MAPPINGS="
frontend_bucket:frontend_bucket_name
cloudfront_distribution_id:cloudfront_distribution_id
cloudfront_domain_name:cloudfront_domain_name
backend_instance_id:backend_instance_id
ecr_repository_url:ecr_repository_url
api_gateway_endpoint:api_gateway_endpoint
cognito_user_pool_id:cognito_user_pool_id
cognito_user_pool_client_id:cognito_user_pool_client_id
cognito_hosted_ui_domain:cognito_hosted_ui_domain
users_table_name:users_table_name
chat_history_table_name:chat_history_table_name
attachments_table_name:attachments_table_name
chat_bucket_name:chat_bucket_name
documents_bucket_name:documents_bucket_name
ai_api_key_secret_name:ai_api_key_secret_name
admins_table_name:admins_table_name
admin_invitations_table_name:admin_invitations_table_name
admin_audit_table_name:admin_audit_table_name
analytics_events_table_name:analytics_events_table_name
analytics_agg_table_name:analytics_agg_table_name
analytics_salt_secret_name:analytics_salt_secret_name
api_gateway_id:api_gateway_id
app_url:app_url
"

# May legitimately be empty (invitations then answer 503 until it is set).
OPTIONAL_MAPPINGS="
ses_sender_email:ses_sender_email
cognito_social_providers:cognito_social_providers
"

missing=0
for pair in $MAPPINGS; do
  out_name="${pair%%:*}"
  tf_name="${pair##*:}"

  value=$(jq -r --arg k "$tf_name" '.[$k].value // empty' /tmp/tf-outputs.json)

  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo "::error::terraform output '$tf_name' is missing or empty - has 'terraform apply' run?"
    missing=1
    continue
  fi

  echo "${out_name}=${value}" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "    ${out_name} = ${value}"
done

for pair in $OPTIONAL_MAPPINGS; do
  out_name="${pair%%:*}"
  tf_name="${pair##*:}"
  value=$(jq -r --arg k "$tf_name" '.[$k].value // empty' /tmp/tf-outputs.json)
  echo "${out_name}=${value}" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "    ${out_name} = ${value:-<empty>}"
done

rm -f /tmp/tf-outputs.json
[ "$missing" -eq 0 ] || exit 1
echo "==> all outputs resolved"
