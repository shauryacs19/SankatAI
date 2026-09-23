#!/usr/bin/env bash
# Deploy the SankatAI web frontend to S3 + CloudFront.
#
# Prerequisites:
#   - AWS CLI installed and configured (aws configure) with permissions for
#     S3 + CloudFront.
#   - Infra applied once:  terraform -chdir=infrastructure/terraform init && terraform -chdir=infrastructure/terraform apply
#     (creates the S3 bucket, CloudFront distribution and Cognito pool).
#
# Usage:  ./deploy-frontend.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Reading infrastructure outputs"
# Every id comes from Terraform state - the same source the CD pipeline reads.
# Nothing is hardcoded here, so a replaced pool or bucket needs no edit.
BUCKET=$(terraform -chdir=infrastructure/terraform output -raw frontend_bucket_name)
DIST_ID=$(terraform -chdir=infrastructure/terraform output -raw cloudfront_distribution_id)
POOL_ID=$(terraform -chdir=infrastructure/terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform -chdir=infrastructure/terraform output -raw cognito_user_pool_client_id)
COGNITO_DOMAIN=$(terraform -chdir=infrastructure/terraform output -raw cognito_hosted_ui_domain)

echo "==> Building frontend"
(
  npm install --workspace=@sankatai/web
  VITE_API_URL=/ \
  VITE_COGNITO_USER_POOL_ID="$POOL_ID" \
  VITE_COGNITO_CLIENT_ID="$CLIENT_ID" \
  VITE_COGNITO_DOMAIN="$COGNITO_DOMAIN" \
  npm run build
)
echo "    bucket:       $BUCKET"
echo "    distribution: $DIST_ID"

echo "==> Uploading to S3"
# Hashed assets: cache forever. index.html: never cache (so new deploys show up).
aws s3 sync apps/web/dist "s3://$BUCKET" --delete \
  --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"
aws s3 cp apps/web/dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache"

echo "==> Invalidating CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo "==> Done. Live at:"
echo "    https://$(terraform -chdir=infrastructure/terraform output -raw cloudfront_domain_name)"
