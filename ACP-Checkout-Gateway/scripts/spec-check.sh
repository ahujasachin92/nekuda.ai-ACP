#!/usr/bin/env bash
# Check current spec version and discover available upstream versions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/spec-common.sh"

# Parse arguments
INCLUDE_UNRELEASED=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --include-unreleased)
      INCLUDE_UNRELEASED=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--include-unreleased]" >&2
      exit 1
      ;;
  esac
done

# Get current version
CURRENT_VERSION=$(get_current_version)
if [[ -z "$CURRENT_VERSION" ]]; then
  echo "Error: No .spec-version file found" >&2
  exit 1
fi

# Fetch available versions from upstream using gh api
VERSIONS=$(gh api "repos/${REPO}/contents/spec" --jq '.[].name' 2>/dev/null || {
  echo "Error: Failed to fetch versions from GitHub. Make sure 'gh' is installed and authenticated." >&2
  exit 1
})

# Filter to YYYY-MM-DD pattern and optionally include 'unreleased'
FILTERED_VERSIONS=()
LATEST=""
while IFS= read -r version; do
  if is_valid_version "$version"; then
    FILTERED_VERSIONS+=("$version")
    # Track latest (lexicographic comparison works for date format)
    if [[ -z "$LATEST" || "$version" > "$LATEST" ]]; then
      LATEST="$version"
    fi
  elif [[ "$version" == "unreleased" && "$INCLUDE_UNRELEASED" == true ]]; then
    FILTERED_VERSIONS+=("$version")
  fi
done <<< "$VERSIONS"

# Sort versions
IFS=$'\n' SORTED_VERSIONS=($(sort <<< "${FILTERED_VERSIONS[*]}")); unset IFS

# Display output
echo ""
echo "Spec Version Status"
echo "───────────────────"
echo "Current: $CURRENT_VERSION"
echo ""
echo "Available:"

NEWER_COUNT=0
for version in "${SORTED_VERSIONS[@]}"; do
  MARKER=""
  if [[ "$version" == "$CURRENT_VERSION" ]]; then
    MARKER="  (current)"
  elif [[ "$version" == "$LATEST" ]]; then
    MARKER="  ← latest"
  elif [[ "$version" == "unreleased" ]]; then
    MARKER="  (development)"
  fi

  echo "  $version$MARKER"

  # Count newer versions (excluding unreleased)
  if is_valid_version "$version" && [[ "$version" > "$CURRENT_VERSION" ]]; then
    ((NEWER_COUNT++))
  fi
done

echo ""
if [[ $NEWER_COUNT -gt 0 ]]; then
  echo "$NEWER_COUNT newer version(s) available."
else
  echo "You are on the latest version."
fi
