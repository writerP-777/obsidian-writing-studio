# ADR 0001 — Filesystem-owned binder

- **Status:** Accepted (2026-07-03) — not yet implemented
- **Deciders:** Don Pucik, with design interviews by Claude Code and independent review by Claude Cowork
- **Supersedes:** the `_binder.json` runtime model (in effect through 2.11.0)

## Context

Through 2.11.0 the binder keeps its own ordered, hierarchical copy of project membership in
`_binder.json`, keyed by file path. Every synchronization bug in the plugin's history traces to
that copy drifting from disk reality. The breaking case: Windows Explorer renames reach plugins
as CREATE+DELETE pairs with no rename event (console-proven 2026-07-02), so event-based path
repair can never cover external changes (#219).

Two hard gates were set for any redesign: **(1)** existing projects must migrate with zero risk
to users' vaults; **(2)** manuscript order must survive changes made outside the plugin. The
full design was resolved in an eight-area interview (2026-07-03); both gates closed.

## Decision

**The binder is a live rendering of the project folder tree.** The filesystem owns membership
and hierarchy; order and per-document metadata travel inside what they describe; the plugin
holds no hidden structural state. `_binder.json` is not consulted at runtime.

### Structure

- Binder drag, promote, and demote physically move files and folders via
  `fileManager.renameFile()` (links auto-heal). Dragging a folder carries its children because
  that is what a filesystem move is.
- Containers are pure folders with no text of their own. A part's introduction is an ordinary
  document ordered first inside it. Documents cannot contain documents; demote is only valid
  relative to a folder. The group/part distinction is dropped — there are only folders.
- Externally added, moved, renamed, or deleted files are automatically correct in the binder.
  The folder-scan command and Add-to-project modal become unnecessary and are removed.

### Order

- **Documents:** integer `binder-order` frontmatter key, written via `processFrontMatter`.
  Document filenames are never touched for ordering; the plugin never mints filenames
  containing position numbers (scaffolds use position-neutral names).
- **Folders:** numeric name prefix (`020 Part One`), stripped in binder display; on-disk name
  shown on hover.
- One number line per sibling group (a document's `binder-order: 15` sorts before a folder
  prefixed `020`). Ties: natural display-name comparison, then documents before folders.
- Base order is natural sort (numeric-aware). Values are written lazily — only on reorder —
  in gaps of 10, midpoint insertion, renumbering a sibling group only when its gaps exhaust.
- Unordered items (including externally dropped files) place at end-of-group, after ordered
  siblings; folders never reordered remain pure natural sort.
- Guarantees: order survives external renames/moves including Windows CREATE+DELETE pairs
  (it travels in the file/name); external copies sort adjacent to their original (duplicate
  values are benign ties); no central order file exists whose loss or sync conflict can
  scramble a project. The one soft edge: an external folder rename that deliberately strips
  the prefix falls back visibly to natural sort; contents are unharmed.

Rejected alternatives: document filename prefixes (visible numbers in tab headers and inline
titles — vetoed); a stable-ID-per-document plus ID-keyed order overlay (a central mutable
state file recreates the `_binder.json` failure class: sync-conflict scramble, no folder
coverage, ID collisions on copy); any path-keyed sidecar (the original failure mode).

### Per-document metadata

Frontmatter, edited from the context menu: `binder-status` (draft / in-progress / complete /
published), `word-count-goal` (existing key — now the sole authority; the former
binder-item-first dual-source invariant is dissolved), optional `binder-type` (icon and menu
only; export never reads type). The separate binder title is removed: the filename is the
title, and renaming in the binder renames the file.

### Zones

Two zones in the binder: the manuscript tree above; **Research** and **Exports** pinned below
as drawer tabs. Research keeps its name (Scrivener convention; zero migration) and is two-way
for `.md` files. Exports is output-only — files land there via the export engine. Non-markdown
files are visible and openable but never promotable into the manuscript. The right-side view
is always called the *folder sidebar*, never "research".

### Export

Compile = the manuscript zone, depth-first, in binder order; the zone boundary is the compile
boundary. Existing `addTitlePage` and `includeTitlesAsHeadings` options carry over (title =
basename). New default-off option "Include folder names as headings" (today's compile skips
structural items, so default-off keeps existing output identical). Per-document exclusion via
`binder-compile: false` (context menu; rendered dimmed). Right-click a folder → subtree export.

### Migration (gate 1 mechanism)

Upgrading migrates zero bytes; the binder renders disk truth immediately, `_binder.json`
dormant. Per project with a differing legacy binder: a one-time non-blocking notice —
**Preview / Carry over / Not now** — where Preview is a dry run listing every planned
operation. The pass:

1. Create real folders for legacy groups/parts.
2. **One atomic `renameFile` per item, original → final** (move + rename-to-title + prefix in
   a single operation; no intermediate location exists).
3. Idempotent frontmatter writes (`binder-order`, `binder-status`, `word-count-goal`,
   `binder-type`).

The plan — including collision suffixes, resolved by legacy binder order — is a pure function
of the immutable `_binder.json`, so every run computes identical targets. Re-run
classification: file at original path = pending; at final path = done; at neither = surfaced
as an anomaly, never guessed. Resumability therefore needs no journal or checkpoint state.
`_binder.json` is never deleted (rollback/re-seed source; downgrade is best-effort). No
rollback engine: safety = opt-in + full preview + content-preserving operation classes. No
migration code path can alter document prose.

### UI

Prototype variant C ("compact outliner", Don's selection 2026-07-03): dense single-line rows;
status as a colored left-edge stripe; folder count badges under a single `#` toggle (default
on); no order gutter; no per-row type icons; no in-row goal progress (tooltip, targets
dashboard, and the inline goal banner carry it); hover tooltip shows the on-disk name and
frontmatter via `setTooltip`. Control strip, project row, search, and the #143 keyboard
navigation carry over unchanged; toolbar = New document / New folder / Targets dashboard.
Drag affordances: between-line indicator, folder highlight, hover-to-expand. Drawer open
state persists per project (view preference, not manuscript state).

## Consequences

- Dies with this ADR: `_binder.json` at runtime; the scan button, scan command, and
  Add-to-project modal; group/part item types; separate binder titles; the path-keyed drift
  bug class — **#219 closes as dissolved**.
- Position numbers users place inside their own filenames ("Chapter 2") can go stale after a
  reorder; the designated mitigation is compile-time chapter numbering (deferred, own issue).
- Deferred, non-blocking: compile-time chapter numbering; keyboard promote/demote
  (Ctrl+arrows); folder-note support if ever wanted.
- Sequencing: 2.11.0 shipped before any of this lands (done 2026-07-03). Build proceeds as
  tracer-bullet issues — read-only tree render, then gestures, then migration, then export —
  each under the acceptance-criteria protocol.
