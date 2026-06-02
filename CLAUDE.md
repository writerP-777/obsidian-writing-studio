\# Obsidian Plugin: obsidian-writing-studio



\## Critical Reference Documents

ALL Obsidian API and submission requirements are in local docs.

Before writing any code, read the relevant section below.

Before finishing any task, verify output does not violate plugin guidelines.



\- @docs/obsidian-dev-docs/docs/plugins/releasing/plugin-guidelines.md

\- @docs/obsidian-dev-docs/docs/plugins/releasing/submit-your-plugin.md

\- @docs/obsidian-dev-docs/docs/reference/



\## ObsidianReviewBot — Required Rules

These are enforced automatically. Never violate them:



1\. Use normalizePath() for ALL file/folder paths

&#x20;  Import: `import { normalizePath } from "obsidian"`



2\. NEVER use innerHTML, outerHTML, or insertAdjacentHTML

&#x20;  Use Obsidian DOM helpers or native DOM API instead



3\. ALL Promises must be awaited or handled

&#x20;  Unhandled promises will be flagged by ESLint



4\. NEVER cast to `any` — use proper TypeScript types



5\. Do NOT assign styles via JavaScript — use CSS classes only



6\. Do NOT include "Obsidian" in the plugin description field



7\. Use sentence case in all UI text (settings, notices, modals)



8\. Do NOT detach leaves in onunload()



9\. Do NOT add custom ordering to ribbon items



10\. Description in manifest.json must end with . ? ! or )



## Manifest Rules
- id, name, and description must exactly match the community-plugins.json entry
- minAppVersion must be kept current



\## Release Assets Required

Attach these as individual binary files to the GitHub Release — NOT in a zip:

\- main.js

\- manifest.json

\- styles.css (if used)



## Release Preflight

Before tagging any release, run `/release-check <version>`. Do not tag until all nine checks pass:

1. CHANGELOG.md contains a `## [version]` heading matching the tag exactly
2. The tag contains no v prefix (correct: `2.4.5`, wrong: `v2.4.5`)
3. `npm run lint` passes with 0 errors and 0 warnings
4. `npm test` passes with 0 failures
5. manifest.json version field matches the tag exactly
6. package.json version field matches the tag exactly
7. versions.json top entry key matches the tag exactly
8. README.md contains `**Version X.Y.Z**` matching the tag
9. Current branch is named `release/X.Y.Z`

## Post-release Checklist

After pushing the tag and creating the GitHub Release, verify before closing out:

1. **Tag live:** `git ls-remote --tags origin X.Y.Z` — must return the tag SHA
2. **Assets uploaded:** `gh api repos/writerP-777/obsidian-writing-studio/releases/latest --jq '{tag,assets:[.assets[]|{name,size,state}]}'` — all three assets (`main.js`, `manifest.json`, `styles.css`) must show `"state":"uploaded"` with non-zero sizes
3. **Manifest correct:** download `manifest.json` from the release and confirm the `version` field matches the tag
4. **Issues closed:** comment on and close every GitHub issue resolved by this release
5. **SECURITY.md:** if this was a minor or major version bump, update the supported versions table

\## Commands

npm run dev       # watch build

npm run build     # production build

npm run lint      # run before every commit — catches ReviewBot issues

## Context Window Management — Non-Negotiable
Monitor context window usage throughout every session using /status.
At 60% usage: finish the current subtask and do not begin a new one.
At 70% usage: tell Don immediately — "Context is at 70% — recommend running /end-session."
At 75% usage: stop all work and prompt Don to run /end-session before proceeding.
Never allow auto-compaction to trigger. Auto-compaction destroys session integrity
and prevents the end-of-session routine from running cleanly.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Session notes

At the end of every session, always invoke `/end-session` before stopping.

If the session appears to be wrapping up (user says "done", "that's it", "bye", "stop", "exit", or goes quiet after completing a task), proactively suggest running `/end-session`.

Session notes are saved to: `C:\Users\donpu\Vaults\Pucik Notes\Obsidian Writing Studio\`

## Acceptance Criteria Protocol

Before beginning any non-trivial task — defined as any task that touches more than one file, introduces a new setting, or changes behavior a user would notice — write a short acceptance criteria block and surface it to Don for approval before writing any code. When in doubt whether a task qualifies, apply the protocol.

Use this template:
  Done when: [what is verifiably true when the work is finished]
  Stop if:   [conditions that halt the work]
  Out of scope: [explicit exclusions, if any]

Work does not begin until Don gives an affirmative response. Displaying the block and continuing is not sufficient.

If a Cowork direction brief already includes acceptance criteria, use those instead of generating new ones.

