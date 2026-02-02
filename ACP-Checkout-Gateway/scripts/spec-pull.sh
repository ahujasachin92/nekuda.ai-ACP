#!/usr/bin/env bash
# Download specs from upstream for the configured version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/spec-common.sh"

PROJECT_ROOT="$(get_project_root)"

# Parse arguments
TARGET_VERSION=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      TARGET_VERSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--version <version>]" >&2
      exit 1
      ;;
  esac
done

# Get current version
CURRENT_VERSION=$(get_current_version)

# Determine which version to pull
if [[ -n "$TARGET_VERSION" ]]; then
  # Validate version format (allow 'unreleased' or YYYY-MM-DD)
  if [[ "$TARGET_VERSION" != "unreleased" ]] && ! is_valid_version "$TARGET_VERSION"; then
    log_err "Invalid version format: $TARGET_VERSION (expected YYYY-MM-DD or 'unreleased')"
    exit 1
  fi

  # Validate version exists upstream
  if ! gh api "repos/${REPO}/contents/spec/${TARGET_VERSION}" --silent 2>/dev/null; then
    log_err "Version $TARGET_VERSION not found upstream"
    exit 1
  fi

  # Update .spec-version if different
  if [[ "$TARGET_VERSION" != "$CURRENT_VERSION" ]]; then
    echo "Updating .spec-version: $CURRENT_VERSION → $TARGET_VERSION"
    echo "$TARGET_VERSION" > "$PROJECT_ROOT/$SPEC_VERSION_FILE"
    CURRENT_VERSION="$TARGET_VERSION"
  fi
elif [[ -z "$CURRENT_VERSION" ]]; then
  log_err "No version specified and no .spec-version file found"
  exit 1
fi

VERSION="$CURRENT_VERSION"

echo ""
echo "Pulling specs for version $VERSION..."

# Ensure spec directory exists
mkdir -p "$PROJECT_ROOT/$SPEC_DIR"

# Create temp directory for atomic downloads
TEMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Download all files to temp directory first
for spec_entry in "${SPEC_FILES[@]}"; do
  REMOTE_PATH="${spec_entry%%:*}"
  LOCAL_NAME="${spec_entry##*:}"

  URL="${RAW_BASE}/spec/${VERSION}/${REMOTE_PATH}"
  TEMP_DEST="$TEMP_DIR/$LOCAL_NAME"

  if curl -fsSL "$URL" -o "$TEMP_DEST"; then
    log_ok "$LOCAL_NAME"
  else
    log_err "Failed to download $LOCAL_NAME from $URL"
    exit 1
  fi
done

# All downloads succeeded - move files to final destination
for spec_entry in "${SPEC_FILES[@]}"; do
  LOCAL_NAME="${spec_entry##*:}"
  mv "$TEMP_DIR/$LOCAL_NAME" "$PROJECT_ROOT/$SPEC_DIR/$LOCAL_NAME"
done

echo ""
echo "Done. Run 'npm run spec:generate' to regenerate types."
