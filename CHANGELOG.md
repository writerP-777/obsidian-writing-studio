# Changelog

All notable changes to Writing Studio are documented here.

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
