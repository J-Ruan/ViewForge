#!/usr/bin/env bash
set -euo pipefail
cd /workspace/ViewForge
npm ci --cache /tmp/viewforge-npm
npm run typecheck
npm test
npm run build
