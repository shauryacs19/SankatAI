#!/usr/bin/env bash
# Build the web app for deployment.
#
# Installs from the REPOSITORY ROOT on purpose: this is an npm-workspaces
# monorepo and apps/web depends on @sankatai/shared through a `file:` link, so
# an apps/web-only install resolves the wrong tree.
#
# Required env: none (VITE_* are optional and fall through to build defaults).
set -euo pipefail

npm ci
npm run build:web

test -f apps/web/dist/index.html || {
  echo "::error::build produced no apps/web/dist/index.html"
  exit 1
}
echo "Built $(find apps/web/dist -type f | wc -l) files into apps/web/dist"
