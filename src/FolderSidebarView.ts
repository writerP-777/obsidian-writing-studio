import {
  FuzzySuggestModal,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  TFolder,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from 'obsidian';

type SortMode = 'folders-az' | 'folders-za' | 'az' | 'za' | 'modified-new' | 'modified-old';
type MatchType = 'name' | 'content';

interface SearchResult {
  item: TFolder | TFile;
  matchType: MatchType;
  snippet?: string; // surrounding text for content matches
}

export const FOLDER_SIDEBAR_VIEW_TYPE = 'folder-sidebar-explorer-view';

// ─── View ────────────────────────────────────────────────────────────────────

export class FolderSidebarView extends ItemView {
  public rootFolder: TFolder | null = null;
  private currentFolder: TFolder | null = null;
  /** Set when the user has opened a file for preview; null means folder mode. */
  private currentFile: TFile | null = null;
  /** Paths of folders visited before the current one, oldest-first. */
  private historyStack: string[] = [];
  private searchQuery = '';
  private sortMode: SortMode = 'folders-az';
  private tooltipEl: HTMLElement | null = null;
  /**
   * null  = search not yet run (show "Searching…" if query is active)
   * array = completed results (may be empty)
   */
  private searchResults: SearchResult[] | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return FOLDER_SIDEBAR_VIEW_TYPE; }

  getDisplayText(): string {
    if (this.currentFile) return `📄 ${this.currentFile.name}`;
    if (this.currentFolder) return `📁 ${this.currentFolder.name}`;
    return 'Folder explorer';
  }

  getIcon(): string { return 'folder'; }

  onOpen(): Promise<void> {
    (this.containerEl.children[1] as HTMLElement).empty();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.hideTooltip();
    return Promise.resolve();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setRootFolder(folder: TFolder): void {
    this.rootFolder = folder;
    this.currentFolder = folder;
    this.currentFile = null;
    this.historyStack = [];
    this.searchQuery = '';
    this.searchResults = null;
    this.render();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getMainEditor() {
    // activeEditor is null when the sidebar (an ItemView) is focused — fall back
    // to scanning all open MarkdownView leaves so insertion still works.
    const active = this.app.workspace.activeEditor?.editor;
    if (active) return active;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (view instanceof MarkdownView) return view.editor;
    }
    return null;
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  private navigateTo(folder: TFolder): void {
    const current = this.currentFolder;
    if (!current) return;
    this.hideTooltip();
    this.historyStack.push(current.path);
    this.currentFolder = folder;
    this.currentFile = null;
    this.searchQuery = '';
    this.searchResults = null;
    this.render();
  }

  private openFile(file: TFile): void {
    this.hideTooltip();
    this.currentFile = file;
    this.render();
  }

  private navigateBack(): void {
    // File preview → go back to the folder that contains it (no stack change)
    if (this.currentFile) {
      this.currentFile = null;
      this.render();
      return;
    }
    if (this.historyStack.length === 0) return;
    const prevPath = this.historyStack.pop()!;
    const prev = this.app.vault.getAbstractFileByPath(prevPath);
    if (prev instanceof TFolder) {
      this.currentFolder = prev;
      this.searchQuery = '';
      this.searchResults = null;
      this.render();
    }
  }

  private navigateToRoot(): void {
    const root = this.rootFolder;
    if (!root) return;
    this.historyStack = [];
    this.currentFolder = root;
    this.currentFile = null;
    this.searchQuery = '';
    this.searchResults = null;
    this.render();
  }

  // ── Breadcrumb helpers ────────────────────────────────────────────────────

  private getPathFromRoot(): TFolder[] {
    const root = this.rootFolder;
    const current = this.currentFolder;
    if (!root || !current) return [];
    if (current.path === root.path) return [root];
    const path: TFolder[] = [];
    let node: TFolder | null = current;
    while (node !== null) {
      path.unshift(node);
      if (node.path === root.path) return path;
      node = node.parent;
    }
    return [root, current];
  }

  // ── Search helpers ────────────────────────────────────────────────────────

  private collectAllItems(folder: TFolder): (TFolder | TFile)[] {
    const results: (TFolder | TFile)[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFolder) {
          results.push(child);
          walk(child);
        } else if (child instanceof TFile) {
          results.push(child);
        }
      }
    };
    walk(folder);
    return results;
  }

  /** Remove YAML frontmatter so it doesn't generate false positives in content search. */
  private stripFrontmatter(text: string): string {
    if (!text.startsWith('---')) return text;
    const end = text.indexOf('\n---', 3);
    if (end === -1) return text;
    return text.slice(end + 4);
  }

  /** Extract ~120 chars of context around a match for the sidebar snippet. */
  private extractSnippet(text: string, matchIdx: number, matchLen: number): string {
    const half = 60;
    const start = Math.max(0, matchIdx - half);
    const end = Math.min(text.length, matchIdx + matchLen + half);
    let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '…' + snippet;
    if (end < text.length) snippet += '…';
    return snippet;
  }

  /**
   * Search by name (folders + all files) then by content (.md/.txt files),
   * always scoping from the root folder. Frontmatter is stripped before
   * content search to avoid false positives from YAML fields.
   * Name matches appear first; content-only matches follow.
   */
  private async performSearch(query: string): Promise<SearchResult[]> {
    const scope = this.rootFolder ?? this.currentFolder;
    if (!scope) return [];

    const q = query.trim().toLowerCase();
    const allItems = this.collectAllItems(scope);
    const results: SearchResult[] = [];
    const nameMatched = new Set<TFolder | TFile>();

    // Phase 1 — name matches (instant)
    for (const item of allItems) {
      if (item.name.toLowerCase().includes(q)) {
        results.push({ item, matchType: 'name' });
        nameMatched.add(item);
      }
    }

    // Phase 2 — content matches (async file reads, frontmatter stripped)
    const textFiles = allItems.filter(
      (item): item is TFile =>
        item instanceof TFile &&
        ['md', 'txt'].includes(item.extension.toLowerCase()) &&
        !nameMatched.has(item)
    );

    for (const file of textFiles) {
      try {
        const raw = await this.app.vault.read(file);
        const body = this.stripFrontmatter(raw);
        const idx = body.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const snippet = this.extractSnippet(body, idx, q.length);
          results.push({ item: file, matchType: 'content', snippet });
        }
      } catch {
        // skip unreadable files
      }
    }

    return results;
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────

  private hideTooltip(): void {
    this.tooltipEl?.remove();
    this.tooltipEl = null;
  }

  private addTooltip(itemEl: HTMLElement, item: TFolder | TFile): void {
    itemEl.addEventListener('mouseenter', () => { void this.showTooltip(item, itemEl); });
    itemEl.addEventListener('mouseleave', () => { this.hideTooltip(); });
  }

  private async showTooltip(item: TFolder | TFile, anchor: HTMLElement): Promise<void> {
    this.hideTooltip();

    const rect = anchor.getBoundingClientRect();

    // Attach to the workspace root — guaranteed to be in the right document
    // and above sidebar overflow clipping, while staying in Obsidian's DOM tree.
    const tip = this.app.workspace.containerEl.createDiv({ cls: 'ws-info-tooltip' });
    this.tooltipEl = tip;

    // Position below the item by default; clamp so it stays inside the viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = 280; // matches max-width in CSS
    const tipH = 120; // rough height estimate

    let top  = rect.bottom + 6;
    let left = rect.left;

    if (top + tipH > vh) top = rect.top - tipH - 6;  // flip above
    if (left + tipW > vw) left = vw - tipW - 8;       // clamp to right edge
    if (left < 8) left = 8;                            // clamp to left edge

    tip.style.top  = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;

    // Name
    tip.createDiv({ cls: 'ws-tooltip-name', text: item.name });
    tip.createDiv({ cls: 'ws-tooltip-divider' });

    if (item instanceof TFile) {
      // Modified date
      const modDate = new Date(item.stat.mtime);
      const modStr  = modDate.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      this.addTooltipRow(tip, 'Modified', modStr);
      this.addTooltipRow(tip, 'Size', this.formatFileSize(item.stat.size));

      // Word count — async; show placeholder then update in-place
      if (['md', 'txt'].includes(item.extension.toLowerCase())) {
        const wordRow = this.addTooltipRow(tip, 'Words', '…');
        try {
          const text = await this.app.vault.cachedRead(item);
          const body2 = this.stripFrontmatter(text);
          const words = body2.trim().length > 0
            ? body2.trim().split(/\s+/).length
            : 0;
          if (this.tooltipEl === tip) {
            const val = wordRow.querySelector('.ws-tooltip-value');
            if (val) val.textContent = words.toLocaleString();
          }
        } catch { /* leave as … */ }
      }
    } else {
      // Folder — show item counts
      let fileCount = 0;
      let folderCount = 0;
      const walk = (f: TFolder) => {
        for (const child of f.children) {
          if (child instanceof TFile) fileCount++;
          else if (child instanceof TFolder) { folderCount++; walk(child); }
        }
      };
      walk(item);
      this.addTooltipRow(tip, 'Files', fileCount.toLocaleString());
      if (folderCount > 0) {
        this.addTooltipRow(tip, 'Subfolders', folderCount.toLocaleString());
      }
    }
  }

  private addTooltipRow(container: HTMLElement, label: string, value: string): HTMLElement {
    const row = container.createDiv({ cls: 'ws-tooltip-row' });
    row.createSpan({ cls: 'ws-tooltip-label', text: label });
    row.createSpan({ cls: 'ws-tooltip-value', text: value });
    return row;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── Highlight helpers ─────────────────────────────────────────────────────

  /** Render text into container with every occurrence of lowerQuery wrapped in a <mark>. */
  private renderHighlightedText(container: HTMLElement, text: string, lowerQuery: string): void {
    const lower = text.toLowerCase();
    let last = 0;
    let idx = lower.indexOf(lowerQuery, last);

    if (idx === -1) {
      container.createSpan({ text });
      return;
    }

    while (idx !== -1) {
      if (idx > last) container.createSpan({ text: text.slice(last, idx) });
      container.createEl('mark', { cls: 'ws-search-highlight', text: text.slice(idx, idx + lowerQuery.length) });
      last = idx + lowerQuery.length;
      idx = lower.indexOf(lowerQuery, last);
    }

    if (last < text.length) container.createSpan({ text: text.slice(last) });
  }

  /**
   * Walk all text nodes inside el, wrap every match in a <mark>, and scroll
   * the first highlight into view.
   */
  private highlightTextInElement(el: HTMLElement, query: string): void {
    const q = query.toLowerCase();
    const walker = activeDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    let firstMark: Element | null = null;

    for (const textNode of textNodes) {
      const raw = textNode.textContent ?? '';
      const lower = raw.toLowerCase();
      if (!lower.includes(q)) continue;

      const parent = textNode.parentNode;
      if (!parent) continue;

      const fragment = createFragment();
      let last = 0;
      let idx = lower.indexOf(q, last);

      while (idx !== -1) {
        if (idx > last) fragment.appendChild(activeDocument.createTextNode(raw.slice(last, idx)));
        const mark = createEl('mark', { cls: 'ws-search-highlight', text: raw.slice(idx, idx + q.length) });
        fragment.appendChild(mark);
        if (!firstMark) firstMark = mark;
        last = idx + q.length;
        idx = lower.indexOf(q, last);
      }

      if (last < raw.length) fragment.appendChild(activeDocument.createTextNode(raw.slice(last)));
      parent.replaceChild(fragment, textNode);
    }

    if (firstMark) firstMark.scrollIntoView({ block: 'center' });
  }

  // ── Sort helpers ──────────────────────────────────────────────────────────

  private sortItems(items: (TFolder | TFile)[]): (TFolder | TFile)[] {
    return [...items].sort((a, b) => {
      const aIsFolder = a instanceof TFolder;
      const bIsFolder = b instanceof TFolder;

      switch (this.sortMode) {
        case 'folders-az':
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return a.name.localeCompare(b.name);
        case 'folders-za':
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return b.name.localeCompare(a.name);
        case 'az':
          return a.name.localeCompare(b.name);
        case 'za':
          return b.name.localeCompare(a.name);
        case 'modified-new': {
          const aMtime = a instanceof TFile ? a.stat.mtime : 0;
          const bMtime = b instanceof TFile ? b.stat.mtime : 0;
          return bMtime - aMtime;
        }
        case 'modified-old': {
          const aMtime = a instanceof TFile ? a.stat.mtime : 0;
          const bMtime = b instanceof TFile ? b.stat.mtime : 0;
          return aMtime - bMtime;
        }
      }
    });
  }

  private sortResults(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => {
      const aItem = a.item, bItem = b.item;
      const aIsFolder = aItem instanceof TFolder;
      const bIsFolder = bItem instanceof TFolder;

      switch (this.sortMode) {
        case 'folders-az':
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return aItem.name.localeCompare(bItem.name);
        case 'folders-za':
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return bItem.name.localeCompare(aItem.name);
        case 'az':
          return aItem.name.localeCompare(bItem.name);
        case 'za':
          return bItem.name.localeCompare(aItem.name);
        case 'modified-new': {
          const aMtime = aItem instanceof TFile ? aItem.stat.mtime : 0;
          const bMtime = bItem instanceof TFile ? bItem.stat.mtime : 0;
          return bMtime - aMtime;
        }
        case 'modified-old': {
          const aMtime = aItem instanceof TFile ? aItem.stat.mtime : 0;
          const bMtime = bItem instanceof TFile ? bItem.stat.mtime : 0;
          return aMtime - bMtime;
        }
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render(): void {
    (this.leaf as WorkspaceLeaf & { updateHeader(): void }).updateHeader();

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ws-folder-container');

    const current = this.currentFolder;
    const root = this.rootFolder;
    if (!current || !root) return;

    const canGoBack = this.currentFile !== null || this.historyStack.length > 0;

    // ── Header ──────────────────────────────────────────────────────────────
    const header = container.createDiv({ cls: 'ws-folder-header' });
    header.setText(this.currentFile ? this.currentFile.name : (current.name || '/'));

    // ── Breadcrumb ──────────────────────────────────────────────────────────
    const breadcrumb = container.createDiv({ cls: 'ws-folder-breadcrumb' });

    const pathFromRoot = this.getPathFromRoot();
    pathFromRoot.forEach((folder, index) => {
      if (index > 0) {
        breadcrumb.createSpan({ text: ' › ', cls: 'ws-breadcrumb-sep' });
      }

      // The folder segment is the "current" (rightmost, non-clickable) only when
      // we're in folder mode AND it's the last segment.
      const isLast = index === pathFromRoot.length - 1 && !this.currentFile;
      const seg = breadcrumb.createSpan({ text: folder.name || '/' });

      if (isLast) {
        seg.addClass('ws-breadcrumb-current');
      } else {
        seg.addClass('ws-breadcrumb-link');
        seg.addEventListener('click', () => {
          this.currentFolder = folder;
          this.currentFile = null;
          this.historyStack = pathFromRoot.slice(0, index).map((f) => f.path);
          this.render();
        });
      }
    });

    // When viewing a file, append its name as the final (non-clickable) breadcrumb segment
    if (this.currentFile) {
      breadcrumb.createSpan({ text: ' › ', cls: 'ws-breadcrumb-sep' });
      breadcrumb.createSpan({ text: this.currentFile.name, cls: 'ws-breadcrumb-current' });
    }

    // ── Navigation buttons ───────────────────────────────────────────────────
    const navRow = container.createDiv({ cls: 'ws-folder-nav-row' });

    if (canGoBack) {
      const backBtn = navRow.createEl('button', { text: '← back', cls: 'ws-folder-nav-btn' });
      backBtn.addEventListener('click', () => this.navigateBack());
    }

    const rootBtn = navRow.createEl('button', { text: '⌂ root', cls: 'ws-folder-nav-btn' });
    rootBtn.addEventListener('click', () => this.navigateToRoot());

    // "Insert selection" button — only in file preview mode
    if (this.currentFile) {
      const insertBtn = navRow.createEl('button', {
        text: '↩ Insert selection',
        cls: 'ws-folder-nav-btn ws-folder-insert-btn',
      });

      // Capture selection on mousedown before focus change can clear it
      let capturedText = '';
      insertBtn.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        capturedText = window.getSelection()?.toString() ?? '';
      });
      insertBtn.addEventListener('click', () => {
        if (!capturedText) return;
        const editor = this.getMainEditor();
        if (editor) {
          editor.focus();
          editor.replaceSelection(capturedText);
          capturedText = '';
        }
      });
    }

    // ── Separator ────────────────────────────────────────────────────────────
    container.createDiv({ cls: 'ws-folder-separator' });

    // ── Content area — file preview or folder list ───────────────────────────
    if (this.currentFile) {
      void this.renderFileContent(container, this.currentFile);
    } else {
      this.renderToolbar(container);
      this.renderFolderContents(container, current);
    }
  }

  // ── Toolbar (search + sort) ───────────────────────────────────────────────

  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: 'ws-folder-toolbar' });

    // Search input
    const searchWrap = toolbar.createDiv({ cls: 'ws-folder-search-wrap' });
    const searchIcon = searchWrap.createSpan({ cls: 'ws-folder-search-icon' });
    setIcon(searchIcon, 'search');

    const searchInput = searchWrap.createEl('input', {
      cls: 'ws-folder-search-input',
      type: 'text',
      placeholder: 'Search names & content… (Enter)',
    });
    searchInput.value = this.searchQuery;

    if (this.searchQuery) {
      const clearBtn = searchWrap.createSpan({ cls: 'ws-folder-search-clear', text: '×' });
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        this.searchResults = null;
        this.render();
      });
    }

    const executeSearch = async () => {
      const query = searchInput.value.trim();
      if (!query) {
        this.searchQuery = '';
        this.searchResults = null;
        this.render();
        return;
      }
      this.searchQuery = query;
      this.searchResults = null;   // null = in progress → shows "Searching…"
      this.render();
      this.searchResults = await this.performSearch(query);
      this.render();               // show completed results
    };

    // Enter executes the search; stopPropagation prevents list nav from stealing keys
    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') void executeSearch();
    });

    // Sort dropdown
    const sortSel = toolbar.createEl('select', { cls: 'ws-folder-sort-select' });
    const sortOptions: { value: SortMode; label: string }[] = [
      { value: 'folders-az',   label: 'Folders ↑ A-Z' },
      { value: 'folders-za',   label: 'Folders ↑ Z-A' },
      { value: 'az',           label: 'Name A-Z' },
      { value: 'za',           label: 'Name Z-A' },
      { value: 'modified-new', label: 'Newest first' },
      { value: 'modified-old', label: 'Oldest first' },
    ];
    for (const opt of sortOptions) {
      const el = sortSel.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.sortMode) el.selected = true;
    }
    sortSel.addEventListener('change', () => {
      this.sortMode = sortSel.value as SortMode;
      this.render();
    });
  }

  // ── File preview ──────────────────────────────────────────────────────────

  private async renderFileContent(container: HTMLElement, file: TFile): Promise<void> {
    const content = container.createDiv({ cls: 'ws-folder-content ws-folder-content-selectable' });

    const ext = file.extension.toLowerCase();

    if (ext === 'md') {
      const text = await this.app.vault.read(file);
      await MarkdownRenderer.render(this.app, text, content, file.path, this);
      if (this.searchQuery) this.highlightTextInElement(content, this.searchQuery);
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
      const img = content.createEl('img', { cls: 'ws-folder-img' });
      img.setAttribute('src', this.app.vault.getResourcePath(file));
    } else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) {
      const audio = content.createEl('audio', { cls: 'ws-folder-audio' });
      audio.setAttribute('controls', '');
      audio.setAttribute('src', this.app.vault.getResourcePath(file));
    } else {
      // Unsupported type — offer to open in the main editor
      const msg = content.createDiv({ cls: 'ws-folder-unsupported' });
      msg.setText(`No preview available for .${file.extension} files`);
      const openBtn = content.createEl('button', { cls: 'ws-folder-open-btn', text: 'Open in editor' });
      openBtn.addEventListener('click', () => {
        void this.app.workspace.getLeaf('tab').openFile(file);
      });
    }
  }

  // ── Folder list ───────────────────────────────────────────────────────────

  private renderFolderContents(container: HTMLElement, current: TFolder): void {
    const list = container.createDiv({ cls: 'ws-folder-list' });
    list.setAttribute('tabindex', '0');

    const query = this.searchQuery.trim();

    // ── Search results mode ─────────────────────────────────────────────────
    if (query) {
      if (this.searchResults === null) {
        list.createDiv({ cls: 'ws-folder-empty', text: 'Searching…' });
        return;
      }
      if (this.searchResults.length === 0) {
        list.createDiv({ cls: 'ws-folder-empty', text: `No results for "${this.searchQuery}"` });
        return;
      }

      const lowerQuery = query.toLowerCase();
      const sorted = this.sortResults(this.searchResults);

      // Root path for computing relative labels
      const rootPath = this.rootFolder
        ? (this.rootFolder.path === '/' ? '' : this.rootFolder.path + '/')
        : '';

      let focusedIndex = -1;
      const items: HTMLElement[] = [];

      for (const result of sorted) {
        const { item, matchType, snippet } = result;
        const itemEl = list.createDiv({ cls: 'ws-folder-item ws-folder-item--column' });

        // Icon + label row
        const topRow = itemEl.createDiv({ cls: 'ws-folder-item-row' });
        const iconEl = topRow.createSpan({ cls: 'ws-folder-item-icon' });

        if (item instanceof TFolder) {
          setIcon(iconEl, 'folder');
        } else {
          const ext = item.extension.toLowerCase();
          if (ext === 'md') setIcon(iconEl, 'file-text');
          else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) setIcon(iconEl, 'image');
          else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) setIcon(iconEl, 'file-audio');
          else setIcon(iconEl, 'file');
        }

        // Show path relative to root folder for non-root-level items
        const isAtRoot = item.parent?.path === (this.rootFolder?.path ?? current.path);
        const label = !isAtRoot && item.path.startsWith(rootPath)
          ? item.path.slice(rootPath.length)
          : item.name;

        const labelEl = topRow.createSpan({ cls: 'ws-folder-item-label' });
        if (matchType === 'name') {
          this.renderHighlightedText(labelEl, label, lowerQuery);
        } else {
          labelEl.setText(label);
        }

        // Content match badge
        if (matchType === 'content') {
          topRow.createSpan({ cls: 'ws-folder-match-badge', text: 'content' });
        }

        // Snippet — shows the matched text in context with highlight
        if (snippet) {
          const snippetEl = itemEl.createDiv({ cls: 'ws-folder-item-snippet' });
          this.renderHighlightedText(snippetEl, snippet, lowerQuery);
        }

        itemEl.addEventListener('click', () => {
          if (item instanceof TFolder) this.navigateTo(item);
          else if (item instanceof TFile) this.openFile(item);
        });

        this.addTooltip(itemEl, item);
        items.push(itemEl);
      }

      list.addEventListener('scroll', () => { this.hideTooltip(); });
      list.addEventListener('keydown', (e: KeyboardEvent) => {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            if (focusedIndex < items.length - 1) { focusedIndex++; applyFocus(items, focusedIndex); }
            break;
          case 'ArrowUp':
            e.preventDefault();
            if (focusedIndex > 0) { focusedIndex--; applyFocus(items, focusedIndex); }
            break;
          case 'Enter':
            e.preventDefault();
            if (focusedIndex >= 0) items[focusedIndex].click();
            break;
          case 'Backspace':
            e.preventDefault();
            this.navigateBack();
            break;
        }
      });

      return;
    }

    // ── Normal folder listing ───────────────────────────────────────────────
    const displayItems = current.children.filter(
      (c): c is TFolder | TFile => c instanceof TFolder || c instanceof TFile
    );
    const sorted = this.sortItems(displayItems);

    if (sorted.length === 0) {
      list.createDiv({ cls: 'ws-folder-empty', text: 'This folder is empty' });
      return;
    }

    let focusedIndex = -1;
    const items: HTMLElement[] = [];

    for (const child of sorted) {
      const item = list.createDiv({ cls: 'ws-folder-item' });

      const iconEl = item.createSpan({ cls: 'ws-folder-item-icon' });

      if (child instanceof TFolder) {
        setIcon(iconEl, 'folder');
      } else if (child instanceof TFile) {
        const ext = child.extension.toLowerCase();
        if (ext === 'md') setIcon(iconEl, 'file-text');
        else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) setIcon(iconEl, 'image');
        else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) setIcon(iconEl, 'file-audio');
        else setIcon(iconEl, 'file');
      }

      item.createSpan({ text: child.name });

      item.addEventListener('click', () => {
        if (child instanceof TFolder) this.navigateTo(child);
        else if (child instanceof TFile) this.openFile(child);
      });

      this.addTooltip(item, child);
      items.push(item);
    }

    list.addEventListener('scroll', () => { this.hideTooltip(); });
    list.addEventListener('keydown', (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (focusedIndex < items.length - 1) { focusedIndex++; applyFocus(items, focusedIndex); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (focusedIndex > 0) { focusedIndex--; applyFocus(items, focusedIndex); }
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0) items[focusedIndex].click();
          break;
        case 'Backspace':
          e.preventDefault();
          this.navigateBack();
          break;
      }
    });
  }
}

// ─── Focus helper ─────────────────────────────────────────────────────────────

export function applyFocus(items: HTMLElement[], index: number): void {
  items.forEach((item, i) => {
    item.toggleClass('is-keyboard-focused', i === index);
    if (i === index) item.scrollIntoView({ block: 'nearest' });
  });
}

// ─── Folder picker modal ──────────────────────────────────────────────────────

export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private onChoose: (folder: TFolder) => void;

  constructor(app: import('obsidian').App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('Type a folder name to open in sidebar explorer…');
  }

  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const walk = (folder: TFolder) => {
      folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) walk(child);
      }
    };
    walk(this.app.vault.getRoot());
    return folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path === '/' ? '/ (vault root)' : folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}
