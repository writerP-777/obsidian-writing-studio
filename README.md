<p align="center">
  <img src="assets/logo.png" width="120" alt="Writing Studio logo">
</p>

# Writing Studio

**Version 4.0.0** · Desktop only

![GitHub all releases](https://img.shields.io/github/downloads/writerP-777/obsidian-writing-studio/total)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12832/badge)](https://www.bestpractices.dev/projects/12832)

Writing Studio turns Obsidian into a dedicated environment for serious nonfiction work — from your first research notes to a finished, exported manuscript. It bundles a project binder, writing modes, focus and typography tools, sprint timer, progress tracking, manuscript export, and WordPress publishing into a single plugin. A built-in sidebar file explorer lets you browse, preview, and pull content from anywhere in your vault without leaving your draft.

<p align="center">
  <img src="assets/sidebar-explorer-screenshot.png" alt="Writing Studio with the Launcher panel open on the left, an active draft with its word count goal banner in the center, and the Folder Sidebar Explorer previewing a research file on the right" width="900">
  <br>
  <em>Writing Studio in use — Launcher (left), active draft with word count goal banner (center), Folder Sidebar Explorer open to a research folder (right).</em>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/writerp777">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&slug=writerp777&button_colour=c9a84c&font_colour=000000&font_family=Georgia&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40">
  </a>
</p>

## Contents

- [Features](#features)
- [Language support](#language-support)
- [Writing Studio Launcher](#writing-studio-launcher)
- [Folder Sidebar Explorer](#folder-sidebar-explorer)
- [Your Project](#your-project)
- [Your Writing Environment](#your-writing-environment)
- [Tracking Your Progress](#tracking-your-progress)
- [Getting Your Work Out](#getting-your-work-out)
- [Supporting Tools](#supporting-tools)
- [Context Menus](#context-menus)
- [Commands Reference](#commands-reference)
- [Settings Overview](#settings-overview)
- [Ribbon Icon](#ribbon-icon)
- [Installation](#installation)
- [Requirements](#requirements)
- [Reporting a Bug](#reporting-a-bug)
- [Security](#security)

---

## Features

**Writing Binder** — Your project's folder tree, rendered as a manuscript. The binder reads your folders directly, so files created, renamed, or moved anywhere — even outside Obsidian — always appear correctly, with no import or scan step. Drag chapters into order, set per-document status and word count goals, and exclude documents from compile with a right-click.

**Outline** — Give each section a one-paragraph synopsis, the claim it makes, and the Outline view lays the whole project out as an editable table: synopsis, status, and words against goal, section by section, with part totals. Copy it out as an annotated table of contents for a book proposal.

**Project Manager** — Create projects from six templates (blank, book, article series, blog collection, journal article, magazine article), set a total word count goal, and switch between projects from the Launcher.

**Compile Preview** — Concatenate all binder documents in order and render them as a finished manuscript in a split pane, without exporting.

**Writing Modes** — Switch between Draft (distraction-free), Edit (full tooling), and Review (read-only) modes from the status bar, command palette, context menu, or Launcher.

**Focus Mode** — Dim everything except the paragraph or sentence you are writing. Configurable dim level, font size override, sidebar collapse, and typewriter scroll.

**Typography Mode** — Apply a curated font, constrained line length, and controlled line height to the editor. Fourteen font options including iA Writer fonts, Google Fonts, and custom system fonts.

**Sprint Timer** — Run timed writing sessions with a draggable floating overlay. Set duration, word goal, and scope (file or project). Quick-start presets (10 m, 15 m, 25 m) available from the Launcher.

**Progress Tracking** — Live word counts in the status bar and Launcher, session delta tracking, per-document and per-project word count goals with inline progress banners, and a 30-day writing log with streak tracking.

**Export Engine** — Export to Manuscript (HTML), PDF, Word (.docx), RTF, HTML, Markdown, and EPUB. Manuscript format produces industry-standard layout with no external tools; other formats require Pandoc.

**Sources, Citations & Footnotes** — Any note with a `citekey` property is a source, including literature notes from Zotero Integration or the Citations plugin. Cite with `[@smith2020, p. 12]` or a wikilink to the source note, and every export carries the citations and a works-cited page in Chicago author-date or notes style. Footnotes now survive every format. An **Add source** form and an **Insert citation** picker mean nobody has to type a citation key by hand.

**WordPress Publishing** — Publish directly to WordPress from Obsidian. Set post title, status, categories, tags, excerpt, and scheduled date. Supports multiple sites with per-site credentials and connection testing.

**Folder Sidebar Explorer** — Browse any vault folder in a sidebar panel. Search by name or file content, preview Markdown files and images inline, and insert selected text directly into the active editor.

## Language support

Writing Studio is available in the following languages in addition to English:

- Arabic
- Bengali
- Brazilian Portuguese
- Chinese (Simplified)
- French
- German
- Hindi
- Japanese
- Korean
- Russian
- Spanish

**To change the language:** Open **Settings → General** in Obsidian, scroll to **Language**, and select your preferred language from the list. Restart Obsidian for the change to take effect. Writing Studio will display in the selected language if it is supported.

**Found a translation error or missing text?** Please open an issue on GitHub — [Submit a bug report or enhancement request](https://github.com/writerP-777/obsidian-writing-studio/issues/new) — and include the language, the location in the plugin where the text appears, and what it currently says. We will address it in the next release.

### Writing Studio Launcher

The Launcher is your home base in Writing Studio — a sidebar panel that shows your active project, progress toward your goals, and one-click access to every major feature.

<p align="center">
  <img src="assets/launcher-project-card.png" alt="The Launcher project card with the project dropdown and the new project, edit, and delete buttons above the word count and project goal" width="520">
  <br>
  <em>The Launcher project card — switch projects from the dropdown; word count against the project goal below.</em>
</p>

By default Writing Studio launches automatically when Obsidian loads — the Launcher opens and your last session's writing mode and typography are restored. To disable this, turn off **Open on startup** in **Settings → General**: Obsidian then opens clean, with no Writing Studio status bar items or restored modes, and the studio stays dormant until you launch it yourself. Launching it manually restores your last session state the same way.

**To open manually:** Click the feather ribbon icon, or assign a hotkey to **Open launcher** in Settings → Hotkeys.

**First run:** In a vault with no projects yet, the Launcher shows an orientation card explaining how projects work, with a **Create your first project** button to get started.

<p align="center">
  <img src="assets/launcher-first-run.png" alt="The Launcher first-run orientation card with an explanation of projects and a Create your first project button" width="520">
  <br>
  <em>First run — the orientation card shown before any project exists.</em>
</p>

**The Launcher includes:**
- Active project name, total word count, and progress toward your project word count goal
- Writing mode selector (Draft / Edit / Review)
- Focus Mode and Typography Mode toggles
- Sprint timer with "Set up sprint" button and Quick Sprint Options presets (10 m, 15 m, 25 m)
- Today card showing words written, sprints completed, session word count, and streak
- Quick-action buttons: Targets Dashboard, Writing Dashboard, Preview manuscript, Export, Writing Log, Publish to WordPress

---

### Folder Sidebar Explorer

The Folder Sidebar Explorer opens any vault folder in a right-sidebar panel, letting you browse reference material, research notes, or any folder outside your active project without leaving your draft. Unlike the Binder — which is scoped to your writing project — the sidebar explorer works with any folder in your vault.

<p align="center">
  <img src="assets/folder-sidebar-explorer.png" alt="The Folder Sidebar Explorer panel with a Markdown file open in preview, showing the breadcrumb trail, back and root buttons, and the insert selection button" width="340">
  <br>
  <em>The Folder Sidebar Explorer with a research file open in preview — select text and click insert selection to pull it into your draft.</em>
</p>

**To open:**
- Use the command **Open folder in sidebar explorer** from the command palette — a folder picker appears so you can choose which folder to explore.
- Right-click any folder in the file explorer and choose **Open in sidebar explorer** under **Writing studio options**.
- Right-click any folder in [Notebook Navigator](https://github.com/johansan/notebook-navigator) and choose **Open in sidebar explorer** (requires Notebook Navigator to be installed).
- Assign a hotkey in Settings → Hotkeys.

The panel opens in the **right sidebar**. The folder you open becomes the **root folder** for that session — the breadcrumb trail, the ⌂ root button, and search all operate relative to it.

**Browsing and navigation:**

| Feature | How to use |
|---------|-----------|
| Browse into a subfolder | Click the folder |
| Preview a Markdown file | Click the file — the folder listing is replaced by a rendered preview inside the panel |
| Preview an image | Click the file — displayed inline |
| Preview audio | Click the file — player appears inline |
| Other file types | Click the file — an **Open in editor** button appears |
| Go back | Click **← back**, or press `Backspace` when the list has keyboard focus |
| Return to root folder | Click **⌂ root** to jump back to the folder you originally opened |
| Keyboard navigation | Tab to focus the list, then `↑` / `↓` to move, `Enter` to open, `Backspace` to go back |
| Breadcrumb navigation | Click any segment in the breadcrumb trail to jump directly to that folder |

**Search:**

A search bar appears at the top of the folder list. Type your query and press **Enter** to run the search.

- Searches **both folder/file names and file contents** (`.md` and `.txt` files).
- Frontmatter is excluded from content search to avoid false positives from YAML fields.
- Name matches show the matched term highlighted in the result title.
- Content matches show a text snippet around the match with the term highlighted, plus a **CONTENT** badge to distinguish them from name matches.
- Results always search from the root folder, regardless of which subfolder you are currently browsing.
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

When a Markdown file is open in preview mode (after clicking it in the file list), its text is selectable. To insert a passage into the active editor:

1. Click a file in the list — the panel switches to preview mode showing the rendered file.
2. Select the text you want in the preview pane.
3. Click the **↩ insert selection** button in the nav bar.
4. The selected text is inserted at the cursor position in the active editor.

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

### Your Project

#### Project Manager

Projects group a set of documents (binder items) and act as the scope for export, statistics, and the word count goal banner.

**To create a project:** Use the command **Create new writing project** from the command palette, or click the **+** button next to the project dropdown in the Launcher or Binder panel.

**To switch projects:** Use the Launcher panel or the project selector at the top of the Binder panel.

**To edit a project:** Click the pencil icon in the Launcher project card or next to the project selector in the Binder. You can change the title, author, description, total word count goal, deadline, writing days, and the document folder — the folder inside the project that holds its documents (for example, renaming a book project's `Chapters/` to `Scenes/` renames the folder and moves its files with it; the binder follows automatically, as it also does when you rename the folder directly in the file explorer).

**To rename a project:** Change the title in the edit-project dialog and save. The project folder is renamed to match, and every file inside moves with it — links heal, nothing is copied. A hint under the title field shows the folder name you will get before you save. Characters that cannot appear in a folder name (`\ / : * ? " < > |`) become `-`, so a title like *My Book: A Novel* keeps its colon while its folder is named `My Book- A Novel`; the hint says so whenever a substitution happens. If a folder with the new name already exists, the save is refused with a message and nothing changes — choose a different title. Editing the author, description, or goal never moves the folder. To change the title and leave the folder as it is, turn off **Also rename the project folder** in the dialog before saving.

It works the other way too: rename the project folder in Obsidian's file explorer and the project's title follows, provided the title and the folder name were the same before the rename. A title you set apart from its folder (like the colon example above) is yours and is never overwritten. Rename inside Obsidian, not in Windows Explorer or Finder — Obsidian reports an outside rename as a delete and a create, so neither Writing Studio nor Obsidian's own links can follow it.

**Deadline and pace:** Give a project a **Deadline** in the edit-project dialog, directly under the total word count goal, and the Launcher project card shows how it stands: the days left, and with a goal, the words a day you need to finish on time ("Due Dec 15, 2026 · 39 writing days left — 1,734 words a day to finish on time"). The arithmetic is plain: the words still to write, divided by the writing days left counting today, rounded up. **Writing days** are Monday to Friday unless you change them with the seven day buttons under the deadline; the deadline day itself always counts, since you can still hand in on it. Once the goal is met the card says so with the days to spare, and after the date has passed it shows the words still to go. The same figures appear in the Writing dashboard, and the status bar's project words item gains the daily pace ("12,400 / 80,000 project words · 1,734/day"). A project without a deadline shows none of this.

**To delete a project:** Click the trash icon in the Launcher project card or next to the project selector in the Binder, then confirm. This removes the project from Writing Studio's list only — the project folder and all its documents stay untouched in your vault.

<p align="center">
  <img src="assets/edit-project-modal.png" alt="The Edit project modal with fields for project title, an Also rename the project folder toggle, author name, document folder, total word count goal, deadline, seven writing-day buttons with Monday to Friday on, description, and a Save button" width="560">
  <br>
  <em>The Edit project modal — change the title (and the folder with it), author, document folder, word count goal, deadline, writing days, and description.</em>
</p>

Each project stores:
- Title, type, author, and description
- Ordered binder with chapters, sections, articles, and notes
- Per-item word count goals, statuses, and export flags
- Optional total word count goal (shown in the Launcher and status bar)
- Optional deadline and writing days, for the words-a-day pace

**Project templates available at creation:**

| Template | Structure created |
|----------|------------------|
| Blank | Empty — build your own structure |
| Book | Front Matter, Part 1 / Chapter 1, Back Matter |
| Article series | Series Overview note (with article schedule), Article 1 placeholder |
| Blog collection | Date-organized folder, first post placeholder |
| Journal article | Title Page, Abstract, Keywords, Introduction, Literature Review, Methodology, Findings / Analysis, Discussion, Conclusion, References, Appendices |
| Magazine article | Pitch / Query Notes, Headline & Deck, Lede, Nut Graf, Body, Quotes & Sources, Kicker, Fact-Check Notes, Author Bio |

---

#### Writing Binder

Keeping a book-length manuscript organized means knowing at a glance which chapters are drafted, which are in progress, and what will compile into the finished manuscript. The Binder is a sidebar panel that shows all of that for your active project.

The binder reads your folders directly — the project folder tree *is* the manuscript structure. Organize your work in the binder or in your computer's file explorer, and both always match: files created, renamed, moved, or deleted outside Obsidian appear correctly with no scan or import step. A document's filename is its title. Status (Draft, In Progress, Complete, Published) shows as a colored stripe on the row's left edge, folders carry document-count badges, documents excluded from compile render dimmed, and hovering any row shows its on-disk name and the settings the binder reads from it.

**Synopsis:** Right-click a document and choose **Edit synopsis…** to give it one or two sentences on what the section argues or covers. The synopsis is stored as a `synopsis` property on the document, so you can also read and edit it in Obsidian's Properties panel at the top of the note. It shows in the row's hover tooltip, and the **Show synopses** button in the binder toolbar puts each synopsis under its title so you can read the argument straight down the tree. The Outline view, described below, shows and edits the same synopses as a table.

Below the manuscript, **Research** and **Exports** are pinned as drawer tabs with live file counts. Research holds markdown notes that never compile (drag documents in and out of it freely); Exports is output-only, written by the export engine. Non-markdown files are visible and openable everywhere but stay outside the manuscript. The **Add source** button beside the Research tab opens a form, which writes a research note the citation engine can cite (see Sources and Citations, below).

<p align="center">
  <img src="assets/binder-tree.png" alt="The binder showing a manuscript tree with folder count badges, colored status stripes, a dimmed compile-excluded document, and Research and Exports drawer tabs with file counts at the bottom" width="520">
  <br>
  <em>The binder — status stripes on the left edge, count badges on folders, a dimmed compile-excluded document, and the Research and Exports drawer below.</em>
</p>

**To open:** Use the command **Open binder** from the command palette, or assign a hotkey in Settings → Hotkeys.

**Ordering:**

Drag to reorder documents and folders. A document's position is stored in its own frontmatter (`binder-order`), so it travels with the file; a folder's position lives in a name marker (`020~ Part One`) that the binder hides in display. Anything without a saved position sorts naturally — A to Z, numbers in numeric order — after ordered items. Reordering never renames your documents.

**Moving things:**

Dragging physically moves files and folders: drop between rows to reorder, onto a folder to nest inside it, on the empty space below the tree to move to the project root, or onto the Research drawer tab to move a document out of the manuscript. A folder drag carries all its children, and links heal automatically on every move.

**Control strip:**

A two-row control strip at the top of the binder keeps the high-frequency writing controls next to your documents, so the daily loop doesn't require switching to the launcher tab. The top row is a Draft / Edit / Review segmented control (clicking the active mode switches back to normal). The bottom row holds Focus and Typography toggles, a sprint chip (its menu offers the set-up modal and 10/15/25-minute quick starts; an armed sprint shows a ready chip with the duration), and a **...** menu with the occasional actions: export, publish, preview manuscript, targets dashboard, writing dashboard, and writing log. The launcher keeps its own copies of all controls, and every surface stays in sync no matter where a change is made.

<p align="center">
  <img src="assets/binder-control-strip.png" alt="The binder control strip with Draft, Edit, and Review on the top row and Focus, Typography, Sprint, and an overflow menu on the bottom row, above the project selector and a toolbar of seven buttons: new document, new folder, word counts, synopses, outline, find and replace, and targets, then the document tree" width="520">
  <br>
  <em>The binder control strip — writing modes on top; focus, typography, sprint, and overflow controls below; then the toolbar: new document, new folder, word counts, synopses, outline, find and replace, targets.</em>
</p>

<p align="center">
  <img src="assets/binder-strip-overflow.png" alt="The binder overflow menu open, showing export, publish to WordPress, preview manuscript, targets dashboard, writing dashboard, and writing log" width="520">
  <br>
  <em>The overflow menu holds the less frequent actions: export, publish, preview, and the dashboards and log.</em>
</p>

**Keyboard navigation:**

The binder tree is fully keyboard-operable. Tab to focus the list, then:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move through visible documents and folders |
| `→` | Expand a collapsed folder, or step into an open one |
| `←` | Collapse an open folder, or jump to the parent |
| `Enter` | Open the document, or expand/collapse a folder |
| `F2` | Rename the focused item inline (Enter commits, Escape cancels) |
| `Shift+F10` or menu key | Open the item's right-click menu |

**Opening and renaming documents:**

A single click on a document opens it immediately. Rename an item from its right-click menu, or by pressing **F2** while it is focused (Enter commits, Escape cancels). Renaming in the binder renames the file itself — links heal automatically — and invalid names are rejected with a specific message, never silently altered.

**Creating documents and folders:**

Toolbar buttons create a document or folder at the manuscript root; a folder's right-click menu creates inside it, and a document's menu creates beside it. New documents prompt for a title up front rather than being named "Untitled."

**Splitting and merging sections:**

A long section that has grown into two is split where you are: right-click inside the document and choose **Split section here…** (or run the command **Split section at cursor**). Everything from the cursor to the end of the document moves into a new section placed right after the current one in the binder, with the same status and type. The dialog suggests a title — the heading the cursor is on, or the heading the new section starts with, or the current title with "(2)" — and you can type another. Footnotes travel correctly: a footnote used only in the second half moves with it, one used in both halves is copied, and the rest stay. The new section opens in a new tab.

To join two sections, right-click the first one in the binder and choose **Merge with next section…**. The next document's text is appended after a blank line, the first section's properties (synopsis, goal, status) are kept, and the second file goes to the trash according to your Obsidian "Deleted files" setting, so it can be brought back. A toggle in the dialog adds the second section's title as a heading where the two join; if the second section already starts with that heading, nothing is added twice. A footnote both sections carry with the same text becomes one note again, so splitting and merging round-trips cleanly; labels that clash with different text are renumbered, so each note keeps its own text. The action is offered only when a document follows in the same folder — Research notes are never merged.

**Right-click menu:**

Right-click any item for its full set of actions — rename, set status, set a word count goal, set an optional document type, exclude a document from compile (or re-include it), create a document or folder, or delete to the trash (a folder's confirmation states how many files it contains).

<p align="center">
  <img src="assets/binder-context-menu.png" alt="The binder right-click menu on a document, showing rename, edit synopsis, status options, set word count goal, change type options, exclude from compile, new document, new folder, and delete" width="520">
  <br>
  <em>A document's right-click menu — synopsis, status, goal, type, and compile controls in one place. A document with another below it in the same folder also offers Merge with next section.</em>
</p>

**Organizing with folders:**

Folders are the structure. The book template creates a part folder for you, and any structure you build — in the binder or in your file explorer — is the manuscript's structure. Adding a file to a project is simply moving it into the project folder; it appears in the binder immediately, and files copied in outside of Obsidian show up the same way with no import step.

**Upgrading from an earlier version:**

The first time you open an existing project, Writing Studio arranges its folders to match what your old binder showed — creating folders and moving documents, deleting nothing, and never changing your writing. A one-time notice explains this, and the command **Restore previous binder layout** puts your folders back the way they were if you preferred your earlier arrangement. Everything in your project folder is now part of the compiled manuscript. Check the compile preview before your first export, and use Exclude from compile on anything you want left out.

---

#### Outline

A nonfiction manuscript is an argument, and the Outline is where you check that the argument holds together before you polish the prose. It opens in the main pane as a table of every section in the manuscript, in binder order:

<p align="center">
  <img src="assets/outline-view.png" alt="The Outline view in the main pane: a table of sections nested under their parts with synopsis, status dropdown, words, goal, and progress columns, part rows carrying subtree totals, a status filter and a Copy outline button at the top right, and a footer counting sections without a synopsis" width="900">
  <br>
  <em>The Outline — every section with its synopsis, status, words, and goal; parts carry subtree totals; the filter and Copy outline sit at the top right.</em>
</p>

| Column | What it shows |
|--------|---------------|
| Section | The document title, indented under its part. Click it to open the document in a new tab; the outline stays open. Click a part's name to collapse or expand it. |
| Synopsis | What the section argues or covers. Click to edit in place; Ctrl+Enter (Cmd+Enter on Mac) saves, Escape cancels. An empty cell says *Add a synopsis…*. |
| Status | Draft, In progress, Complete, or Published, as a dropdown. Changing it here is the same as changing it in the binder. |
| Words | The section's current word count. Part rows show the total for everything inside them. |
| Goal | The section's word count goal, editable. Part rows show the sum of the goals inside them. |
| Progress | Words against goal, as a bar and a percentage. |

The footer totals the whole manuscript and, until every section has one, says how many sections still have no synopsis. A status filter at the top narrows the table to one status while keeping the parts those sections sit in. Documents excluded from compile render dimmed, and the status colour stripe from the binder appears on the left edge of each row.

**Copy outline** puts the whole outline on the clipboard as an indented list of titles and synopses, ready to paste into a book proposal, an email to an editor, or a planning note.

Everything the outline shows comes from the documents themselves (`synopsis`, `binder-status`, and `word-count-goal` properties), so the binder, the outline, and the targets dashboard can never disagree, and the table updates on its own as you write.

**To open:** Click **Open outline** on the project card in the Launcher, the outline button in the binder toolbar, or use the command **Open outline**.

---

#### Find and Replace in Project

A phrase, a name, a spelling, or a citation key that has to change in every chapter is one job, not thirty. Click the find-and-replace button in the binder toolbar or run the command **Find and replace in project** to open the dialog. Type what to find and the matches appear as you type, listed by section with the line around each one; the summary line reads "14 matches in 6 sections". Options: **Match case**, **Whole word**, and **Include research notes** (off by default — the manuscript is the usual scope). Properties at the top of a note and anything inside code are never searched. Click a section's title to open it behind the dialog at the first match.

<p align="center">
  <img src="assets/find-replace-dialog.png" alt="The Find and replace in project dialog with Fable in the Find field, Match case, Whole word, and Include research notes checkboxes, a summary of 16 matches in 6 sections, the matches grouped under each section title with a checkbox and the surrounding line, and Replace selected (16), Replace all, Undo last replace, and Close buttons" width="680">
  <br>
  <em>Find and replace in project — matches grouped by section, each with its line and a checkbox; replace the ticked ones or all, and undo the last replace.</em>
</p>

Every match has a checkbox, ticked to start with. Untick the ones to keep, then **Replace selected**; or **Replace all** to change every match. A notice reports what changed. If a file was edited between the search and the replace, it is skipped and named, so nothing is replaced in text you have not seen.

**Undo last replace** puts every touched file back exactly as it was, and stays available until the next replace or until Obsidian restarts. A file you edited after the replace is left alone and named, so your newer work is never overwritten.

---

#### Sources and Citations

Nonfiction rests on sources, and the sources already live in your vault. Writing Studio turns the notes you have into citations and a works-cited page without a reference manager in the loop.

**What counts as a source.** Any markdown note, anywhere in the vault, whose properties include a `citekey`. Literature notes produced by Zotero Integration or the Citations plugin already carry one, so they work as they are. The engine reads the fields it finds, under the names those tools and ordinary writers use: `title`; `author`, `authors`, or `creators` (a plain name, a list, "Last, First", or Zotero-style name objects); `year`, `date`, or `issued`; `type` or `itemType` (book, chapter, journal article, magazine or newspaper article, web page, thesis, report; anything else is treated as a book); `publisher`, `place`, `journal` or `container-title`, `volume`, `issue`, `pages`, `edition`, `editor`, `doi`, `url`, and `accessed`. If two notes share a citekey, the one in the project's Research folder wins and a notice names the other.

**Adding a source without typing YAML.** Click **Add source** beside the Research tab at the bottom of the binder, right-click any research note and choose **Add source…**, or run the command **Add source**. The form asks for the type, title, authors (one per line, first name first), year, and the fields that type needs. The citation key is filled in for you from the first author's surname and the year (`smith2020`, then `smith2020a` if that is taken) and can be changed. Saving creates a note such as `Research/Smith 2020 - The Long Argument.md` with the properties set and an empty body for your own notes, and opens it.

<p align="center">
  <img src="assets/add-source-dialog.png" alt="The Add a source dialog filled in for a book: type, title, authors, year, publisher, place of publication, URL or DOI, and the citation key generated from the author and year, with Add source and Cancel buttons" width="640">
  <br>
  <em>Add a source — fill in what you know; the citation key is generated from the first author and the year.</em>
</p>

```yaml
---
citekey: smith2020
type: book
title: "The Long Argument: Why Reform Fails"
author:
  - Jane Smith
year: 2020
publisher: Riverhead
place: New York
---
```

**Citing in a draft.** Two spellings work, and you can mix them:

| You type | Meaning |
|----------|---------|
| `[@smith2020]` | Cite the work |
| `[@smith2020, p. 12]` | Cite page 12 (`pp. 12-14` for a range, `chap. 3` for anything else) |
| `[@lee2018; @okafor2021]` | Two works in one citation |
| `[see @smith2020, p. 12]` | A prefix prints before the citation |
| `@smith2020` | The author is part of the sentence: "As Smith (2020) shows…" |
| `[-@smith2020]` | Year only, when the author was just named |
| `[[Smith 2020]]` | A wikilink to a source note is a citation |
| `[[Smith 2020\|p. 12]]` | The wikilink's alias is the page |

Wikilinks to notes without a citekey behave exactly as before. To cite without remembering a key, right-click in the editor and choose **Insert citation…** (or run the command **Insert citation**): the picker searches author, year, and title, takes an optional page, and inserts the citation at the cursor.

<p align="center">
  <img src="assets/insert-citation-picker.png" alt="The Insert citation picker with a search field, two sources listed by author, year, title, and citation key, an optional page field, and Insert and Cancel buttons" width="520">
  <br>
  <em>Insert citation — search by author, year, or title, add a page if you want one, and the citation lands at the cursor.</em>
</p>

**Renaming a citation key.** Right-click a source note in the Research drawer and choose **Rename citation key…** (or run the command **Rename citation key** with the source note open). The dialog shows the source, its current key, and where it is cited — "Used in 9 citations across 4 sections and 1 research note" — and checks the new key against the rules and every key in use. On **Rename**, the `citekey` property and every `@oldkey` citation in the project's manuscript and research notes are rewritten, pages and prefixes untouched. Wikilink citations name the file rather than the key, so they need no change. Other projects in the vault are not touched.

**Citation style.** Set once under Settings → Export → Citations:

- **Author-date (Chicago)**, the default: `(Smith 2020, 12)` in the text and a **Works cited** page at the end.
- **Notes (Chicago)**: each citation becomes a footnote, in full form the first time a source appears in a chapter and short form after, with a **Bibliography** page at the end. Your own footnotes and citation notes share one numbering sequence, in order of appearance.
- **Custom style file (.csl)**: any Citation Style Language file, for APA, MLA, or a house style. Applies to PDF, Word, and RTF, where Pandoc's citeproc does the formatting; the other formats use the built-in author-date style.

**Every format gets the works-cited page.** PDF, Word, and RTF hand the cited sources to Pandoc as a bibliography and run with `--citeproc` (the Notes setting ships its own compact Chicago notes style, so no download is needed). HTML, Manuscript, EPUB, Markdown, and the compile preview are formatted by the plugin itself in the two Chicago styles. Only sources you actually cite appear. A citation whose key matches no source is left visible as `[@key?]` and a notice names it, so the export never silently drops a reference.

**Footnotes everywhere.** The built-in converter now handles reference footnotes (`[^1]` with its `[^1]: text` definition) and inline footnotes (`^[text]`). Numbering restarts with each chapter. HTML and Manuscript collect every note under a **Notes** heading at the end, grouped by chapter; EPUB keeps each chapter's notes at the end of that chapter with the markup reading systems use to show them as popups; Markdown export keeps footnote syntax as it is; PDF, Word, and RTF had footnotes already.

**Before you export,** the export dialog reports what it found: "12 citations to 8 sources · Style: Author-date (Chicago)", and in warning color any key that matches nothing.

---

#### Compile Preview

The Compile Preview opens a split pane showing all binder documents for the active project concatenated in order, rendered as a finished manuscript.

**To open:** Use the command **Preview compiled manuscript** from the command palette, or click the **Preview manuscript** button in the Launcher panel.

---

### Your Writing Environment

#### Writing Modes

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

The active mode is saved and restored the next time Writing Studio launches — automatically at startup when **Open on startup** is enabled, or when you next open the Launcher or switch a mode.

---

#### Focus Mode

Focus Mode dims everything in the editor except the paragraph or sentence you are currently writing, reducing visual noise and keeping attention on the active thought.

**To toggle:** Assign a hotkey to **Toggle focus mode** in Settings → Hotkeys, or use the toggle in the Launcher panel. Press `Escape` to exit.

**Settings (Settings → Focus mode):**

| Setting | Description |
|---------|-------------|
| Focus unit | Highlight at the **paragraph** or **sentence (line)** level |
| Dim opacity | How opaque the dimmed text appears (10–50%) |
| Font size override | Override the editor font size while focused; 0 = use theme default. Takes precedence over Typography Mode's font size while Focus Mode is active |
| Auto-hide sidebars | Collapse left and right sidebars when Focus Mode activates |
| Typewriter scroll | Keep the active line vertically centered as you type |

---

#### Typography Mode

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
| Persist across sessions | Restore Typography Mode when Writing Studio next launches |

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

### Tracking Your Progress

#### Writing Sprint Timer

The Sprint Timer runs a timed writing session. When a sprint is active, a floating overlay displays the countdown and gives you full control — without requiring you to stay on the dashboard.

**To set up a sprint:**

- Click **Set up sprint** in the Launcher panel to open the sprint configuration modal.
- Or click one of the **Quick Sprint Options** preset buttons (10 m, 15 m, 25 m) in the Launcher panel to load a duration directly.

Either path opens the floating overlay in a ready state — the timer does not start until you press ▶ on the overlay itself. This gives you time to navigate to your draft or open the Binder before the clock begins.

**Sprint configuration modal:**

The modal lets you set:

- Duration (preset or custom, in minutes)
- Word count goal for the session
- Scope (current file or entire project)

Click **Launch sprint timer** to open the overlay in ready state.

**Using the floating overlay:**

| Control | Action |
|---------|--------|
| ▶ | Start or resume the sprint |
| ⏸ | Pause the sprint |
| ■ | Stop and end the sprint |

The overlay is draggable — click and drag the header to reposition it anywhere on screen. It stays on top regardless of writing mode or Focus Mode. The current countdown is also shown in the Obsidian status bar (`⏱ MM:SS`) and, when Focus Mode is active, in the focus toolbar.

When the sprint ends, a summary modal shows words written, duration, and words-per-minute. The session is logged to sprint history and optionally appended to your Daily Note.

**Settings (Settings → Sprint & goals):**

| Setting | Description |
|---------|-------------|
| Default sprint duration | Starting value in the sprint modal (minutes) |
| Default daily word goal | Target used in the Writing Dashboard and Launcher |
| Sound notifications | Play a tone when the sprint ends |
| Sprint history retention | Days to keep sprint records before purging |
| Inline goal banner | Show a progress bar below the editor toolbar when a document has a word count goal set |

---

#### Word Count Goal

A per-document word count goal can be set and tracked inline.

**To set a goal:**
- Use the command **Set word count goal** from the command palette.
- Right-click inside the editor and choose **Set word count goal** under **Writing studio options**.

When a goal is set and **Inline goal banner** is enabled, a progress bar appears below the editor toolbar showing current words, goal, and percentage. It updates in real time as you type.

---

#### Session Word Count

The status bar shows a `(+N)` delta next to the current file's word count, indicating how many words you have added since opening that file this session. The Launcher's **Today** card also shows a cumulative session total across all files opened during the current Obsidian session. Both counts reset when Obsidian restarts.

---

#### Project Word Count Goal

When an active project has a total word count goal set, a dedicated status bar item shows `{current} / {goal} project words`. This updates automatically as you write. Set a project goal in the Project modal when creating or editing a project.

---

#### Writing Dashboard

The Writing Dashboard shows session statistics (words written, sprints completed, time), sprint history, daily progress toward your goal, and per-project word counts with reading time.

**To open:** Use the command **Open writing dashboard** from the command palette, or click the **Writing dashboard** button in the Launcher panel.

---

#### Targets Dashboard

The Targets Dashboard lets you assign word count goals to individual documents in the active project's binder and track progress across the whole project at a glance. Goals can be edited inline in the table. Rows are sortable and filterable by status.

**To open:** Use the command **Open targets dashboard**, click the **Targets dashboard** button in the Launcher panel, or assign a hotkey in Settings → Hotkeys.

---

#### Daily Writing Log

The Writing Log is a sidebar panel that shows your writing history at a glance.

**To open:** Use the command **Open writing log** from the command palette, or click the **Writing log** button in the Launcher panel.

**The Writing Log shows:**
- Current streak (days in a row with at least one sprint)
- This session: total session words, sprint words, sprints completed, and minutes written
- Recent activity: a bar chart with one row per day you wrote, each showing word count, sprints completed, and a visual bar proportional to the day's output. Days with no writing are collapsed rather than shown as empty rows, so the log stays focused on the days you actually worked.

When **Append to daily note** is enabled (Settings → Writing log), a summary of each completed sprint is also appended to today's Daily Note.

---

### Getting Your Work Out

#### Export Engine

When your draft is ready, the Export Engine converts it to a finished file in your chosen format — no reformatting required.

**Supported formats:** Manuscript (HTML) · PDF · Word (.docx) · RTF · HTML · Markdown · EPUB

**To export:**
- Right-click inside the editor and choose **Export this document** under **Writing studio options**.
- Use the command **Export document** from the command palette.
- Click the **Export** button in the Launcher panel.
- Assign a hotkey to **Export document** in Settings → Hotkeys.
- Right-click a folder in the binder and choose **Export folder** to export just that part of the manuscript.

**One title names the export**

The export dialog's **Title** dropdown sets the export's filename, its title page heading, and the file's metadata in one place — the three are always identical. A whole-project or single-document export offers the project name or a title you type yourself; a folder export adds **Folder name** (the default) and **Project — folder** forms. Choosing **Type your own title** keeps Export disabled until you type one, so an export is never accidentally untitled.

The compile preview renders exactly what the dialog's current selections will produce — same documents, same headings, same title page — and when you proceed to export from the preview, your selections carry back into the dialog.

<p align="center">
  <img src="assets/export-modal-title.png" alt="The export dialog with the Title dropdown open on a folder export, showing Folder name, Project — folder, Project name, and Type your own title" width="560">
  <br>
  <em>The Title dropdown — one choice names the filename, the title page, and the file metadata.</em>
</p>

**Manuscript format**

The Manuscript format produces a self-contained HTML file formatted to industry-standard manuscript conventions:
- Courier New 12 pt, double-spaced, 1-inch margins
- Title page with the export's chosen title, author name, approximate word count, and optional contact information
- Chapter headings in uppercase, page-break before each
- Scene breaks rendered as `#` (the standard manuscript convention)

No external tools are required for manuscript export.

**Settings (Settings → Export):**

| Setting | Description |
|---------|-------------|
| Default export format | Pre-selected format in the export modal |
| Default paper size | Letter (US) or A4 |
| Export font | Font name used in PDF/DOCX output (e.g. `Georgia`) |
| Export font size | Point size for PDF/DOCX output |
| Pandoc path | Full path to the `pandoc` binary if it is not on your system PATH |
| PDF engine | Engine Pandoc uses for PDF export. **Auto** (default) picks an installed LaTeX engine — `xelatex` or `lualatex` when a custom font is set, `pdflatex` otherwise. Pin a specific engine to always use it; if a pinned engine is not installed the export fails with a message naming it rather than silently substituting another |
| PDF engine location | Folder containing the PDF engine binaries — or full path to one engine binary — when the engine is not on the system PATH. Leave blank to search the PATH plus common install locations |
| Citation style | **Author-date (Chicago)** puts `(Smith 2020)` in the text with a Works cited page; **Notes (Chicago)** turns each citation into a footnote with a Bibliography page; **Custom style file (.csl)** applies any CSL style to PDF, Word, and RTF (other formats fall back to author-date). See Sources and Citations, above |
| Custom style file | Path to a `.csl` file, inside the vault or anywhere on disk, used when the citation style is set to custom |
| EPUB language | BCP 47 language tag (e.g. `en`, `fr`, `de`) |
| EPUB include cover | Generate a text cover page when no cover image is provided |

> **Requirement:** Pandoc must be installed for PDF, DOCX, RTF, HTML, and EPUB export. Download from [pandoc.org](https://pandoc.org/installing.html). For PDF export, a LaTeX distribution (e.g. TeX Live or MiKTeX) is also required — unless the PDF engine setting is pinned to [wkhtmltopdf](https://wkhtmltopdf.org/), which renders PDFs without LaTeX. Manuscript (HTML) export does not require Pandoc.
>
> **macOS note:** apps launched from the Dock don't see the shell PATH, so a correctly installed TeX Live or Homebrew binary can still be "not found." Common install locations (`/Library/TeX/texbin`, `/opt/homebrew/bin`, `/usr/local/bin`) are searched automatically; for anything else, set the PDF engine location setting.
>
> **Font note:** the export font setting applies only to the LaTeX PDF path (`xelatex`/`lualatex`; `pdflatex` cannot apply custom fonts either). The `wkhtmltopdf` path takes its typography from Pandoc's HTML/CSS output, so the export font setting is ignored there — the plugin tells you when a font was skipped for this reason.
>
> **Formatting note:** the built-in converter used for HTML, Manuscript, and EPUB output supports headings, paragraphs, lists, blockquotes, fenced code blocks, tables, images, links, footnotes, and citations. Nested lists and setext (underline-style) headings are not converted — use a Pandoc format (PDF, DOCX, RTF) if your manuscript depends on them.

---

#### WordPress Publishing

Publish your finished draft directly to WordPress without leaving Obsidian. The modal lets you choose the target site, set the post title, status, categories, tags, excerpt, and an optional scheduled publication date.

**To publish:**
- Right-click inside the editor and choose **Publish to WordPress** under **Writing studio options**.
- Use the command **Publish to WordPress** from the command palette.
- Click the **Publish to WordPress** button in the Launcher panel.
- Assign a hotkey to **Publish to WordPress** in Settings → Hotkeys.

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

**Preserving your credentials across updates**

Writing Studio stores your WordPress site credentials in your vault's `.obsidian/plugins/writing-studio/data.json` file. Obsidian's in-app update process does not touch this file — your credentials are preserved automatically. However, if you uninstall and reinstall the plugin manually, or if a vault sync conflict overwrites `data.json`, credentials will be lost and will need to be re-entered. To avoid this, always use Obsidian's built-in Update button rather than uninstalling manually.

---

### Supporting Tools

#### Frontmatter Manager

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
| Insert citation… | Pick a source from the vault and insert a citation at the cursor |
| Split section here… | Move everything from the cursor to the end of the document into a new section placed right after this one (manuscript documents of the active project only) |
| Switch writing mode → | Open a mode-switcher menu (Draft / Edit / Review / None) |
| Typography font → | Open a font picker menu to change the typography font (visible only when Typography Mode is active) |

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
| Open outline | Open the outline of the active project: every section's synopsis, status, and words against goal |
| Insert citation | Pick a source from the vault and insert a citation at the cursor |
| Add source | Open the form that writes a citable source note into the project's Research folder |
| Split section at cursor | Move everything from the cursor to the end into a new section placed right after the current one |
| Find and replace in project | Find a word or phrase across the project's sections, replace the matches you choose, and undo the last replace |
| Rename citation key | Change a source's citation key and update every citation of it in the project |
| Publish to WordPress | Publish the current document to WordPress |
| Create new writing project | Create a new writing project |
| Open writing dashboard | Open the statistics dashboard |
| Open targets dashboard | Open the word count targets panel |
| Set word count goal | Set a per-document word count goal |
| Open folder in sidebar explorer | Search and open a vault folder in the sidebar |
| Restore previous binder layout | Put a project's folders back the way they were before the one-time folder arrangement |

---

## Settings Overview

Open via **Settings → Writing Studio**. General settings appear at the top; each other section opens as its own page. Every setting can also be found by name from Obsidian's settings search (Obsidian 1.13+).

| Section | What it controls |
|-----|-----------------|
| General | Open on startup, default project folder, author name, document type, frontmatter auto-update |
| Focus mode | Focus unit, dim opacity, font override, sidebar behavior, typewriter scroll |
| Typography | Font family, custom font name, line length, font size, line height, letter spacing, persistence |
| Sprint & goals | Sprint duration, daily goal, sound notifications, history retention, inline banner |
| Export | Format, paper size, font, font size, Pandoc path, PDF engine, PDF engine location, citation style, custom style file, EPUB language, EPUB cover |
| Writing log | Append sprint summaries to Daily Note |
| WordPress | Site credentials, default post status, wikilink handling |

---

## Ribbon Icon

Writing Studio adds a single icon to the Obsidian ribbon.

| Icon | Action |
|------|--------|
| Feather | Open the Writing Studio Launcher panel |

All other features are accessible from the Launcher panel, the command palette, context menus, or assigned hotkeys.

---

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](../../releases/latest).
2. Create the folder `<vault>/.obsidian/plugins/writing-studio/` if it does not exist.
3. Copy the three files into that folder.
4. In Obsidian, go to **Settings → Community Plugins**, find **Writing Studio**, and enable it.

> **Building from source:** Clone the repository, run `npm install`, then `npm run build`. Copy the three output files as above.

---

## Requirements

Most features work out of the box. A few require additional software for specific functions, noted below.

| Requirement | When needed |
|-------------|-------------|
| Obsidian 1.13.0 or later | Always |
| Desktop (Windows, macOS, Linux) | Always — this plugin does not run on mobile |
| Internet connection | First use of each Typography Mode font (cached after that) |
| [Pandoc](https://pandoc.org/installing.html) | Export to PDF, DOCX, RTF, HTML, EPUB |
| LaTeX (TeX Live / MiKTeX) or [wkhtmltopdf](https://wkhtmltopdf.org/) | Export to PDF only (wkhtmltopdf must be pinned in the PDF engine setting) |
| WordPress 5.6+ with REST API enabled | WordPress publishing |
| WordPress Application Password | WordPress publishing |

---

## Reporting a Bug

If something isn't working, please open an issue on GitHub:

**[Submit a bug report](https://github.com/writerP-777/obsidian-writing-studio/issues/new)**

Include the following when you report:

- Writing Studio version (visible in **Settings → Community Plugins**)
- Obsidian version (visible in **Settings → About**)
- Operating system (Windows / macOS / Linux) and version
- What you expected to happen
- What actually happened, and any steps to reproduce it

Feature requests are welcome in the same place — please label them as **[Feature Request]** in the issue title.

---

## Security

[![CodeQL](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/codeql.yml/badge.svg)](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/writerP-777/obsidian-writing-studio/badge)](https://securityscorecards.dev/viewer/?uri=github.com/writerP-777/obsidian-writing-studio)
[![OpenSSF Baseline](https://www.bestpractices.dev/projects/12832/baseline)](https://www.bestpractices.dev/projects/12832)
[![ESLint](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/eslint.yml/badge.svg)](https://github.com/writerP-777/obsidian-writing-studio/actions/workflows/eslint.yml)
[![ORCID](https://img.shields.io/badge/ORCID-0009--0009--8598--2069-brightgreen?logo=orcid&logoColor=white)](https://orcid.org/0009-0009-8598-2069)

Every push and pull request is scanned automatically:

| Tool | What it checks |
|------|----------------|
| **CodeQL** | Static analysis for security vulnerabilities (XSS, injection, unsafe patterns) in TypeScript/JavaScript source |
| **OpenSSF Scorecard** | Supply-chain security posture: dependency hygiene, branch protection, signed releases, and more |
| **ESLint** (`eslint-plugin-obsidianmd`) | Obsidian plugin guideline compliance — fails on any warning or error |

Results are published to the **Security** tab of this repository (GitHub code scanning).

For local development, a pre-commit hook runs ESLint (blocking) and a pre-push hook runs a full CodeQL scan (blocks the push if any HIGH or CRITICAL findings are present). Install the [CodeQL CLI](https://github.com/github/codeql-cli-binaries/releases) to enable local scanning (`winget install GitHub.CodeQL` on Windows).
