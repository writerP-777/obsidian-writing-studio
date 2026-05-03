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
    return 'Folder Explorer';
  }

  getIcon(): string { return 'folder'; }

  async onOpen(): Promise<void> {
    (this.containerEl.children[1] as HTMLElement).empty();
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
    (this.leaf as any).updateHeader();

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.setAttribute(
      'style',
      'background:var(--background-secondary);height:100%;display:flex;flex-direction:column;overflow:hidden;',
    );

    const current = this.currentFolder;
    const root = this.rootFolder;
    if (!current || !root) return;

    const canGoBack = this.currentFile !== null || this.historyStack.length > 0;

    // ── Header ──────────────────────────────────────────────────────────────
    const header = container.createEl('div');
    header.setAttribute(
      'style',
      'font-weight:bold;font-size:1.1em;padding:12px 12px 2px 12px;color:var(--text-normal);flex-shrink:0;',
    );
    header.setText(this.currentFile ? this.currentFile.name : (current.name || '/'));

    // ── Breadcrumb ──────────────────────────────────────────────────────────
    const breadcrumb = container.createEl('div');
    breadcrumb.setAttribute(
      'style',
      'padding:4px 12px 6px 12px;font-size:var(--font-ui-small);color:var(--text-muted);display:flex;flex-wrap:wrap;align-items:center;flex-shrink:0;',
    );

    const pathFromRoot = this.getPathFromRoot();
    pathFromRoot.forEach((folder, index) => {
      if (index > 0) {
        const sep = breadcrumb.createEl('span', { text: ' › ' });
        sep.style.color = 'var(--text-muted)';
      }

      // The folder segment is the "current" (rightmost, non-clickable) only when
      // we're in folder mode AND it's the last segment.
      const isLast = index === pathFromRoot.length - 1 && !this.currentFile;
      const seg = breadcrumb.createEl('span', { text: folder.name || '/' });

      if (isLast) {
        seg.style.color = 'var(--text-normal)';
      } else {
        seg.setAttribute('style', 'color:var(--text-muted);cursor:pointer;');
        seg.addEventListener('click', () => {
          this.currentFolder = folder;
          this.currentFile = null;
          this.historyStack = pathFromRoot.slice(0, index).map((f) => f.path);
          this.render();
        });
        seg.addEventListener('mouseenter', () => { seg.style.textDecoration = 'underline'; });
        seg.addEventListener('mouseleave', () => { seg.style.textDecoration = 'none'; });
      }
    });

    // When viewing a file, append its name as the final (non-clickable) breadcrumb segment
    if (this.currentFile) {
      breadcrumb.createEl('span', { text: ' › ' }).style.color = 'var(--text-muted)';
      breadcrumb.createEl('span', { text: this.currentFile.name }).style.color = 'var(--text-normal)';
    }

    // ── Navigation buttons ───────────────────────────────────────────────────
    const navRow = container.createEl('div');
    navRow.setAttribute('style', 'padding:0 12px 8px 12px;display:flex;gap:8px;flex-shrink:0;');

    if (canGoBack) {
      const backBtn = navRow.createEl('button', { text: '← Back' });
      backBtn.setAttribute('style', 'font-size:var(--font-ui-small);padding:2px 8px;cursor:pointer;');
      backBtn.addEventListener('click', () => this.navigateBack());
    }

    const rootBtn = navRow.createEl('button', { text: '⌂ Root' });
    rootBtn.setAttribute('style', 'font-size:var(--font-ui-small);padding:2px 8px;cursor:pointer;');
    rootBtn.addEventListener('click', () => this.navigateToRoot());

    // ── Separator ────────────────────────────────────────────────────────────
    container.createEl('div').setAttribute(
      'style',
      'border-top:1px solid var(--divider-color);flex-shrink:0;',
    );

    // ── Content area — file preview or folder list ───────────────────────────
    if (this.currentFile) {
      this.renderFileContent(container, this.currentFile);
    } else {
      this.renderFolderContents(container, current);
    }
  }

  // ── File preview ──────────────────────────────────────────────────────────

  private renderFileContent(container: HTMLElement, file: TFile): void {
    const content = container.createEl('div');
    content.setAttribute('style', 'flex:1;overflow-y:auto;padding:12px;');

    const ext = file.extension.toLowerCase();

    if (ext === 'md') {
      this.app.vault.read(file).then((text) => {
        MarkdownRenderer.render(this.app, text, content, file.path, this);
      });
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
      const img = content.createEl('img');
      img.setAttribute('src', this.app.vault.getResourcePath(file));
      img.setAttribute('style', 'max-width:100%;height:auto;border-radius:4px;');
    } else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) {
      const audio = content.createEl('audio');
      audio.setAttribute('controls', '');
      audio.setAttribute('src', this.app.vault.getResourcePath(file));
      audio.setAttribute('style', 'width:100%;margin-top:8px;');
    } else {
      // Unsupported type — offer to open in the main editor
      const msg = content.createEl('div');
      msg.setAttribute(
        'style',
        'color:var(--text-muted);text-align:center;padding:24px 0;font-size:var(--font-ui-small);',
      );
      msg.setText(`No preview available for .${file.extension} files`);
      const openBtn = content.createEl('button', { text: 'Open in editor' });
      openBtn.setAttribute('style', 'display:block;margin:8px auto 0;cursor:pointer;');
      openBtn.addEventListener('click', () => {
        this.app.workspace.getLeaf('tab').openFile(file);
      });
    }
  }

  // ── Folder list ───────────────────────────────────────────────────────────

  private renderFolderContents(container: HTMLElement, current: TFolder): void {
    const list = container.createEl('div');
    list.setAttribute('tabindex', '0');
    list.setAttribute('style', 'outline:none;padding:4px 0;flex:1;overflow-y:auto;');

    const children = current.children;

    if (!children || children.length === 0) {
      const empty = list.createEl('div');
      empty.setAttribute(
        'style',
        'text-align:center;color:var(--text-muted);padding:24px 0;font-size:var(--font-ui-small);',
      );
      empty.setText('This folder is empty');
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
      const item = list.createEl('div');
      item.setAttribute(
        'style',
        'display:flex;align-items:center;gap:8px;padding:4px 12px;cursor:pointer;color:var(--text-normal);',
      );

      const iconEl = item.createEl('span');
      iconEl.setAttribute('style', 'display:flex;align-items:center;flex-shrink:0;');

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

      item.createEl('span', { text: child.name });

      item.addEventListener('mouseenter', () => {
        if (items.indexOf(item) !== focusedIndex) item.style.background = 'var(--interactive-hover)';
      });
      item.addEventListener('mouseleave', () => {
        if (items.indexOf(item) !== focusedIndex) item.style.background = '';
      });

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
    if (i === index) {
      item.style.background = 'var(--interactive-hover)';
      item.style.outline = '2px solid var(--interactive-accent)';
      item.style.outlineOffset = '-2px';
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.style.background = '';
      item.style.outline = '';
      item.style.outlineOffset = '';
    }
  });
}

// ─── Folder picker modal ──────────────────────────────────────────────────────

export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private onChoose: (folder: TFolder) => void;

  constructor(app: import('obsidian').App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('Type a folder name to open in Sidebar Explorer…');
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
