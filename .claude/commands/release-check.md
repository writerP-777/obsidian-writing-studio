Run the release preflight checklist for version $ARGUMENTS.

If no version argument is provided, ask Don for the target version before proceeding.

Check each item below and report PASS or FAIL. Do not tag until all nine pass.

1. **CHANGELOG heading** — Read CHANGELOG.md and confirm it contains a `## [$ARGUMENTS]` heading (exact match including brackets, e.g. `## [2.4.5]`).
2. **Tag prefix** — Confirm `$ARGUMENTS` begins with a digit, not the letter v (correct: `2.4.5`, wrong: `v2.4.5`).
3. **Lint** — Run: `npm run lint`
4. **Tests** — Run: `npm test`
5. **Manifest version** — Read manifest.json and confirm the `version` field equals `$ARGUMENTS` exactly.
6. **package.json version** — Read package.json and confirm the `version` field equals `$ARGUMENTS` exactly.
7. **versions.json top entry** — Read versions.json and confirm the first key in the object equals `$ARGUMENTS` exactly.
8. **README.md version badge** — Read README.md and confirm it contains `**Version $ARGUMENTS**`.
9. **Branch name** — Run `git branch --show-current` and confirm the current branch is `release/$ARGUMENTS`.

**SECURITY.md note:** If this is a minor or major version bump (e.g. 2.4.x → 2.5.0 or 3.0.0), remind Don to update the supported versions table in SECURITY.md before tagging.

Report results as a table:

| Check | Result | Detail |
|---|---|---|
| CHANGELOG heading | PASS/FAIL | e.g. "## [2.4.5] found" or "heading not found" |
| Tag prefix | PASS/FAIL | state the value if it starts with v |
| Lint | PASS/FAIL | error/warning count if failed |
| Tests | PASS/FAIL | failed test count and names if failed |
| Manifest version | PASS/FAIL | actual value if mismatched |
| package.json version | PASS/FAIL | actual value if mismatched |
| versions.json top entry | PASS/FAIL | actual first key if mismatched |
| README.md version badge | PASS/FAIL | actual line if mismatched |
| Branch name | PASS/FAIL | actual branch name if wrong |

If all nine pass: state "Release preflight passed — safe to tag $ARGUMENTS."
If any fail: state "Release preflight FAILED — do not tag until all items pass." List exactly what needs fixing.
