#!/bin/bash
set -e
echo "=== CLMM V2 Web Deploy ==="
pnpm --filter @clmm/app build
npx wrangler pages deploy apps/app/dist --project-name=clmm-v2
echo "=== Deploy complete ==="