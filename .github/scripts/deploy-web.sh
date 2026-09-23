#!/usr/bin/env bash
# Publish apps/web/dist to S3 and drop the CloudFront edge cache.
#
# Required env:
#   BUCKET   - frontend S3 bucket name      (terraform output frontend_bucket_name)
#   DIST_ID  - CloudFront distribution id   (terraform output cloudfront_distribution_id)
set -euo pipefail

: "${BUCKET:?set vars.FRONTEND_BUCKET in repo settings}"
: "${DIST_ID:?set vars.CLOUDFRONT_DISTRIBUTION_ID in repo settings}"

echo "==> Syncing to s3://$BUCKET"
# Hashed asset filenames are content-addressed, so they can cache forever.
aws s3 sync apps/web/dist "s3://$BUCKET" --delete \
  --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"

# index.html must never be cached, or a deploy stays invisible to browsers.
aws s3 cp apps/web/dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache"

echo "==> Invalidating CloudFront $DIST_ID"
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text)

aws cloudfront wait invalidation-completed \
  --distribution-id "$DIST_ID" --id "$INVALIDATION_ID"

echo "Invalidation $INVALIDATION_ID complete"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "### Web deployed" >> "$GITHUB_STEP_SUMMARY"
exit 0
