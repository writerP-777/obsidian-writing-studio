# Changelog

All notable changes to Writing Studio are documented here.

---

## [2.6.0]

Consolidated release covering all 15 fix units from the June 2026 full code audit (issues #104–#118, PRs #119–#133). The automated test suite grew from 53 to 105 tests.

### Fixed — critical
- **Project creation data loss:** Creating a project with the same name as an existing one no longer silently overwrites the existing project's `_project.json` and `_binder.json` — it now refuses with a clear error.
- **Mode persistence never worked:** Typography mode and writing mode "persist across restarts" now function — the plugin's own shutdown code was erasing the saved state on every Obsidian exit.
- **Sprint accounting:** Word counts are correct when switching documents mid-sprint, and the "entire project" sprint scope option now actually does something.
- **PDF export:** Uses pandoc's default LaTeX engine as the README documents (previously hardcoded to wkhtmltopdf); pandoc paths containing spaces no longer break exports.
- **Focus mode font size:** The setting existed in the UI and README but was connected to nothing — it now works.

### Fixed — cross-cutting
- **Local dates everywhere:** All "what day is it" logic now uses the local clock instead of UTC. Evening writing sessions in the Americas no longer land on tomorrow's date — streaks, the Today card, and daily-note entries are correct.
- **Errors surface:** Failed vault operations (rename, move, delete) show a notice instead of silently doing nothing.
- **Performance:** The launcher no longer rebuilds itself every ten seconds (dropdowns stay open); searches cannot show stale results; disk-heavy paths use cached reads.
- **Export correctness:** One shared Markdown converter with table and image support across HTML, EPUB, manuscript, and WordPress output; no more empty EPUBs, phantom chapter splits from horizontal rules, or mangled lists and code blocks in WordPress publishing.
- **One word count:** The binder, status bar, folder sidebar tooltip, and manuscript title page now agree on the same word count for the same file.

### Fixed — UI behavior
- Deleting a binder document asks for confirmation before trashing the file and removing the binder entry.
- Binder search finds documents inside collapsed groups and expands them while searching.
- "Insert selection" in the folder sidebar inserts into the most recently active editor, not an arbitrary pane.
- Folder sidebar and compile preview panels survive workspace restore instead of coming back permanently blank.
- Jump-to-section in the compile preview works for non-Latin chapter titles (Chinese, Japanese, Korean, Russian, Arabic).
- The settings help tab no longer leaks a renderer component on tab switch or dialog close.

### Fixed — behavioral minors
- EPUB compression runs off the UI thread — large books no longer freeze Obsidian during export.
- Binder edits made from different views can no longer overwrite each other.
- Duplicating a document keeps its status, word count goal, and export inclusion.
- Numeric settings fields validate input instead of silently coercing junk; live-applied font sizes no longer flash intermediate keystroke values.
- The WordPress publish modal lists all categories on sites with more than 100.
- Renaming a binder item via double-click no longer navigates away on the first click.

### Added
- "Move up" / "Move down" in the binder context menu — a keyboard-accessible alternative to drag-and-drop reordering.
- ARIA listbox/option roles in the folder sidebar for screen readers.
- Manuscript and EPUB options in the default export format setting.
- Empty folder sidebar and compile preview panels offer "Choose folder" / "Load compilation" buttons.

### Changed
- Frontmatter writes go exclusively through Obsidian's `processFrontMatter` API (hand-rolled YAML writer removed).
- In-app help is trimmed to feature content — no more GitHub-only links and images that break inside Obsidian.
- EPUB covers get correct MIME types for `.webp` and `.gif` images.
- Custom typography font names are sanitized before being applied as CSS.

---

## [2.5.2]

### Fixed
- **WordPress settings:** Replaced deprecated `.setWarning()` button API with direct CSS class application (`mod-warning`), resolving an Obsidian community plugin scan error. Visually and functionally identical.

---

## [2.5.1]

### Fixed
- **Export from project views:** Exporting from the Launcher, Compile Preview "Proceed to export" button, or the "Export project" command now correctly defaults to "Entire project" scope. Previously these entry points defaulted to "Current document", which could produce a file containing only the title page when no document was actively focused in the editor. If "Current document" scope is selected with no document open, the export now aborts with a clear notice instead of silently writing a title-page-only file.

---

## [2.5.0]

### Fixed
- **Status bar word count goal:** Goals set via the Targets Dashboard (stored in the binder) now appear correctly in the status bar. Previously the status bar read only from frontmatter, which the Targets Dashboard never writes to, so dashboard-managed goals were invisible in the status bar.
- **Startup stuttering and UI delays:** Rewrote the plugin's startup sequence to suppress `active-leaf-change` handlers until the vault is fully ready, move the project word count bar update out of the hot event path, cache binder reads with a 500 ms TTL, and parallelize project loading. Resolves freezes and stutter on startup regardless of load order.

### Security
- Bumped dev dependency `brace-expansion` 5.0.5 → 5.0.6 (GHSA-jxxr-4gwj-5jf2, DoS via large numeric range). Dev toolchain only — no impact on plugin users.

---

## [2.4.5]

### Added
- **Notebook Navigator integration:** "Open in sidebar explorer" now appears in Notebook Navigator's folder context menus when Notebook Navigator is installed. Uses NN's public menu API (`registerFolderMenu`); completely inert when NN is not installed. Native Obsidian file explorer context menus are unchanged.

---

## [2.4.4]

### Fixed
- **Persistent startup delays and UI freezing under Lazy Plugin Loader:** When other plugins configured with LPL delays loaded after startup, each one triggered an `active-leaf-change` event. With no debounce, every event caused a full Launcher re-render that called `getTotalWordCount()` — which reads every file in the active project from disk sequentially. On a project with many chapters, a burst of plugin-load events saturated the vault I/O queue, freezing the Settings panel and sidebar views for up to 1–2 minutes. Fixed with two changes: (1) `refreshLauncher()` calls from `active-leaf-change` are now debounced with a 300 ms timer, collapsing rapid bursts into a single render; (2) `getTotalWordCount()` caches its result per active project and only re-reads from disk when a file is modified or the binder is saved, making subsequent renders instant.

---

## [2.4.3]

### Fixed
- **Startup delay regression introduced in v2.4.2:** The `window.setTimeout(fn, 0)` wrapper added to the `onLayoutReady` callback caused a noticeable delay on every startup — in normal load the callback is fired from the `layout-ready` event, and `setTimeout(0)` pushed all initialization work to the back of the macro-task queue, behind every other plugin's `layout-ready` handler. Removed the `setTimeout` wrapper; the `async` callback pattern is restored. The Lazy Plugin Loader stale-render fix from v2.4.2 (`refreshLauncher()` in the existing-leaf branch of `openLauncher()`) is unaffected and remains in place.

---

## [2.4.2]

### Fixed
- **Launcher panel stale render under Lazy Plugin Loader (first run):** On the first Obsidian startup after configuring Lazy Plugin Loader, the workspace restore calls `LauncherView.onOpen()` before `projectManager.initialize()` has run, leaving the panel showing "no project selected." `openLauncher()` then found the existing leaf and revealed it without re-rendering, so the stale state persisted whenever `active-leaf-change` did not fire (e.g. the launcher was already the active sidebar leaf). Fixed by calling `refreshLauncher()` in the existing-leaf branch of `openLauncher()`, matching the pattern already used in `openBinder()`.
- **Launcher and Binder fail to open on subsequent Lazy Plugin Loader starts:** On all runs after the first, the plugin loads after LPL's configurable delay, at which point `workspace.onLayoutReady` fires synchronously inside `onload()`. The async callback yielded at `await projectManager.initialize()`, and the microtask continuation called `getLeftLeaf(false)` while empty/placeholder leaves from the previous session were still mid-cleanup in the workspace's leaf management cycle, causing `getLeftLeaf` to return `null` and the panel to silently not open. Fixed by wrapping the `onLayoutReady` body in `window.setTimeout(fn, 0)`, moving execution to the macro-task queue so all pending workspace leaf work completes before a leaf is requested.

---

## [2.4.1]

### Fixed
- **Settings panel blank with Lazy Plugin Loader:** When Writing Studio was loaded via the Lazy Plugin Loader community plugin, the Settings panel rendered blank. The cause was a deferred-initialization incompatibility introduced in v2.4.0. Fixed by ensuring the settings tab registration is robust against delayed plugin startup. Users of Lazy Plugin Loader no longer need to disable it or add Writing Studio to an exclusion list.

---

## [2.4.0]

### Added
- **Sprint timer overlay redesign:** the floating overlay now opens in a ready/paused state. The countdown does not begin until the writer presses ▶ on the overlay itself, giving time to navigate to the draft or open the Binder before the clock starts.
- **Draggable overlay:** the overlay header is now draggable. Click and drag to reposition the overlay anywhere on screen. A ⠿ grip indicator marks the drag target at a glance.
- **Three-state overlay button:** the play/pause button now shows three distinct states — Start (▶, ready state), Resume (▶, paused), and Pause (⏸, running) — each with an accurate tooltip.
- **"Set up sprint" flow in Launcher:** the sprint card now shows a **Set up sprint** button that opens the configuration modal, alongside **Quick sprint options** preset buttons (10 m, 15 m, 25 m). A "Sprint in progress" message replaces the card when a sprint is active.

### Fixed
- **WordPress credentials race condition:** settings-save calls in the Typography Mode module are now properly sequential, closing a startup race that could cause credentials to be discarded on plugin load.
- **Overlay z-index:** the floating overlay now sits above all Obsidian UI layers, modals, and the Focus Mode toolbar.
- Stopping a sprint from ready state (before ▶ is ever pressed) no longer records a session in sprint history.

### Changed
- Sprint modal button renamed from **Start sprint** to **Launch sprint timer** to accurately reflect that clicking opens the overlay in ready state rather than immediately starting the countdown.
- The Launcher sprint card is no longer a duplicate control surface while a sprint is active — the floating overlay is the sole control surface once a sprint is running.

### i18n
- Updated `launcher.startSprint`, `launcher.quickStart`, `launcher.sprintInProgress`, `sprintModal.setupTitle`, `sprintModal.startBtn`, `sprint.startTitle`, `sprint.resumeTitle`, and `sprint.pauseTitle` across all 11 supported locales (Arabic, Bengali, German, Spanish, French, Hindi, Japanese, Korean, Portuguese (Brazil), Russian, Chinese Simplified).

---

## [2.3.2]

### Fixed
- Re-release of 2.3.1 to resolve a stale-tag caching issue that prevented the update from appearing in Obsidian's plugin update checker. No code changes from 2.3.1.

---

## [2.3.1]

### Fixed
- **Folder sidebar explorer:** "Open in sidebar explorer" context menu item on folders now reliably opens the sidebar panel. Previously, the command silently did nothing when the right sidebar was collapsed or empty (`getRightLeaf(false)` returned `null`). Now uses `ensureSideLeaf` (Obsidian 1.7.2+), which always creates or reveals the right sidebar leaf.

---

## [Unreleased]

---

## [2.3.0]

### Added
- **Internationalization (i18n):** all plugin UI strings are now fully translated into 10 languages: English, Chinese (Simplified), Spanish, Arabic, French, Portuguese (Brazil), Russian, Japanese, German, and Korean. Locale is detected automatically from Obsidian's language setting and falls back to English for any unsupported locale.
- `src/i18n.ts` — i18next wrapper with `initI18n()` and `t()` helper
- `src/i18n/` — locale JSON files (~580 keys each)
- Status badges and document type labels in Targets Dashboard and Writing Binder are now translated
- Word-count suffix in Writing Binder adapts per language (e.g., 字, 語, 자, W)
- i18n key-parity test suite (`tests/i18n-parity.test.ts`) — CI catches missing translations automatically

### Changed
- `minAppVersion` bumped from 1.7.2 → 1.8.7 to enable the native `getLanguage()` API for locale detection

---

## [2.2.3]

### Added
- Unit test suite (Jest) covering word count, frontmatter, and binder operations
- Version bump script (`npm run bump -- X.X.X`) for atomic multi-file release preparation

### Changed
- OpenSSF Best Practices badge added to README

---

## [2.2.2]

### Added
- Buy Me a Coffee support button added to the bottom of the **How to use** settings tab
- Plugin logo and Buy Me a Coffee button added to README
- ORCID iD badge added to README Security section

---

## [2.2.1]

### Fixed
- Remove `fs` module from `EpubEngine` — EPUB binary now written via `vault.createBinary` / `vault.modifyBinary`, eliminating the "Direct Filesystem Access" community scorecard warning
- Remove `!important` from `.ws-hidden` in `styles.css` — replaced with `body .ws-hidden` selector for equivalent specificity, eliminating the "Avoid !important" scorecard warning

### Added
- `scripts/fetch-plugin-guidelines.sh` (`npm run fetch:guidelines`) — downloads the current Obsidian plugin guidelines, developer policies, and submission requirements from the official GitHub source into `docs/obsidian-guidelines/`
- `scripts/scorecard-check.sh` (`npm run check:scorecard`) — pre-commit hook that checks source files against the cached guidelines and community scorecard patterns; blocks on regressions, warns on accepted known patterns

---

## [2.2.0]

### Added
- Binder rename now updates the file's YAML `title:` field and renames the `.md` file on disk via `fileManager.renameFile()`, keeping the filename as the single source of truth
- Binder display title now resolves from the live filename on every render, self-healing stale binder JSON silently on first open
- Vault rename event listener repairs binder item paths across all projects when a file is renamed outside the plugin (file explorer, Windows Explorer, etc.)
- `openDocument()` shows a descriptive notice when a binder item's file path no longer resolves, instead of silently doing nothing
- **Add files copied to this folder** toolbar button and command scan the active project folder for `.md` files not yet in the binder and let you select which ones to import via a per-file checkbox modal
- Dashboard project switch now refreshes the binder immediately; `openBinder()` always refreshes on reveal
- README restructured into workflow groups with new opening description, Reporting a Bug section, and updated Commands Reference

### Fixed
- Binder project-switch dropdown no longer leaves the open binder showing stale data from the previous project

---

## [2.1.12]

### Fixed
- Replaced 18 `!important` declarations in `styles.css` with higher-specificity selectors — eliminates 18 community plugin scorecard CSS warnings
  - Typography Mode overrides now use `body.writing-studio-typography` prefix (specificity `0,2,1`), beating theme selectors at `0,2,0` without `!important`
  - Launcher button overrides now use `body .ws-launcher` prefix (specificity `0,1,2`), beating theme `.workspace button` at `0,1,1`

### Changed
- Added GitHub all-releases download count badge to README

---

## [2.1.11]

### Fixed
- Replaced `activeWindow.clearTimeout()`, `activeWindow.clearInterval()`, and `activeWindow.setTimeout()` with `window.*` equivalents across `main.ts`, `src/FrontmatterManager.ts`, `src/LauncherView.ts`, and `src/SprintTimer.ts` — eliminates 10 community plugin scorecard warnings
- Replaced bare `requestAnimationFrame()` with `window.requestAnimationFrame()` in `src/FocusMode.ts`

---

## [2.1.10]

### Changed
- Replaced `jszip` with `fflate` for EPUB export — removes bundled legacy polyfills (IE-era dynamic script creation) that triggered automated security scanner warnings; EPUB output is functionally identical
- Removed `builtin-modules` dev dependency in favour of Node's native `module.builtinModules`

### Fixed
- `MenuItem.onClick` handler signatures updated to accept `MouseEvent | KeyboardEvent` per updated Obsidian API (affects "Switch writing mode" and "Typography font" context menu items)
- TypeScript 6 compiler compatibility: added `ignoreDeprecations: "6.0"`, expanded `lib` to `ES2019`, added explicit `types: ["node"]`
- Reduced `!important` declarations in `styles.css` from 46 to 19 — retained only where Obsidian theme cascade genuinely requires it, with inline comments explaining each case
- Four CSS padding shorthands had a redundant trailing value (e.g. `0 0 24px 0` → `0 0 24px`)
- Two unused template function parameters prefixed with `_` to satisfy ESLint convention

---

## [2.1.9]

### Fixed
- Sentence case on six emoji-prefixed UI labels (mode switcher, binder, sprint timer controls, folder sidebar insert button) to satisfy Obsidian plugin store requirements
- ESLint config (`eslint.config.mjs`) — disabled conflicting `obsidianmd/ui/sentence-case` rule that disagreed with the Obsidian review bot's version of the same rule

---

## [2.1.8]

### Changed
- Version bump only — no functional changes

---

## [2.1.7]

### Added
- Session word count tracking — live `(+N)` delta in the status bar and cumulative total in the Launcher Today card
- Daily Writing Log sidebar panel — streak, session stats, 30-day bar chart
- Manuscript export (HTML) — industry-standard format: Courier New 12 pt, double-spaced, title page, chapter headings
- Writing mode indicator in the status bar — click to switch modes
- Project word count goal — tracked in the status bar and Launcher

### Fixed
- ObsidianReviewBot required and optional issues (sentence case, eslint-disable violations)

---

## [2.1.6]

### Added
- Folder Sidebar Explorer enhancements — breadcrumb navigation, content search, sort options, hover tooltips, audio preview, insert-selection button

---

## [2.1.5]

### Fixed
- ObsidianReviewBot required lint issues

---

## [2.1.4]

### Fixed
- ObsidianReviewBot lint issues (innerHTML, promise handling, type safety)

---

## [2.1.3] — [2.1.1]

### Fixed
- Plugin `id`, `name`, and `description` corrections for community store submission
- Manifest and version file corrections

---

## [2.1.0]

### Added
- Initial release — Focus Mode, Writing Binder, Sprint Timer, Typography Mode, WordPress publishing, Folder Sidebar Explorer, Export Engine (PDF, DOCX, RTF, HTML, EPUB), Compile Preview, Project Manager, Writing Dashboard, Targets Dashboard, Word Count Goal, Frontmatter Manager
