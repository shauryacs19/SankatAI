#!/usr/bin/env bash
# Build the backend image and push it to ECR.
#
# The repository is IMMUTABLE, so pushing a tag that already exists fails. A
# re-run for the same commit is legitimate (e.g. after a transient SSM failure),
# so an existing tag is reused rather than treated as an error.
#
# Required env:
#   REGISTRY        - ECR registry host (output of aws-actions/amazon-ecr-login)
#   ECR_REPOSITORY  - repository name, e.g. sankatai-backend
#   TAG             - image tag; the CI commit SHA
#
# Writes IMAGE=<full ref> to $GITHUB_ENV for the rollout step.
set -euo pipefail

: "${REGISTRY:?missing ECR registry}"
: "${ECR_REPOSITORY:?missing ECR repository name}"
: "${TAG:?missing image tag}"

IMAGE="$REGISTRY/$ECR_REPOSITORY:$TAG"

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
