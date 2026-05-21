#!/usr/bin/env bash
# Obsidian plugin scorecard pre-check.
#
# Checks two sources of standards:
#
#   1. Official Obsidian developer standards (cached locally by fetch-plugin-guidelines.sh)
#      Source: https://github.com/obsidianmd/obsidian-developer-docs
#      Refresh: npm run fetch:guidelines
#
#   2. Community scorecard scanner patterns — patterns the automated review at
#      https://community.obsidian.md/plugins/writing-studio flags as Warnings.
#      These are separate from the official guidelines; they're the community
#      scanner's own heuristics.
#
# Severity:
#   ERROR  → blocks commit; pattern was fixed and must not return
#   WARN   → informational; known/accepted in this codebase

set -eo pipefail

ERRORS=0
WARNINGS=0

CACHE_DIR="docs/obsidian-guidelines"
GUIDELINES="$CACHE_DIR/plugin-guidelines.md"
POLICIES="$CACHE_DIR/developer-policies.md"
TIMESTAMP_FILE="$CACHE_DIR/.fetch-timestamp"
STALE_DAYS=30

TS_DIRS="src/ main.ts modals/"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

error()    { echo -e "  ${RED}✗ ERROR${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn()     { echo -e "  ${YELLOW}⚠ WARN${NC}  $1"; WARNINGS=$((WARNINGS + 1)); }
ok()       { echo -e "  ${GREEN}✓${NC} $1"; }
header()   { echo -e "\n${CYAN}─── $1 ───${NC}"; }
rule_ref() { echo -e "  ${DIM}Rule: $1${NC}"; }
rule_url() { echo -e "  ${DIM}Ref:  $1${NC}"; }

# ── Guidelines cache status ────────────────────────────────────────────────────

echo ""
echo "=== Obsidian scorecard pre-check ==="

if [ ! -f "$GUIDELINES" ]; then
  echo -e "\n${YELLOW}⚠  Guidelines cache missing.${NC}"
  echo "   Run 'npm run fetch:guidelines' to download the current Obsidian developer standards."
  echo "   Proceeding with scorecard-only checks..."
  GUIDELINES=""
  POLICIES=""
else
  FETCHED=$(cat "$TIMESTAMP_FILE" 2>/dev/null || echo "unknown")
  # Check staleness (days since fetch)
  NOW=$(date -u +%s 2>/dev/null || date +%s)
  if [ "$FETCHED" != "unknown" ]; then
    FETCH_EPOCH=$(date -u -d "$FETCHED" +%s 2>/dev/null \
      || python3 -c "import datetime; print(int(datetime.datetime.fromisoformat('${FETCHED%Z}').timestamp()))" 2>/dev/null \
      || echo "$NOW")
    AGE_DAYS=$(( (NOW - FETCH_EPOCH) / 86400 ))
    if [ "$AGE_DAYS" -gt "$STALE_DAYS" ]; then
      echo -e "\n${YELLOW}⚠  Guidelines cache is ${AGE_DAYS} days old (>${STALE_DAYS}).${NC}"
      echo "   Run 'npm run fetch:guidelines' to get the current standards."
    else
      echo -e "\n${DIM}Guidelines: $CACHE_DIR/ (fetched $FETCHED, ${AGE_DAYS}d ago)${NC}"
    fi
  fi
fi

# ── Section 1: Official plugin guidelines ─────────────────────────────────────

header "Official plugin guidelines"

# Rule: Avoid innerHTML, outerHTML, insertAdjacentHTML (Security section)
IH_HITS=$(grep -rn --include="*.ts" \
  "innerHTML\s*=\|outerHTML\s*=\|insertAdjacentHTML" $TS_DIRS 2>/dev/null || true)
if [ -n "$IH_HITS" ]; then
  error "innerHTML/outerHTML/insertAdjacentHTML — use Obsidian DOM helpers instead"
  echo "$IH_HITS" | sed 's/^/    /'
  if [ -n "$GUIDELINES" ]; then
    rule_ref "$(grep -m1 'innerHTML' "$GUIDELINES" | sed 's/^#+\s*//')"
  fi
  rule_url "https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+innerHTML"
else
  ok "No innerHTML/outerHTML/insertAdjacentHTML"
fi

# Rule: Avoid global app instance (window.app)
APP_HITS=$(grep -rn --include="*.ts" "window\.app\b" $TS_DIRS 2>/dev/null || true)
if [ -n "$APP_HITS" ]; then
  warn "window.app used — prefer this.app from your plugin instance"
  echo "$APP_HITS" | sed 's/^/    /'
  rule_url "https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+using+global+app+instance"
else
  ok "No window.app usage"
fi

# Rule: No hardcoded styles (Styling section)
# Dynamic layout properties (top/left/transform/width/height/display) are
# legitimately set in JS for runtime positioning — only flag cosmetic properties.
STYLE_HITS=$(grep -rn --include="*.ts" \
  "\.style\.color\s*=\|\.style\.background\|\.style\.font\|\.style\.border\|\.style\.padding\s*=\|\.style\.margin\s*=\|\.style\.opacity\s*=" \
  $TS_DIRS 2>/dev/null || true)
if [ -n "$STYLE_HITS" ]; then
  warn "Hardcoded cosmetic styles — use CSS classes or Obsidian CSS variables instead"
  echo "$STYLE_HITS" | sed 's/^/    /'
  rule_url "https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#No+hardcoded+styling"
else
  ok "No hardcoded cosmetic styles"
fi

# Rule: normalizePath() must be used for vault paths
NORM_MISSING=$(grep -rn --include="*.ts" \
  "vault\.create\b\|vault\.modify\b\|vault\.createBinary\b\|vault\.modifyBinary\b" \
  $TS_DIRS 2>/dev/null \
  | grep -v "normalizePath\|^Binary" || true)
# Only flag if normalizePath is not imported at all in files that write to vault
NORM_IMPORT=$(grep -rl --include="*.ts" "normalizePath" $TS_DIRS 2>/dev/null | tr '\n' ' ')
if [ -z "$NORM_IMPORT" ] && [ -n "$NORM_MISSING" ]; then
  warn "normalizePath() not imported — required for any vault file operations"
  rule_url "https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Use+normalizePath"
else
  ok "normalizePath() imported"
fi

# ── Section 2: Developer policies ─────────────────────────────────────────────

header "Developer policies"

# Policy: No client-side telemetry / analytics
# Match imports of known analytics libraries or window-level tracking calls.
TEL_HITS=$(grep -rn --include="*.ts" \
  "from ['\"]mixpanel\|from ['\"]amplitude\|from ['\"]@segment\|from ['\"]posthog\|window\.analytics\.\|window\.mixpanel\.\|window\.amplitude\." \
  $TS_DIRS 2>/dev/null || true)
if [ -n "$TEL_HITS" ]; then
  error "Possible telemetry/analytics — not allowed per developer policies"
  echo "$TEL_HITS" | sed 's/^/    /'
  if [ -n "$POLICIES" ]; then
    rule_ref "$(grep -m1 -i "telemetry" "$POLICIES" | head -c 120)"
  fi
  rule_url "https://docs.obsidian.md/Developer+policies"
else
  ok "No telemetry or analytics detected"
fi

# Policy: No auto-update mechanism (plugin must not replace its own files)
# Match patterns that suggest downloading/replacing the plugin binary itself.
UPDATE_HITS=$(grep -rn --include="*.ts" \
  "downloadUpdate\|installUpdate\|updatePlugin\b\|\.plugins\b.*download\|main\.js.*download\|download.*main\.js" \
  $TS_DIRS 2>/dev/null || true)
if [ -n "$UPDATE_HITS" ]; then
  error "Possible self-update mechanism — not allowed per developer policies"
  echo "$UPDATE_HITS" | sed 's/^/    /'
  rule_url "https://docs.obsidian.md/Developer+policies"
else
  ok "No self-update mechanism"
fi

# ── Section 3: Community scorecard scanner patterns ───────────────────────────
#
# These patterns are flagged by the community review scanner at
# https://community.obsidian.md/plugins/writing-studio — they are SEPARATE from
# the official developer policies above.

header "Community scorecard scanner"
echo -e "  ${DIM}Reference: https://community.obsidian.md/plugins/writing-studio${NC}"

# Scorecard: Direct Filesystem Access (Warning)
# The 'fs' module was removed; use vault.createBinary/modifyBinary instead.
# ERROR here so it cannot regress.
FS_HITS=$(grep -rn --include="*.ts" "from ['\"]fs['\"]" $TS_DIRS 2>/dev/null || true)
if [ -n "$FS_HITS" ]; then
  error "Direct filesystem — 'fs' module imported (scorecard: Warning)"
  echo "    Use vault.createBinary / vault.modifyBinary instead."
  echo "$FS_HITS" | sed 's/^/    /'
else
  ok "No 'fs' module imports (scorecard: Direct Filesystem Access)"
fi

# Scorecard: Shell Execution (Warning)
# child_process is accepted here for pandoc DOCX/RTF/PDF export.
# WARN only; replacing pandoc with a pure-JS library would remove this warning.
CP_HITS=$(grep -rn --include="*.ts" "from ['\"]child_process['\"]" $TS_DIRS 2>/dev/null || true)
if [ -n "$CP_HITS" ]; then
  warn "Shell execution — 'child_process' in use (scorecard: Warning, accepted for pandoc export)"
  echo "$CP_HITS" | sed 's/^/    /'
fi

# Scorecard: CSS !important (Warning)
# !important was removed from styles.css; increase selector specificity instead.
# ERROR here so it cannot regress.
IMP_HITS=$(grep -n "!important\s*;" styles.css 2>/dev/null || true)
if [ -n "$IMP_HITS" ]; then
  error "CSS !important used (scorecard: Warning)"
  echo "    Increase selector specificity instead (e.g. body .ws-class { ... })."
  echo "$IMP_HITS" | sed 's/^/    styles.css:/'
else
  ok "No !important in styles.css (scorecard: CSS hygiene)"
fi

# Scorecard: Vault Enumeration (Other — informational, not a Warning)
# vault.getFiles() is used by the binder scan feature. Flagged as informational.
VE_HITS=$(grep -rn --include="*.ts" \
  "vault\.getFiles\b\|getMarkdownFiles\b" $TS_DIRS 2>/dev/null || true)
if [ -n "$VE_HITS" ]; then
  warn "Vault enumeration — vault.getFiles/getMarkdownFiles (scorecard: Other, informational)"
  echo "$VE_HITS" | sed 's/^/    /'
fi

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}✗ Scorecard pre-check failed — $ERRORS error(s), $WARNINGS warning(s).${NC}"
  echo "  Fix all errors before committing. Warnings are accepted known patterns."
  exit 1
else
  echo -e "${GREEN}✓ Scorecard pre-check passed${NC} — $WARNINGS warning(s) (accepted)."
  exit 0
fi
