#!/usr/bin/env bash
set -Eeuo pipefail

# Keep post-merge setup non-interactive and consistent with CI/deploy installs.
export CI=true

pnpm install --frozen-lockfile --prefer-offline
pnpm --filter @workspace/db run push
