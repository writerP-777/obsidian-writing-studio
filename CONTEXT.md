# Writing Studio — Context

An Obsidian community plugin that turns the vault into a professional writing environment.
Inspired by Scrivener's project/binder model but lives entirely inside Obsidian.
Desktop-only (`isDesktopOnly: true`). Plugin ID: `writing-studio`, current version: `3.0.1`.

---

## Architecture overview

The plugin is a single `WritingStudioPlugin` class (`main.ts`) that owns all module
instances and wires them together. Modules are plain TypeScript classes that receive the
plugin instance in their constructor and access `plugin.app` and `plugin.settings` from it.

```
main.ts                    ← plugin entry point; commands, ribbon, event bus, status bar
src/
  ProjectManager.ts        ← project CRUD (_project.json), template scaffolding
  FilesystemBinderView.ts  ← the binder: live rendering of the project folder tree (ItemView)
  binderOrder.ts           ← pure order engine: binder-order + folder name markers, natural sort
  binderMove.ts            ← pure drag/drop planner: regions, zone rules, atomic move plans
  binderMenu.ts            ← pure context-menu engine: actions, rename targets, name validation
  manuscriptTree.ts        ← manuscript-zone walker + compile planner (one tree for all surfaces)
  carryOver.ts             ← pure migration/restore engine over the legacy _binder.json
  carryOverBridge.ts       ← vault-facing migration/restore glue; failure ledger; update notice
  exportTitle.ts           ← pure export-title resolution (title dropdown, #260)
  folderRename.ts          ← path helpers + document-folder name validation
  FocusMode.ts             ← CM6 ViewPlugin; paragraph/sentence focus + typewriter scroll
  TypographyMode.ts        ← CSS-injection typography environment
  WritingModes.ts          ← preset orchestrator: draft / edit / review / none
  SprintTimer.ts           ← timed writing session engine
  StatsTracker.ts          ← per-file word counts, session deltas, sprint history
  FrontmatterManager.ts    ← debounced frontmatter auto-update (word-count, modified)
  ExportEngine.ts          ← md / html / docx / rtf / pdf via pandoc; compiles the manuscript zone
  EpubEngine.ts            ← epub export
  CompilePreview.ts        ← read-only compiled-manuscript view (split pane); renders the export dialog's selections
  LauncherView.ts          ← hub panel (left sidebar); entry point for all features
  WordPressClient.ts       ← WordPress REST API multi-site publishing
  WritingLogView.ts        ← daily writing-activity log sidebar view
  FolderSidebarView.ts     ← focused folder explorer sidebar view
  HelpContent.ts           ← in-plugin help text
  SettingsTab.ts           ← tabbed settings UI
models/
  Project.ts               ← WritingProject, ProjectType, ProjectGoals
  BinderItem.ts            ← BinderItem, BinderData, DocumentStatus
  WritingMode.ts           ← WritingModeType, WritingModeConfig, WRITING_MODE_CONFIGS
  SprintSession.ts         ← SprintSession (completed sprint record)
  WordPressSite.ts         ← WordPressSite (url, credentials)
modals/
  BinderUpdateModal.ts     ← one-time "binder and folders now stay in sync" notice (#233)
  ProjectModal.ts          ← create / edit a writing project
  SprintModal.ts           ← configure and launch a sprint
  ExportModal.ts           ← export a document or project
  PublishModal.ts          ← publish current file to WordPress
  TargetsDashboardModal.ts ← manage per-document word count goals
  WritingDashboardModal.ts ← view session stats and sprint history
templates/
  BookTemplate.ts          ← folder/document scaffold for book projects
  ArticleSeriesTemplate.ts ← scaffold for article series
  BlogCollectionTemplate.ts← scaffold for blog collections
  JournalArticleTemplate.ts
  MagazineArticleTemplate.ts
```

---

## Glossary

Use these exact terms everywhere — issues, commit messages, comments, PR descriptions.

### Core entities

**Writing project** (`WritingProject`)
A named authoring endeavour stored as a folder inside `defaultProjectFolder`.
Persisted as `_project.json` in the project folder.
Has a `type` (see below), `goals`, `author`, and optional WordPress binding.
Prefer: *writing project* or *project*. Avoid: *workspace*, *document set*.

**Project type** (`ProjectType`)
The kind of writing a project represents: `book`, `series`, `blog`, `journal-article`, `magazine-article`, or `blank`.
Each non-blank type scaffolds an opinionated folder and document structure via a template.
Each non-blank type also declares a **default document type** for documents created or added after
scaffolding: book → `chapter`, series → `article`, blog → `article`, journal-article → `section`,
magazine-article → `section`. The project type's declared default wins; the global
`defaultDocumentType` setting is the fallback used only for `blank` projects (which have no template).

**Binder** (`FilesystemBinderView`)
A live rendering of the active project's folder tree (ADR 0001, implemented at #233):
the filesystem owns membership, hierarchy, and — via `binder-order` frontmatter and folder
name markers — order. There is no runtime binder store; `_binder.json` files remain on disk
untouched as the dormant carry-over/restore source. Rendered in the left sidebar.
Prefer: *binder*. Avoid: *outline*, *table of contents*, *file list*.

