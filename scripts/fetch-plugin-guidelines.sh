#!/usr/bin/env bash
# Downloads the current Obsidian developer standards from the official source
# and caches them locally for use by scripts/scorecard-check.sh.
#
# Run this periodically (or after any Obsidian release) to stay current:
#   npm run fetch:guidelines
#
# Source repository: https://github.com/obsidianmd/obsidian-developer-docs

set -eo pipefail

BASE_URL="https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/main/en"
CACHE_DIR="docs/obsidian-guidelines"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

mkdir -p "$CACHE_DIR"

fetch_doc() {
  local name="$1"
  local path="$2"
  local outfile="$CACHE_DIR/$3"
  local encoded_path
  encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$path'))" 2>/dev/null \
    || node -e "process.stdout.write(encodeURIComponent('$path').replace(/%2F/g,'/'))" 2>/dev/null \
    || echo "$path" | sed 's/ /%20/g')

  if curl -sf "$BASE_URL/$encoded_path" -o "$outfile"; then
    echo -e "${GREEN}✓${NC} $name"
  else
    echo -e "${RED}✗${NC} $name — fetch failed (check network or URL)"
    return 1
  fi
}

echo ""
echo "Fetching Obsidian developer standards..."
echo ""

fetch_doc "Plugin guidelines"              "Plugins/Releasing/Plugin guidelines.md"              "plugin-guidelines.md"
fetch_doc "Developer policies"             "Developer policies.md"                               "developer-policies.md"
fetch_doc "Submission requirements"        "Plugins/Releasing/Submission requirements for plugins.md" "submission-requirements.md"

# Store fetch timestamp
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$CACHE_DIR/.fetch-timestamp"

echo ""
echo -e "${GREEN}Done.${NC} Standards cached to $CACHE_DIR/"
echo "Run 'npm run check:scorecard' or commit to trigger the pre-commit check."
