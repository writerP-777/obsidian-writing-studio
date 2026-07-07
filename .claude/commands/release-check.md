Run the release preflight checklist for version $ARGUMENTS.

If no version argument is provided, ask Don for the target version before proceeding.

Check each item below and report PASS or FAIL. Do not tag until all twelve pass.

1. **CHANGELOG heading** — Read CHANGELOG.md and confirm it contains a `## [$ARGUMENTS]` heading (exact match including brackets, e.g. `## [2.4.5]`).
2. **Tag prefix** — Confirm `$ARGUMENTS` begins with a digit, not the letter v (correct: `2.4.5`, wrong: `v2.4.5`).
3. **Lint** — Run: `npm run lint`
4. **Tests** — Run: `npm test`
5. **Manifest version** — Read manifest.json and confirm the `version` field equals `$ARGUMENTS` exactly.
6. **package.json version** — Read package.json and confirm the `version` field equals `$ARGUMENTS` exactly.
7. **versions.json top entry** — Read versions.json and confirm the first key in the object equals `$ARGUMENTS` exactly.
8. **README.md version badge** — Read README.md and confirm it contains `**Version $ARGUMENTS**`.
9. **Branch name** — Run `git branch --show-current` and confirm the current branch is `release/$ARGUMENTS`.
10. **No eslint-disable for no-deprecated** — Run `grep -rn "eslint-disable.*no-deprecated" src/ modals/ main.ts` — must return no matches.
11. **CONTEXT.md current version** — Read CONTEXT.md and confirm the "current version" line equals `$ARGUMENTS` exactly (e.g. ``current version: `2.4.5` ``).
12. **No stale previous-version markers** — Determine PREV, the previous version, as the **second** key in versions.json (the entry directly below the new top entry — if the top is the new `X.Y.Z`, PREV is the key right below it; keep version examples out of this file so they never collide with a real PREV). Then scan the repo for PREV:

    ```
    git grep -n -F "<PREV>" -- ':!CHANGELOG.md' ':!versions.json' ':!package-lock.json' ':!main.js' ':!styles.css' ':!*.sarif' ':!docs/adr'
    ```

    (`git grep` searches only tracked files, so `node_modules`/`.git` need no exclusion. If `rg` is on PATH it works too, but add `-g '!node_modules' -g '!.git'`.)

    Expected: **no matches** (`git grep` exits non-zero when nothing is found — that is the PASS case). Any match is a stale current-version marker (a file that still advertises the previous version) and **FAILS the release** — bump it to `$ARGUMENTS`. This catches version markers in files not explicitly named by the other checks (docs, source comments, ADRs, etc.).

    Allowlist rationale — the excluded paths legitimately contain a non-marker occurrence of PREV: `CHANGELOG.md` and `versions.json` retain historical version numbers by design; `package-lock.json`, `main.js`, and `styles.css` are generated/lock artifacts that may pin third-party version strings coincidentally equal to PREV (the plugin's own version in these is already covered by check #6 and the production rebuild); `docs/adr` records are immutable history — an ADR stating what was "in effect through X.Y.Z" is a fact about the past, and bumping it would falsify the record (allowlisted at the first major release after ADR 0001, whose references to the version it superseded correctly tripped this scan). If a future authored file gains a legitimate, non-marker reference to PREV, add it to this allowlist with a comment explaining why — do not silence the check by other means.

    Note: this scan keys on the exact previous version string (e.g. `2.8.0`). The `x`-form supported-versions table in SECURITY.md (e.g. `2.8.x`) is covered by the SECURITY.md note below, not by this scan.

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
| No eslint-disable no-deprecated | PASS/FAIL | list any matching lines if found |
| CONTEXT.md current version | PASS/FAIL | actual value if mismatched |
| No stale previous-version markers | PASS/FAIL | list file:line of any match (PREV) |

If all twelve pass: state "Release preflight passed — safe to tag $ARGUMENTS."
If any fail: state "Release preflight FAILED — do not tag until all items pass." List exactly what needs fixing.
