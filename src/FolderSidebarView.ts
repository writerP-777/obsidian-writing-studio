import {
  FuzzySuggestModal,
  ItemView,
  MarkdownRenderer,
  TFolder,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from 'obsidian';

export const FOLDER_SIDEBAR_VIEW_TYPE = 'folder-sidebar-explorer-view';

// ─── View ────────────────────────────────────────────────────────────────────

export class FolderSidebarView extends ItemView {
  public rootFolder: TFolder | null = null;
  private currentFolder: TFolder | null = null;
  /** Set when the user has opened a file for preview; null means folder mode. */
  private currentFile: TFile | null = null;
  /** Paths of folders visited before the current one, oldest-first. */
  private historyStack: string[] = [];

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

  async onClose(): Promise<void> {}

  // ── Public API ────────────────────────────────────────────────────────────

  setRootFolder(folder: TFolder): void {
    this.rootFolder = folder;
    this.currentFolder = folder;
    this.currentFile = null;
    this.historyStack = [];
    this.render();
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  private navigateTo(folder: TFolder): void {
    const current = this.currentFolder;
    if (!current) return;
    this.historyStack.push(current.path);
    this.currentFolder = folder;
    this.currentFile = null;
    this.render();
  }

  private openFile(file: TFile): void {
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
      this.render();
    }
  }

  private navigateToRoot(): void {
    const root = this.rootFolder;
    if (!root) return;
    this.historyStack = [];
    this.currentFolder = root;
    this.currentFile = null;
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

    // ── Separator ────────────────────────────────────────────────────────────
    container.createDiv({ cls: 'ws-folder-separator' });

    // ── Content area — file preview or folder list ───────────────────────────
    if (this.currentFile) {
      this.renderFileContent(container, this.currentFile);
    } else {
      this.renderFolderContents(container, current);
    }
  }

  // ── File preview ──────────────────────────────────────────────────────────

  private renderFileContent(container: HTMLElement, file: TFile): void {
    const content = container.createDiv({ cls: 'ws-folder-content' });

    const ext = file.extension.toLowerCase();

    if (ext === 'md') {
      void this.app.vault.read(file).then((text) =>
        MarkdownRenderer.render(this.app, text, content, file.path, this)
      );
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

    const children = current.children;

    if (!children || children.length === 0) {
      list.createDiv({ cls: 'ws-folder-empty', text: 'This folder is empty' });
      return;
    }

    const sorted = [...children].sort((a, b) => {
      const aFolder = a instanceof TFolder;
      const bFolder = b instanceof TFolder;
      if (aFolder && !bFolder) return -1;
      if (!aFolder && bFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    let focusedIndex = -1;
    const items: HTMLElement[] = [];

    for (const child of sorted) {
      const item = list.createDiv({ cls: 'ws-folder-item' });

      const iconEl = item.createSpan({ cls: 'ws-folder-item-icon' });

      if (child instanceof TFolder) {
        setIcon(iconEl, 'folder');
      } else if (child instanceof TFile) {
        const ext = child.extension.toLowerCase();
        if (ext === 'md') {
          setIcon(iconEl, 'file-text');
        } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
          setIcon(iconEl, 'image');
        } else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) {
          setIcon(iconEl, 'file-audio');
        } else {
          setIcon(iconEl, 'file');
        }
      }

      item.createSpan({ text: child.name });

      item.addEventListener('click', () => {
        if (child instanceof TFolder) {
          this.navigateTo(child);
        } else if (child instanceof TFile) {
          this.openFile(child);
        }
      });

      items.push(item);
    }

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