**Binder item** (`BinderItem`) — *legacy model*
One entry in a legacy `_binder.json`, kept only so migration/restore can parse the file
(types include the retired structural `group`/`part`). Nothing else reads or writes it.
Prefer: *legacy binder item*.

**Document status** (`DocumentStatus`)
The lifecycle state of a binder item: `draft` → `in-progress` → `complete` → `published`.

**Project goals** (`ProjectGoals`)
Project-level targets: `totalWordCount`, `dailyWordCount`, `deadline`.
Distinct from per-document word count goals, which live on individual binder items.

### Views and panels

**Launcher** (`LauncherView`, view type `writing-studio-launcher`)
The hub panel in the left sidebar. Opens on startup (configurable). Entry point for all plugin features.
Prefer: *launcher* or *launcher panel*. Avoid: *home*, *dashboard* (reserved for modals).

**Binder view** (`FilesystemBinderView`, view type `writing-studio-binder`)
The Scrivener-style left-sidebar panel rendering the active project's folder tree.
Prefer: *binder view* or just *binder*. Avoid: *sidebar*, *panel* (too generic).

**Compile preview** (`CompilePreviewView`, view type `writing-studio-compile`)
A split-pane read-only view that renders exactly what the export dialog's current
selections would produce — same documents, headings, title page, and title (#260).
Prefer: *compile preview*. Avoid: *preview pane*, *manuscript view*.

**Writing log** (`WritingLogView`, view type `writing-studio-log`)
A left-sidebar view showing daily writing-activity records.

**Folder sidebar** (`FolderSidebarView`, view type `writing-studio-folder-sidebar`)
A right-sidebar view scoped to a single vault folder. Opened via file-menu or command.

### Filesystem binder terms (ADR 0001, implemented at #233)

Use these exact terms in issues, PRs, and code.

**Manuscript zone**
The upper binder zone: the project folder tree minus Research and Exports. Its depth-first
binder order is the compile order — the zone boundary is the compile boundary.
Prefer: *manuscript zone*. Avoid: *outline area*, *main list*.

**Resources zone** / **drawer**
The lower binder zone: Research and Exports pinned as drawer tabs with document counts.
Research is two-way for `.md` files; Exports is output-only (written by the export engine).
Non-markdown files are visible and openable but never promotable into the manuscript.

**`binder-order`**
Integer frontmatter key holding a document's position among its siblings. Written lazily on
reorder (gaps of 10, midpoint insertion). Folders carry order as a tilde-delimited name
marker (`020~ Part One`) instead, stripped in binder display; strict parse — a typed name
without the `NNN~ ` marker (`2023 files`, `020 Part One`) is a plain name, shown in full and
never rewritten. Anything without a value natural-sorts at the end of its group.
Prefer: *order* / *binder-order* / *order marker*. Avoid: *rank*, *index*, *sort key*.

**`binder-status`**, **`binder-type`**, **`binder-compile`**
Frontmatter homes for per-document metadata: lifecycle status (values unchanged), optional
document type (icon/menu only), and `binder-compile: false` to exclude a document from
compile (rendered dimmed). `word-count-goal` (existing key) becomes the sole goal authority.
The separate binder title is removed — the filename is the title.

**Carry-over** / **silent migration**
The per-project migration from a legacy `_binder.json`, run silently on project activation
(amended 2026-07-06, #231 — no preview, no notice, no consent gate): legacy groups/parts
become real folders (created with markers, or matched by name — a matched plain folder gets
its marker attached in place), documents move in **keeping their filenames** (never renamed
to a stored title; a same-basename collision leaves the later document in place, ordered in
its actual folder), and metadata lands write-if-absent in frontmatter. Every target derives
deterministically from the immutable legacy file; interruption recovers by re-running.
`_binder.json` is never deleted or modified. The inverse is **Restore previous binder
layout** — layout-only (frontmatter persists; never framed as a full revert), stateless,
never deletes, and **restore sticks** (#233): it writes `binderLayoutRestored` into
`_project.json` (travels with the vault) and migration skips flagged projects permanently;
no path re-applies the arrangement. A one-time notice (`BinderUpdateModal`) shows once per
vault, immediately after the first migration that actually performs work — informational,
never a consent gate. UI copy never says *carry-over* or *migration* (failure notices name
files, not concepts). Avoid: *import*, *conversion*.

### Writing environment modes

**Focus mode** (`FocusMode`)
A CM6 `ViewPlugin` that dims all text outside the active paragraph or sentence.
Includes optional typewriter scroll (keeps active line vertically centred).
Activated per-editor; persists across leaf changes while enabled.
Prefer: *focus mode*. Avoid: *distraction-free*, *zen mode*.

**Typography mode** (`TypographyMode`)
A CSS-injection layer that applies a typographic reading/writing environment:
font family, line length (`maxLineLength` chars), line height, letter spacing.
Can be made persistent across sessions via `persistTypography`.
Prefer: *typography mode*. Avoid: *reading mode* (clashes with Obsidian's built-in concept).

**Writing mode** (`WritingModeType`)
A named preset that orchestrates focus mode, typography mode, binder visibility, and sidebar state.
Values: `draft` (focus + typography, sidebars hidden), `edit` (binder open, sidebars visible),
`review` (reading view, no sidebars), `none` (plain Obsidian defaults).
Prefer: *writing mode*, *draft mode*, *edit mode*, *review mode*. Avoid: *scene*, *view mode*.

### Sprint and stats

**Sprint** / **Writing sprint** (`SprintTimer`, `SprintModal`)
A timed writing session with a configurable duration and optional word count goal.
The timer is floating UI managed by `SprintTimer`.
Prefer: *sprint* or *writing sprint*. Avoid: *timer*, *session* (ambiguous — see sprint session).

**Sprint session** (`SprintSession`)
The recorded result of a completed sprint: `wordsWritten`, `duration`, optional `wordCountGoal`.
Stored in `StatsTracker`'s sprint history.
Prefer: *sprint session*. Avoid: *sprint record*, *session* alone.

**Stats tracker** (`StatsTracker`)
Tracks per-file word counts at session start (baseline), live word counts, and session deltas.
Also stores sprint history and provides daily/total word-count aggregates.

**Session delta**
The net word-count change for a file since the plugin loaded this vault session.
Displayed as `(+N)` in the status bar. Resets on reload.

### Goals and targets

**Word count goal** (per document)
The target word count for a single document. Sole source: the frontmatter field
`word-count-goal` (#229, ungated at #233). The **targets dashboard** is the UI for
managing these.
Prefer: *word count goal*. Avoid: *target*, *quota*, *goal* alone (ambiguous with project goals).

**Inline goal banner**
A progress bar injected between the editor toolbar and the document content area when a file
has a word count goal. Dismissed per-session via a close button.

**Targets dashboard** (`TargetsDashboardModal`)
A modal for viewing and setting word count goals across all binder items in the active project.

**Writing dashboard** (`WritingDashboardModal`)
A modal for viewing session stats, sprint history, and word-count trends.

### Export and publishing

**Export engine** (`ExportEngine`)
Handles single-document and full-project export to `md`, `html`, `docx`, `rtf`, `pdf`.
PDF/docx/rtf require `pandoc` on PATH (configurable). The PDF engine is selectable
(`pdfEngine` setting): `auto` (default) picks an installed LaTeX engine to match the
requested font; a pinned engine (`xelatex`/`lualatex`/`pdflatex`/`wkhtmltopdf`) is strict —
missing means the export fails by name, never a silent substitute. `wkhtmltopdf` is the
non-LaTeX path and ignores the export font (typography comes from HTML/CSS).

**Epub engine** (`EpubEngine`)
Handles epub export separately from the main export engine.

**Compile** / **compiled manuscript**
The manuscript zone depth-first in binder order — the zone boundary is the compile
boundary — used for both the compile preview and multi-document exports.
Prefer: *compile* or *compiled manuscript*. Avoid: *merge*, *join*.

**WordPress client** (`WordPressClient`)
REST API client for publishing the current document to one or more configured WordPress sites.
Supports wikilink handling (`strip` | `convert`) before publishing.

### Frontmatter fields

These are the frontmatter keys the plugin reads or writes:

| Field | Written by | Read by |
|---|---|---|
| `word-count` | `FrontmatterManager` | — |
| `modified` | `FrontmatterManager` | — |
| `word-count-goal` | goal modal, targets dashboard, migration | goal banner, status bar, targets dashboard, binder tooltip |
| `binder-order` | binder reorder, scaffolding, migration | binder sort, compile order |
| `binder-status` | binder context menu, scaffolding, migration | binder status stripe, targets dashboard |
| `binder-type` | binder context menu, scaffolding, migration | binder tooltip, targets dashboard |
| `binder-compile` | binder context menu, scaffolding, migration | compile/export exclusion, dimmed rows |

---

## Key invariants

1. **Frontmatter `word-count-goal` is the sole goal authority.** Every surface (goal
   modal, banner, status bar, targets dashboard) reads and writes it directly. Nothing
   reads a goal from anywhere else.

2. **All file paths go through `normalizePath()`.** No raw string concatenation for paths.

3. **No `innerHTML` / `outerHTML` / `insertAdjacentHTML`.** Use Obsidian DOM helpers
   (`createEl`, `createDiv`, `createSpan`) or the native DOM API.

4. **All `Promise`s are awaited or handled.** Floating promises are a ReviewBot violation.

5. **Styles via CSS only.** No `element.style.*` assignments; use `addClass` / CSS variables
   (`setCssProps`) for dynamic values.

6. **`onunload()` does not detach leaves.** Modules that own DOM/CM6 resources call their
   own `destroy()` methods instead.

7. **Status bar items are append-only.** Order: mode indicator → word count → sprint timer → project goal bar.
