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



\## Manifest Requirements

\- version must match GitHub release tag exactly (no "v" prefix)

\- id, name, description must exactly match community-plugins.json entry

\- minAppVersion must be kept current



\## Release Assets Required

Attach these as individual binary files to the GitHub Release — NOT in a zip:

\- main.js

\- manifest.json

\- styles.css (if used)



\## Commands

npm run dev       # watch build

npm run build     # production build

npm run lint      # run before every commit — catches ReviewBot issues

