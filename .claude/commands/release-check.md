Run the release preflight checklist for version $ARGUMENTS.

If no version argument is provided, ask Don for the target version before proceeding.

Check each item below and report PASS or FAIL. Do not tag until all four pass.

1. **CHANGELOG heading** — Read CHANGELOG.md and confirm it contains a `## [$ARGUMENTS]` heading (exact match including brackets, e.g. `## [2.4.5]`).
2. **Tag prefix** — Confirm `$ARGUMENTS` begins with a digit, not the letter v (correct: `2.4.5`, wrong: `v2.4.5`).
3. **Lint** — Run: `npm run lint`
4. **Manifest version** — Read manifest.json and confirm the `version` field equals `$ARGUMENTS` exactly.

Report results as a table:

| Check | Result | Detail |
|---|---|---|
| CHANGELOG heading | PASS/FAIL | e.g. "## [2.4.5] found" or "heading not found" |
| Tag prefix | PASS/FAIL | state the value if it starts with v |
| Lint | PASS/FAIL | error/warning count if failed |
| Manifest version | PASS/FAIL | actual value if mismatched |

If all four pass: state "Release preflight passed — safe to tag $ARGUMENTS."
If any fail: state "Release preflight FAILED — do not tag until all items pass." List exactly what needs fixing.
