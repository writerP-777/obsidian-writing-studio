# Changelog

All notable changes to Writing Studio are documented here.

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
