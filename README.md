# Obsidian Writing Studio

**Version 2.1.3** · Desktop only

Transform Obsidian into a professional writing environment. Writing Studio bundles a project binder, writing sprints, focus and typography modes, manuscript export, WordPress publishing, and a folder sidebar explorer into a single plugin.

---

## Installation

1. Build the plugin: `npm run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at:
   ```
   <vault>/.obsidian/plugins/obsidian-writing-studio/
   ```
3. Enable the plugin in **Settings → Community Plugins**.

---

## Features

### Writing Studio Launcher

The Launcher is a left-sidebar dashboard that opens automatically when Obsidian loads. It shows your active project, recent files, and quick-action buttons for the most common Writing Studio tasks.

**To open:** Click the feather ribbon icon, or assign a hotkey to **Open Writing Studio** in Settings → Hotkeys.

---

### Writing Binder

The Binder is a left-sidebar project panel that lists all documents in your active writing project. Each document shows its title, type (Chapter, Section, Article, Note), status (Draft, In Progress, Complete), and live word count. Documents can be reordered and toggled in or out of export.

**To open:** Click the book ribbon icon, or assign a hotkey to **Open binder** in Settings → Hotkeys.

**Adding a file to a project:**
- Right-click any Markdown file in the file explorer and choose **Add to Writing Project**.
- The file is added to the active project's binder immediately.

---

### Writing Modes

Three modes shape how the editor behaves. The current mode is shown in the status bar.

| Mode | Purpose |
|------|---------|
| **Draft** | Distraction-free drafting; spell-check and formatting hints suppressed |
| **Edit** | Revision pass; full editor tooling active |
| **Review** | Read-only style; ideal for a final proofread |
| **None** | Normal Obsidian behavior |

**To switch modes:**
- Click the layout-dashboard ribbon icon for a dropdown menu.
- Right-click inside the editor and choose **Switch Writing Mode →**.
- Assign hotkeys to **Switch to draft mode / Edit mode / Review mode** in Settings → Hotkeys.

The active mode persists across Obsidian restarts.

---

### Focus Mode

Focus Mode dims everything in the editor except the paragraph or sentence you are currently writing, reducing visual noise and keeping attention on the active thought.

**To toggle:** Click the eye ribbon icon, or assign a hotkey to **Toggle focus mode** in Settings → Hotkeys. Press `Escape` to exit.

**Settings (Settings → Focus Mode):**

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

**To toggle:** Assign a hotkey to **Toggle typography mode** in Settings → Hotkeys.

**Settings (Settings → Typography):**

| Setting | Description |
|---------|-------------|
| Font family | Choose from built-in presets (Mono, Serif, Sans), a curated list of web-safe fonts (Lora, EB Garamond, Inter, etc.), or enter a custom font name |
| Custom font name | Used when "Custom font name…" is selected above |
| Max line length | Characters per line (55–80); constrains the editor column width |
| Font size | Editor font size in pixels |
| Line height | Multiplier; default 1.7 |
| Letter spacing | CSS `letter-spacing` value (e.g. `normal`, `0.02em`) |
| Persist across sessions | Keep Typography Mode active when Obsidian reopens |

---

### Writing Sprint Timer

The Sprint Timer runs a timed writing session. A countdown appears in the status bar. When the sprint ends, a summary modal shows words written, duration, and words-per-minute. The session is logged to sprint history and optionally appended to your Daily Note.

**To start a sprint:** Click the timer ribbon icon, or assign a hotkey to **Start writing sprint** in Settings → Hotkeys.

The sprint modal lets you set:
- Duration (default from settings)
- Word count goal for the session

**Settings (Settings → Sprint & Goals):**

| Setting | Description |
|---------|-------------|
| Default sprint duration | Starting value in the sprint modal (minutes) |
| Default daily word goal | Target used in the Writing Dashboard |
| Sound notifications | Play a tone when the sprint ends |
| Sprint history retention | Days to keep sprint records before purging |
| Inline goal banner | Show a progress bar below the editor toolbar when a document has a word count goal set |

---

### Word Count Goal

A per-document word count goal can be set and tracked inline.

**To set a goal:**
- Use the command **Set Word Count Goal** from the command palette.
- Right-click inside the editor and choose **Set Word Count Goal**.

When a goal is set and **Inline goal banner** is enabled, a progress bar appears below the editor toolbar showing current words, goal, and percentage. It updates in real time as you type.

---

### Writing Dashboard

The Writing Dashboard shows your word count history, sprint log, daily progress toward your goal, and per-project statistics.

**To open:** Click the bar-chart ribbon icon, or use the command **Open writing dashboard** from the command palette.

---

### Targets Dashboard

The Targets Dashboard lets you assign word count goals to individual documents in the active project's binder and track progress across the whole project at a glance.

**To open:** Use the command **Open targets dashboard**, or assign a hotkey in Settings → Hotkeys.

---

### Project Manager

Projects group a set of documents (binder items) and act as the scope for export, statistics, and the word count goal banner.

**To create a project:** Use the command **New Writing Project**.

**To switch projects:** Use the Launcher dashboard or Binder panel.

Each project stores:
- Title and description
- Ordered binder with chapters, sections, articles, and notes
- Per-item word count goals, statuses, and export flags

---

### Compile Preview

The Compile Preview opens a split pane showing all binder documents for the active project concatenated in order, rendered as a finished manuscript.

**To open:** Use the command **Preview Compiled Manuscript**.

---

### Export Engine

The Export Engine uses [Pandoc](https://pandoc.org) to convert the current document or the active project's compiled manuscript to a finished file.

**Supported formats:** PDF · Word (.docx) · RTF · HTML · Markdown · EPUB

**To export:** Right-click inside the editor and choose **Export This Document**, or assign a hotkey to **Export document** in Settings → Hotkeys.

**Settings (Settings → Export):**

| Setting | Description |
|---------|-------------|
| Default export format | Pre-selected format in the export modal |
| Default paper size | Letter (US) or A4 |
| Export font | Font name used in PDF/DOCX output (e.g. `Georgia`) |
| Export font size | Point size for PDF/DOCX output |
| Pandoc path | Full path to the `pandoc` binary if it is not on your system `PATH` |
| EPUB language | BCP 47 language tag (e.g. `en`, `fr`, `de`) |
| EPUB include cover | Generate a text cover page when no cover image is provided |

> **Requirement:** Pandoc must be installed. Download from [pandoc.org](https://pandoc.org/installing.html). For PDF export, a LaTeX distribution (e.g. TeX Live or MiKTeX) is also required.

---

### WordPress Publishing

Publish the current Markdown file directly to one or more WordPress sites using the WordPress REST API.

**To publish:** Click the globe ribbon icon, right-click inside the editor and choose **Publish to WordPress**, or assign a hotkey to **Publish to WordPress** in Settings → Hotkeys.

The publish modal lets you choose the target site, set the post title, and select the post status (Draft, Pending, Published).

**Setting up a site (Settings → WordPress):**

1. Click **+ Add WordPress site**.
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

The Folder Sidebar Explorer opens a navigable folder tree in the right sidebar. You can browse into subfolders, preview files without opening them in a new tab, and navigate back through your history.

**To open:** Click the folder ribbon icon, use the command **Open folder in sidebar explorer**, or right-click any folder in the file explorer and choose **Open in sidebar explorer**.

**Panel features:**

| Feature | How to use |
|---------|-----------|
| Browse into a subfolder | Click the folder |
| Preview a Markdown file | Click the file — it renders inline |
| Preview an image | Click the file — displayed inline |
| Preview audio | Click the file — player appears inline |
| Other file types | Click the file — an **Open in editor** button appears |
| Go back | Click **← back**, or press `Backspace` when the list is focused |
| Return to root folder | Click **⌂ root** |
| Keyboard navigation | Tab to focus the list, then `↑` / `↓` to move, `Enter` to open, `Backspace` to go back |
| Breadcrumb navigation | Click any segment in the breadcrumb trail to jump to that folder |

---

### Frontmatter Manager

Writing Studio automatically manages YAML frontmatter in your documents when **Frontmatter auto-update** is enabled. On every save it updates:

- `word-count` — current word count
- `modified` — last-modified date

The `word-count-goal` frontmatter field is read by the inline goal banner and the Word Count Goal modal.

---

### Daily Writing Log

When **Append to daily note** is enabled (Settings → Writing Log), a summary of each completed sprint is appended to the Daily Note for today. This requires the Obsidian Daily Notes core plugin to be active.

---

## Commands Reference

No default hotkeys are assigned. All commands can be given a hotkey in **Settings → Hotkeys**.

| Command | Description |
|---------|-------------|
| Open launcher | Open the launcher sidebar panel |
| Open binder | Open the writing binder sidebar panel |
| Toggle focus mode | Enable or disable focus mode |
| Toggle typography mode | Enable or disable typography mode |
| Switch to draft mode | Activate draft writing mode |
| Switch to edit mode | Activate edit writing mode |
| Switch to review mode | Activate review writing mode |
| Start writing sprint | Open the sprint timer modal |
| Export document | Export the current document via Pandoc |
| Publish to WordPress | Publish the current document to WordPress |
| Open targets dashboard | Open the word count targets panel |
| Set word count goal | Set a per-document word count goal |
| Export project | Export the full project via Pandoc |
| Preview compiled manuscript | Open the compile preview pane |
| New writing project | Create a new writing project |
| Open writing dashboard | Open the statistics dashboard |
| Open folder in sidebar explorer | Fuzzy-search and open a vault folder in the sidebar |

---

## Ribbon Icons

| Icon | Action |
|------|--------|
| Feather | Open Writing Studio (launcher) |
| Book | Open writing binder |
| Timer | Start writing sprint |
| Eye | Toggle focus mode |
| Layout Dashboard | Switch writing mode (dropdown) |
| Globe | Publish to WordPress |
| Bar Chart | Writing dashboard |
| Folder | Open folder in sidebar explorer |

---

## Settings Overview

Open via **Settings → Obsidian Writing Studio**.

| Tab | What it controls |
|-----|-----------------|
| General | Default project folder, author name, document type, frontmatter auto-update |
| Focus Mode | Focus unit, dim opacity, font override, sidebar behavior, typewriter scroll |
| Typography | Font family, line length, font size, line height, letter spacing, persistence |
| Sprint & Goals | Sprint duration, daily goal, sound, history retention, inline banner |
| Export | Format, paper size, font, Pandoc path, EPUB options |
| Writing Log | Append sprint summaries to Daily Note |
| WordPress | Site credentials, post status defaults, wikilink handling |

---

## Requirements

| Requirement | When needed |
|-------------|-------------|
| Obsidian 1.4.0 or later | Always |
| Desktop (Windows, macOS, Linux) | Always — this plugin does not run on mobile |
| [Pandoc](https://pandoc.org/installing.html) | Export to PDF, DOCX, RTF, HTML, EPUB |
| LaTeX (TeX Live / MiKTeX) | Export to PDF only |
| WordPress 5.6+ with REST API enabled | WordPress publishing |
| WordPress Application Password | WordPress publishing |
