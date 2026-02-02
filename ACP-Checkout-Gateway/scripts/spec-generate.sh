#!/usr/bin/env bash
# Generate TypeScript types from local spec files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/spec-common.sh"

PROJECT_ROOT="$(get_project_root)"

echo ""
echo "Generating types..."

# Generate API types from OpenAPI spec
if npx openapi-typescript "$PROJECT_ROOT/$SPEC_DIR/openapi.agentic_checkout.yaml" -o "$PROJECT_ROOT/src/api.ts" 2>/dev/null; then
  log_ok "src/api.ts"
else
  log_err "Failed to generate src/api.ts"
  exit 1
fi

# Generate webhook types from OpenAPI spec
if npx openapi-typescript "$PROJECT_ROOT/$SPEC_DIR/openapi.agentic_checkout_webhook.yaml" -o "$PROJECT_ROOT/src/webhooks.ts" 2>/dev/null; then
  log_ok "src/webhooks.ts"
else
  log_err "Failed to generate src/webhooks.ts"
  exit 1
fi

echo ""
echo "Done."
