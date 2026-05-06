#!/usr/bin/env bash
# CodeQL database build and analysis script.
# Exits 0 if CodeQL is not installed (with a notice) or on success.
# Exits 1 if CodeQL is installed but the scan fails.

set -eo pipefail

DB=".codeql-db"
RESULTS=".codeql-results.sarif"

if ! command -v codeql &>/dev/null; then
  echo "⚠  CodeQL CLI not found — skipping scan."
  echo "   To install: winget install GitHub.CodeQL"
  exit 0
fi

echo "→ Building CodeQL database (javascript/typescript)..."
codeql database create "$DB" \
  --language=javascript \
  --source-root=. \
  --overwrite \
  --threads=0 \
  --quiet

echo "→ Running CodeQL analysis..."
codeql database analyze "$DB" \
  javascript-security-and-quality.qls \
  --format=sarifv2.1.0 \
  --output="$RESULTS" \
  --threads=0 \
  --quiet

echo "✓ Results written to $RESULTS"
