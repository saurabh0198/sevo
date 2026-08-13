#!/bin/bash
set -e

echo "=== SEVO FRONTEND PRE-DEPLOY GATE ==="

echo "[1/2] Syntax check..."
node --check script.js

echo "[2/2] Running Playwright @critical tests..."
npx playwright test --grep @critical --reporter=line

echo ""
echo "=== FRONTEND GATE PASSED ==="
echo "Safe to commit/push to master."
echo "REMINDER: this does NOT auto-deploy to the live site."
echo "The live mirror (D:\\sevo-live-mirror) is a separate, manual, PAT-gated step — run this gate again against the mirrored files before pushing to live/main."
