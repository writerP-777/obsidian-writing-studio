# Obsidian Writing Studio

**Version 2.1.10** · Desktop only

Transform Obsidian into a professional writing environment. Writing Studio bundles a project binder, writing sprints, focus and typography modes, session word count tracking, manuscript export, WordPress publishing, a daily writing log, and a folder sidebar explorer into a single plugin.

---

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](../../releases/latest).
2. Create the folder `<vault>/.obsidian/plugins/obsidian-writing-studio/` if it does not exist.
3. Copy the three files into that folder.
4. In Obsidian, go to **Settings → Community Plugins**, find **Writing Studio**, and enable it.

> **Building from source:** Clone the repository, run `npm install`, then `npm run build`. Copy the three output files as above.

---

## Security

[![CodeQL](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/codeql.yml/badge.svg)](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/writerP-777/obsidian-writing-studio/badge)](https://securityscorecards.dev/viewer/?uri=github.com/writerP-777/obsidian-writing-studio)
[![OpenSSF Baseline](https://www.bestpractices.dev/projects/12832/baseline)](https://www.bestpractices.dev/projects/12832)
[![ESLint](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/eslint.yml/badge.svg)](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/eslint.yml)

Every push and pull request is scanned automatically:

| Tool | What it checks |
|------|----------------|
| **CodeQL** | Static analysis for security vulnerabilities (XSS, injection, unsafe patterns) in TypeScript/JavaScript source |
| **OpenSSF Scorecard** | Supply-chain security posture: dependency hygiene, branch protection, signed releases, and more |
| **ESLint** (`eslint-plugin-obsidianmd`) | Obsidian plugin guideline compliance — fails on any warning or error |

Results are published to the **Security** tab of this repository (GitHub code scanning).

For local development, a pre-commit hook runs ESLint (blocking) and a pre-push hook runs a full CodeQL scan (blocks the push if any HIGH or CRITICAL findings are present). Install the [CodeQL CLI](https://github.com/github/codeql-cli-binaries/releases) to enable local scanning (`winget install GitHub.CodeQL` on Windows).

---

## Features

### Writing Studio Launcher

The Launcher is a left-sidebar dashboard that shows your active project, word count and goal progress, writing mode controls, sprint timer, today's writing stats, and quick-action buttons for the most common Writing Studio tasks.

By default it opens automatically when Obsidian loads. To disable this, turn off **Open on startup** in **Settings → General**.

**To open manually:** Click the feather ribbon icon, or assign a hotkey to **Open launcher** in Settings → Hotkeys.

**The Launcher includes:**
- Active project name, total word count, and progress toward your project word count goal
- Writing mode selector (Draft / Edit / Review)
- Focus Mode and Typography Mode toggles
- Sprint timer with quick-start presets (10 m, 15 m, 25 m)
- Today card showing words written, sprints completed, session word count, and streak
- Quick-action buttons: Targets Dashboard, Writing Dashboard, Preview manuscript, Export, Writing Log, Publish to WordPress

---

### Writing Binder

The Binder is a left-sidebar project panel that lists all documents in your active writing project. Each document shows its title, type (Chapter, Section, Article, Note), status (Draft, In Progress, Complete), and live word count. Documents can be reordered by drag-and-drop and toggled in or out of export.

**To open:** Use the command **Open binder** from the command palette, or assign a hotkey in Settings → Hotkeys.

**Adding a file to a project:**
1. Right-click any Markdown file in the file explorer and choose **Add to writing project** under **Writing studio options**.
2. A modal appears with a dropdown listing all your writing projects.
3. Select the target project and click **Add to project**.

---

### Writing Modes

Three modes shape how the editor behaves. The current mode is always shown in the status bar. Click the mode pill in the status bar to switch modes.

| Mode | Purpose |
|------|---------|
| **Draft** | Distraction-free drafting; spell-check and formatting hints suppressed |
| **Edit** | Revision pass; full editor tooling active |
| **Review** | Read-only style; ideal for a final proofread |
| **None** | Normal Obsidian behavior |

**To switch modes:**
- Click the mode indicator in the status bar.
- Right-click inside the editor, then choose **Switch writing mode →** under **Writing studio options**.
- Assign hotkeys to **Switch to draft mode / Edit mode / Review mode** in Settings → Hotkeys.
- Use the Writing Studio Launcher panel.

The active mode persists across Obsidian restarts.

---

### Focus Mode

Focus Mode dims everything in the editor except the paragraph or sentence you are currently writing, reducing visual noise and keeping attention on the active thought.

**To toggle:** Assign a hotkey to **Toggle focus mode** in Settings → Hotkeys, or use the toggle in the Launcher panel. Press `Escape` to exit.

**Settings (Settings → Focus mode):**

| Setting | Description |
|---------|-------------|
| Focus unit | Highlight at the **paragraph** or **sentence (line)** level |
| Dim opacity | How opaque the dimmed text appears (10–50%) |
| Font size override | Override the editor font size while focused; 0 = use theme default |
| Auto-hide sidebars | Collapse left and right sidebars when Focus Mode activates |
| Typewriter scroll | Keep the active line vertically centered as you type |

---

### Typography Mode

Typography Mode applies a consistent, reader-friendly text treatment to the editor: a curated font, constrained line length, controlled line height, and optional letter spacing.

**To toggle:** Assign a hotkey to **Toggle typography mode** in Settings → Hotkeys, or use the toggle in the Launcher panel.

**To change the font while Typography Mode is active:** Right-click inside the editor and choose **Typography font →** under **Writing studio options**. A font picker menu appears with all available fonts; the active font is shown with a checkmark. Selecting a font applies it immediately and saves the setting.

> **Note on fonts:** Typography fonts are loaded from Google Fonts and require an internet connection the first time each font is used. After the initial load they are cached and work offline.

**Settings (Settings → Typography):**

| Setting | Description |
|---------|-------------|
| Font family | Choose from the curated font list or enter a custom font name |
| Custom font name | Used when **Custom font name…** is selected above |
| Max line length | Characters per line (55–80); constrains the editor column width |
| Font size | Editor font size in pixels |
| Line height | Multiplier; default 1.7 |
| Letter spacing | CSS `letter-spacing` value (e.g. `normal`, `0.02em`) |
| Persist across sessions | Keep Typography Mode active when Obsidian reopens |

**Available fonts:**

| Option | Font |
|--------|------|
| Monospaced | iA Writer Mono (falls back to Roboto Mono / Courier New) |
| Serif | iA Writer Duo Serif (falls back to Georgia) |
| Sans-serif | iA Writer Quattro (falls back to system sans-serif) |
| Cormorant Garamond | Elegant display serif |
| Crimson Text | Classic book serif |
| EB Garamond | Traditional Garamond revival |
| Libre Baskerville | Readable web serif |
| Libre Caslon Text | Clean slab serif |
| Literata | Designed for long-form reading |
| Lora | Contemporary calligraphic serif |
| Inter | Modern humanist sans-serif |
| Lato | Friendly rounded sans-serif |
| Source Sans 3 | Clean UI sans-serif |
| Custom font name… | Use any font installed on your system |

---

### Writing Sprint Timer

The Sprint Timer runs a timed writing session. A countdown appears in the status bar and in a floating overlay. When the sprint ends, a summary modal shows words written, duration, and words-per-minute. The session is logged to sprint history and optionally appended to your Daily Note.

**To start a sprint:** Use the command **Start writing sprint** from the command palette, assign a hotkey in Settings → Hotkeys, or use the sprint quick-start buttons in the Launcher panel.

The sprint modal lets you set:
- Duration (preset or custom, in minutes)
- Word count goal for the session
- Scope (current file or entire project)

**Settings (Settings → Sprint & goals):**

| Setting | Description |
|---------|-------------|
| Default sprint duration | Starting value in the sprint modal (minutes) |
| Default daily word goal | Target used in the Writing Dashboard and Launcher |
| Sound notifications | Play a tone when the sprint ends |
| Sprint history retention | Days to keep sprint records before purging |
| Inline goal banner | Show a progress bar below the editor toolbar when a document has a word count goal set |

---

### Word Count Goal

A per-document word count goal can be set and tracked inline.

**To set a goal:**
- Use the command **Set word count goal** from the command palette.
- Right-click inside the editor and choose **Set word count goal** under **Writing studio options**.

When a goal is set and **Inline goal banner** is enabled, a progress bar appears below the editor toolbar showing current words, goal, and percentage. It updates in real time as you type.

---

### Session Word Count

The status bar shows a `(+N)` delta next to the current file's word count, indicating how many words you have added since opening that file this session. The Launcher's **Today** card also shows a cumulative session total across all files opened during the current Obsidian session. Both counts reset when Obsidian restarts.

---

### Project Word Count Goal

When an active project has a total word count goal set, a dedicated status bar item shows `{current} / {goal} project words`. This updates automatically as you write. Set a project goal in the Project modal when creating or editing a project.

---

### Writing Dashboard

The Writing Dashboard shows session statistics (words written, sprints completed, time), sprint history, daily progress toward your goal, and per-project word counts with reading time.

**To open:** Use the command **Open writing dashboard** from the command palette, or click the **Writing dashboard** button in the Launcher panel.

---

### Targets Dashboard

The Targets Dashboard lets you assign word count goals to individual documents in the active project's binder and track progress across the whole project at a glance. Goals can be edited inline in the table. Rows are sortable and filterable by status.

**To open:** Use the command **Open targets dashboard**, click the **Targets dashboard** button in the Launcher panel, or assign a hotkey in Settings → Hotkeys.

---

### Daily Writing Log

The Writing Log is a sidebar panel that shows your writing history at a glance.

**To open:** Use the command **Open writing log** from the command palette, or click the **Writing log** button in the Launcher panel.

**The Writing Log shows:**
- Current streak (days in a row with at least one sprint)
- This session: total session words, sprint words, sprints completed, and minutes written
- Last 30 days: a bar chart with one row per day showing word count, sprints completed, and a visual bar proportional to the day's output

When **Append to daily note** is enabled (Settings → Writing log), a summary of each completed sprint is also appended to today's Daily Note.

---

### Project Manager

Projects group a set of documents (binder items) and act as the scope for export, statistics, and the word count goal banner.

**To create a project:** Use the command **New writing project** from the command palette, or click **+ New** in the Launcher panel.

**To switch projects:** Use the Launcher panel or the project selector at the top of the Binder panel.

Each project stores:
- Title, type, author, and description
- Ordered binder with chapters, sections, articles, and notes
- Per-item word count goals, statuses, and export flags
- Optional total word count goal (shown in the Launcher and status bar)

**Project templates available at creation:**

| Template | Structure created |
|----------|------------------|
| Blank | Empty — build your own structure |
| Book | Front Matter, Part 1 / Chapter 1, Back Matter |
| Article series | Series folder, Article 1 placeholder, series metadata |
| Blog collection | Date-organized folder, first post placeholder |
| Journal article | Title Page, Abstract, Keywords, Introduction, Literature Review, Methodology, Findings / Analysis, Discussion, Conclusion, References, Appendices |
| Magazine article | Pitch / Query Notes, Headline & Deck, Lede, Nut Graf, Body, Quotes & Sources, Kicker, Fact-Check Notes, Author Bio |

---

### Compile Preview

The Compile Preview opens a split pane showing all binder documents for the active project concatenated in order, rendered as a finished manuscript.

**To open:** Use the command **Preview compiled manuscript** from the command palette, or click the **Preview manuscript** button in the Launcher panel.

---

### Export Engine

The Export Engine converts the current document or the active project's compiled manuscript to a finished file.

**Supported formats:** Manuscript (HTML) · PDF · Word (.docx) · RTF · HTML · Markdown · EPUB

**To export:**
- Right-click inside the editor and choose **Export this document** under **Writing studio options**.
- Use the command **Export document** from the command palette.
- Click the **Export** button in the Launcher panel.
- Assign a hotkey to **Export document** in Settings → Hotkeys.

**Manuscript format**

The Manuscript format produces a self-contained HTML file formatted to industry-standard manuscript conventions:
- Courier New 12 pt, double-spaced, 1-inch margins
- Title page with project title, author name, approximate word count, and optional contact information
- Chapter headings in uppercase, page-break before each
- Scene breaks rendered as `· · ·`

No external tools are required for manuscript export.

**Settings (Settings → Export):**

| Setting | Description |
|---------|-------------|
| Default export format | Pre-selected format in the export modal |
| Default paper size | Letter (US) or A4 |
| Export font | Font name used in PDF/DOCX output (e.g. `Georgia`) |
| Export font size | Point size for PDF/DOCX output |
| Pandoc path | Full path to the `pandoc` binary if it is not on your system PATH |
| EPUB language | BCP 47 language tag (e.g. `en`, `fr`, `de`) |
| EPUB include cover | Generate a text cover page when no cover image is provided |

> **Requirement:** Pandoc must be installed for PDF, DOCX, RTF, HTML, and EPUB export. Download from [pandoc.org](https://pandoc.org/installing.html). For PDF export, a LaTeX distribution (e.g. TeX Live or MiKTeX) is also required. Manuscript (HTML) export does not require Pandoc.

---

### WordPress Publishing

Publish the current Markdown file directly to one or more WordPress sites using the WordPress REST API. The modal lets you choose the target site, set the post title, status, categories, tags, excerpt, and an optional scheduled publication date.

**To publish:**
- Right-click inside the editor and choose **Publish to WordPress** under **Writing studio options**.
- Use the command **Publish to wordpress** from the command palette.
- Click the **Publish to WordPress** button in the Launcher panel.
- Assign a hotkey to **Publish to wordpress** in Settings → Hotkeys.

**Setting up a site (Settings → WordPress):**

1. Click **+ add WordPress site**.
2. Enter a nickname, the site URL (e.g. `https://yourblog.com`), and your WordPress username.
3. Generate an application password in WordPress under **Users → Profile → Application passwords** and paste it into the **Application password** field.
4. Click **Test connection** to verify.

**Per-site options:**

| Setting | Description |
|---------|-------------|
| Default post status | Draft · Pending Review · Published |
| Wikilink handling | **Strip** removes `[[...]]` syntax, leaving plain text · **Convert** turns wikilinks into URLs |

---

### Folder Sidebar Explorer

The Folder Sidebar Explorer opens a navigable folder tree in a sidebar panel. You can browse subfolders, search by name or file content, sort the listing, preview files inline, and insert copied text directly into the active editor.

**To open:**
- Use the command **Open folder in sidebar explorer** from the command palette.
- Right-click any folder in the file explorer and choose **Open in sidebar explorer** under **Writing studio options**.
- Assign a hotkey in Settings → Hotkeys.

**Browsing and navigation:**

| Feature | How to use |
|---------|-----------|
| Browse into a subfolder | Click the folder |
| Preview a Markdown file | Click the file — renders inline |
| Preview an image | Click the file — displayed inline |
| Preview audio | Click the file — player appears inline |
| Other file types | Click the file — an **Open in editor** button appears |
| Go back | Click **← back**, or press `Backspace` when the list has keyboard focus |
| Return to root folder | Click **⌂ root** |
| Keyboard navigation | Tab to focus the list, then `↑` / `↓` to move, `Enter` to open, `Backspace` to go back |
| Breadcrumb navigation | Click any segment in the breadcrumb trail to jump directly to that folder |

**Search:**

A search bar appears at the top of the folder list. Type your query and press **Enter** to run the search.

- Searches **both folder/file names and file contents** (`.md` and `.txt` files).
- Frontmatter is excluded from content search to avoid false positives from YAML fields.
- Name matches show the matched term highlighted in the result title.
- Content matches show a text snippet around the match with the term highlighted, plus a **CONTENT** badge to distinguish them from name matches.
- Results always search from the root folder you set, regardless of which subfolder you are currently browsing.
- Click **×** to clear the search and return to the normal folder view.

**Sort:**

A sort dropdown sits next to the search bar. Options:

| Option | Description |
|--------|-------------|
| Folders ↑ A-Z | Folders first, then files, both alphabetical (default) |
| Folders ↑ Z-A | Folders first, then files, both reverse-alphabetical |
| Name A-Z | All items alphabetical, folders and files mixed |
| Name Z-A | All items reverse-alphabetical, mixed |
| Newest first | Sort by last-modified date, newest at top |
| Oldest first | Sort by last-modified date, oldest at top |

**Copy content to the editor:**

When a Markdown file is open in preview mode, its text is selectable. To insert a passage into the active editor:

1. Select the text you want in the preview pane.
2. Click the **↩ insert selection** button in the nav bar.
3. The selected text is inserted at the cursor position in the active editor.

The preview is read-only — you cannot edit the file from the sidebar.

**Hover tooltips:**

Hover over any file or folder in the list to see an information card:

| Item type | Information shown |
|-----------|------------------|
| Markdown / text file | Last modified date and time · File size · Word count (frontmatter excluded) |
| Image / audio / other file | Last modified date and time · File size |
| Folder | Total file count · Subfolder count |

The word count updates asynchronously from Obsidian's file cache and appears within a moment of hover.

---

### Frontmatter Manager

Writing Studio automatically manages YAML frontmatter in your documents when **Frontmatter auto-update** is enabled. On every save it updates:

- `word-count` — current word count
- `modified` — last-modified date

The `word-count-goal` frontmatter field is read by the inline goal banner and the Word Count Goal modal.

---

## Context Menus

Writing Studio adds items to Obsidian's right-click context menus. All Writing Studio items are grouped together under the heading **Writing studio options** to distinguish them from other plugins and Obsidian's built-in options.

### Right-click inside an open document (editor menu)

| Option | Action |
|--------|--------|
| Export this document | Open the export modal for the current file |
| Publish to WordPress | Open the WordPress publish modal for the current file |
| Set word count goal | Set a word count target for the current document |
| Switch writing mode → | Open a mode-switcher menu (Draft / Edit / Review / None) |
| Typography font → | Open a font picker menu to change the typography font (visible only when Typography Mode is active) |

### Right-click a Markdown file in the file explorer

| Option | Action |
|--------|--------|
| Add to writing project | Open a project picker and add the file to the selected project |

### Right-click a folder in the file explorer

| Option | Action |
|--------|--------|
| Open in sidebar explorer | Open the folder in the Folder Sidebar Explorer panel |

---

## Commands Reference

No default hotkeys are assigned. All commands can be given a hotkey in **Settings → Hotkeys**.

| Command | Description |
|---------|-------------|
| Open launcher | Open the launcher sidebar panel |
| Open binder | Open the writing binder sidebar panel |
| Open writing log | Open the daily writing log panel |
| Toggle focus mode | Enable or disable focus mode |
| Toggle typography mode | Enable or disable typography mode |
| Switch to draft mode | Activate draft writing mode |
| Switch to edit mode | Activate edit writing mode |
| Switch to review mode | Activate review writing mode |
| Start writing sprint | Open the sprint timer modal |
| Export document | Export the current document |
| Export project | Export the full project |
| Preview compiled manuscript | Open the compile preview pane |
| Publish to wordpress | Publish the current document to WordPress |
| New writing project | Create a new writing project |
| Open writing dashboard | Open the statistics dashboard |
| Open targets dashboard | Open the word count targets panel |
| Set word count goal | Set a per-document word count goal |
| Open folder in sidebar explorer | Search and open a vault folder in the sidebar |

---

## Ribbon Icon

Writing Studio adds a single icon to the Obsidian ribbon.

| Icon | Action |
|------|--------|
| Feather | Open the Writing Studio Launcher panel |

All other features are accessible from the Launcher panel, the command palette, context menus, or assigned hotkeys.

---

## Settings Overview

Open via **Settings → Writing Studio**.

| Tab | What it controls |
|-----|-----------------|
| General | Open on startup, default project folder, author name, document type, frontmatter auto-update |
| Focus mode | Focus unit, dim opacity, font override, sidebar behavior, typewriter scroll |
| Typography | Font family, custom font name, line length, font size, line height, letter spacing, persistence |
| Sprint & goals | Sprint duration, daily goal, sound notifications, history retention, inline banner |
| Export | Format, paper size, font, font size, Pandoc path, EPUB language, EPUB cover |
| Writing log | Append sprint summaries to Daily Note |
| WordPress | Site credentials, default post status, wikilink handling |

---

## Requirements

| Requirement | When needed |
|-------------|-------------|
| Obsidian 1.7.2 or later | Always |
| Desktop (Windows, macOS, Linux) | Always — this plugin does not run on mobile |
| Internet connection | First use of each Typography Mode font (cached after that) |
| [Pandoc](https://pandoc.org/installing.html) | Export to PDF, DOCX, RTF, HTML, EPUB |
| LaTeX (TeX Live / MiKTeX) | Export to PDF only |
| WordPress 5.6+ with REST API enabled | WordPress publishing |
| WordPress Application Password | WordPress publishing |
