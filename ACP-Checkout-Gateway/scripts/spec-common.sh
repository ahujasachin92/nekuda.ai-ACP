#!/usr/bin/env bash
# Shared configuration and helpers for spec management scripts

set -euo pipefail

# Configuration
REPO="agentic-commerce-protocol/agentic-commerce-protocol"
SPEC_VERSION_FILE=".spec-version"
SPEC_DIR="spec"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/main"

# Files to download (remote path -> local filename)
SPEC_FILES=(
  "openapi/openapi.agentic_checkout.yaml:openapi.agentic_checkout.yaml"
  "openapi/openapi.agentic_checkout_webhook.yaml:openapi.agentic_checkout_webhook.yaml"
  "json-schema/schema.agentic_checkout.json:schema.agentic_checkout.json"
)

# Get the project root directory (where .spec-version lives)
get_project_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "$(cd "$script_dir/.." && pwd)"
}

# Read current version from .spec-version
get_current_version() {
  local root
  root="$(get_project_root)"
  if [[ -f "$root/$SPEC_VERSION_FILE" ]]; then
    cat "$root/$SPEC_VERSION_FILE" | tr -d '[:space:]'
  else
    echo ""
  fi
}

# Logging helpers
log_ok() {
  echo "  ✓ $1"
}

log_err() {
  echo "  ✗ $1" >&2
}

log_info() {
  echo "$1"
}

# Version pattern (YYYY-MM-DD)
VERSION_PATTERN='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'

# Check if a string is a valid version format
is_valid_version() {
  [[ "$1" =~ $VERSION_PATTERN ]]
}
