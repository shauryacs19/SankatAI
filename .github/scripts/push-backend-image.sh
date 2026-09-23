#!/usr/bin/env bash
# Build the backend image and push it to ECR.
#
# The repository is IMMUTABLE, so pushing a tag that already exists fails. A
# re-run for the same commit is legitimate (e.g. after a transient SSM failure),
# so an existing tag is reused rather than treated as an error.
#
# Required env:
#   REPOSITORY_URL  - full ECR repo URL, from `terraform output ecr_repository_url`
#                     (registry host and repo name are both derived from it, so
#                     there is no second copy of either to drift)
#   TAG             - image tag; the CI commit SHA
#
# Writes IMAGE=<full ref> to $GITHUB_ENV for the rollout step.
set -euo pipefail

: "${REPOSITORY_URL:?missing - expected from terraform output ecr_repository_url}"
: "${TAG:?missing image tag}"

# e.g. 1234.dkr.ecr.ap-south-1.amazonaws.com/sankatai-backend
ECR_REPOSITORY="${REPOSITORY_URL##*/}"   # sankatai-backend
IMAGE="$REPOSITORY_URL:$TAG"

if aws ecr describe-images \
     --repository-name "$ECR_REPOSITORY" \
     --image-ids imageTag="$TAG" >/dev/null 2>&1; then
  echo "==> $TAG already in ECR - reusing, skipping build and push"
else
  echo "==> Building $IMAGE"
  docker build -t "$IMAGE" ./backend
  echo "==> Pushing"
  docker push "$IMAGE"
fi

echo "IMAGE=$IMAGE" >> "${GITHUB_ENV:-/dev/null}"
echo "$IMAGE"
