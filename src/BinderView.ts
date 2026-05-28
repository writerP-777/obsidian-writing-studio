import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, setIcon, setTooltip, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { BinderItem, STATUS_COLORS, DocumentStatus } from '../models/BinderItem';

const STATUS_DOT_KEY: Record<DocumentStatus, string> = {
  draft: 'targetsDashboard.status.draft',
  'in-progress': 'targetsDashboard.status.inProgress',
  complete: 'targetsDashboard.status.complete',
  published: 'targetsDashboard.status.published',
};
import { WritingProject } from '../models/Project';
import { ProjectModal } from '../modals/ProjectModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { PublishModal } from '../modals/PublishModal';
import { ScanFolderModal } from '../modals/ScanFolderModal';
import { t } from './i18n';

export const BINDER_VIEW_TYPE = 'writing-studio-binder';

export class BinderView extends ItemView {
  private plugin: WritingStudioPlugin;
  private activeProject: WritingProject | null = null;
  private binderItems: BinderItem[] = [];
  private dragSource: string | null = null;
  private dropZone: 'before' | 'into' | 'after' | null = null;
  private dragOverEl: HTMLElement | null = null;
  // Maps filePath → live DOM element so word counts can be patched without re-render.
  private wcElements = new Map<string, { el: HTMLElement; item: BinderItem }>();

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return BINDER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('binder.displayText');
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.activeProject = this.plugin.projectManager.getActiveProject();
    if (this.activeProject) {
      const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
      this.binderItems = binder.items;
    } else {
      this.binderItems = [];
    }
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    this.wcElements.clear();
    container.addClass('ws-binder-container');

    // Header
    const header = container.createDiv('ws-binder-header');

    // Project selector
    const projectRow = header.createDiv('ws-binder-project-row');
    const projectSel = projectRow.createEl('select', { cls: 'ws-binder-project-sel' });
    const projects = this.plugin.projectManager.getProjects();

    const noOpt = projectSel.createEl('option', { text: t('binder.selectProject') });
    noOpt.value = '';

    for (const p of projects) {
      const opt = projectSel.createEl('option', { text: p.title });
      opt.value = p.id;
      if (this.activeProject?.id === p.id) opt.selected = true;
    }

    projectSel.onchange = async () => {
      await this.plugin.projectManager.setActiveProject(projectSel.value || null);
      await this.refresh();
    };

    const newProjectBtn = projectRow.createEl('button', { cls: 'ws-binder-btn', title: t('binder.newProject') });
    setIcon(newProjectBtn, 'plus');
    newProjectBtn.onclick = () => {
      new ProjectModal(this.app, this.plugin, () => { void this.refresh(); }).open();
    };

    // Toolbar
    const toolbar = header.createDiv('ws-binder-toolbar');
    const newDocBtn = toolbar.createEl('button', {
      cls: 'ws-binder-btn',
      text: t('binder.addDocument'),
    });
    newDocBtn.onclick = async () => {
      if (!this.activeProject) {
        new Notice(t('binder.selectProjectFirst'));
        return;
      }
      await this.createNewDocument();
    };

    const scanBtn = toolbar.createEl('button', { cls: 'ws-binder-btn' });
    scanBtn.ariaLabel = t('binder.addFiles');
    setIcon(scanBtn, 'folder-sync');
    setTooltip(scanBtn, t('binder.addFiles'));
    scanBtn.onclick = async () => {
      if (!this.activeProject) {
        new Notice(t('binder.selectProjectFirst'));
        return;
      }
      await this.scanProjectFolder();
    };

    const dashBtn = toolbar.createEl('button', { cls: 'ws-binder-btn', title: t('binder.targetsDashboard') });
    setIcon(dashBtn, 'target');
    dashBtn.onclick = () => {
      new TargetsDashboardModal(this.app, this.plugin).open();
    };

    // Search
    const searchInput = header.createEl('input', {
      cls: 'ws-binder-search',
      type: 'text',
      placeholder: t('binder.searchPlaceholder'),
    });
    searchInput.oninput = () => this.filterItems(searchInput.value, container);

    // Document list
    const listEl = container.createDiv('ws-binder-list');

    if (!this.activeProject) {
      const empty = listEl.createDiv('ws-binder-empty');
      empty.textContent = t('binder.noProjectSelected');
      return;
    }

    if (this.binderItems.length === 0) {
      const empty = listEl.createDiv('ws-binder-empty');
      empty.textContent = t('binder.noDocuments');
      return;
    }

    this.renderItems(listEl, this.binderItems, 0);

    // Root append zone — visible during drag to promote/append at root level
    const rootZone = listEl.createDiv('ws-binder-root-append-zone');
    rootZone.textContent = t('binder.dropToRoot');
    rootZone.ondragover = (e) => { e.preventDefault(); rootZone.classList.add('ws-binder-root-append-active'); };
    rootZone.ondragleave = (e) => {
      if (!rootZone.contains(e.relatedTarget as Node)) rootZone.classList.remove('ws-binder-root-append-active');
    };
    rootZone.ondrop = async (e) => {
      e.preventDefault();
      rootZone.classList.remove('ws-binder-root-append-active');
      if (!this.dragSource) return;
      await this.moveItemToRoot(this.dragSource);
    };
  }

  private renderItems(container: HTMLElement, items: BinderItem[], depth: number): void {
    for (const item of items) {
      const row = container.createDiv({ cls: `ws-binder-item ws-binder-depth-${depth}` });
      row.setAttribute('data-item-id', item.id);
      row.setAttribute('draggable', 'true');

      // Indent — padding-left comes from .ws-binder-item { padding-left: var(--ws-binder-depth, 0px) } in CSS
      if (depth > 0) {
        row.setCssProps({ '--ws-binder-depth': `${depth * 16 + 8}px` });
      }

      // Collapse toggle for groups
      if (item.children?.length) {
        const toggle = row.createSpan('ws-binder-toggle');
        toggle.textContent = item.collapsed ? '▶' : '▼';
        toggle.onclick = (e) => {
          e.stopPropagation();
          item.collapsed = !item.collapsed;
          void this.saveBinder();
          this.render();
        };
      } else {
        row.createSpan('ws-binder-toggle ws-binder-toggle-leaf');
      }

      // Type icon
      const icon = row.createSpan('ws-binder-icon');
      icon.textContent = this.getTypeIcon(item.type);

      // Status dot
      const dot = row.createSpan('ws-binder-status-dot');
      dot.setCssProps({ '--ws-status-color': STATUS_COLORS[item.status] });
      dot.title = t(STATUS_DOT_KEY[item.status]);

      // Title — derive from the live filename so stale binder JSON is never shown
      const titleEl = row.createSpan('ws-binder-title');
      const liveFile = this.app.vault.getAbstractFileByPath(item.filePath);
      const displayTitle = liveFile instanceof TFile ? liveFile.basename : item.title;
      titleEl.textContent = displayTitle;
      titleEl.contentEditable = 'false';
      if (liveFile instanceof TFile && item.title !== liveFile.basename) {
        item.title = liveFile.basename;
        void this.saveBinder();
      }

      // Word count
      const wcEl = row.createSpan('ws-binder-wc');
      this.wcElements.set(item.filePath, { el: wcEl, item });
      void this.loadWordCount(item, wcEl);

      // Click to open
      row.onclick = () => this.openDocument(item);

      // Double click to rename
      titleEl.ondblclick = (e) => {
        e.stopPropagation();
        this.startRename(titleEl, item);
      };

      // Context menu
      row.oncontextmenu = (e) => {
        e.preventDefault();
        this.showContextMenu(e, item);
      };

      // Drag and drop
      row.ondragstart = (e) => {
        this.dragSource = item.id;
        row.addClass('ws-binder-dragging');
        e.dataTransfer?.setData('text/plain', item.id);
      };
      row.ondragend = () => {
        row.classList.remove('ws-binder-dragging');
        this.dragSource = null;
        this.dropZone = null;
        const container = this.containerEl.children[1] as HTMLElement;
        container.querySelectorAll('.ws-binder-drop-before,.ws-binder-drop-after,.ws-binder-drop-into,.ws-binder-root-append-active')
          .forEach(el => el.classList.remove('ws-binder-drop-before', 'ws-binder-drop-after', 'ws-binder-drop-into', 'ws-binder-root-append-active'));
        this.dragOverEl = null;
      };
      row.ondragover = (e) => {
        e.preventDefault();
        if (!this.dragSource || this.dragSource === item.id) return;
        if (this.dragOverEl && this.dragOverEl !== row) this.clearDropIndicators(this.dragOverEl);
        this.dragOverEl = row;

        const rect = row.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        this.clearDropIndicators(row);
        if (ratio < 0.30) {
          row.classList.add('ws-binder-drop-before');
          this.dropZone = 'before';
        } else if (ratio > 0.70) {
          row.classList.add('ws-binder-drop-after');
          this.dropZone = 'after';
        } else {
          row.classList.add('ws-binder-drop-into');
          this.dropZone = 'into';
        }
      };
      row.ondragleave = (e) => {
        if (!row.contains(e.relatedTarget as Node)) {
          this.clearDropIndicators(row);
          if (this.dragOverEl === row) this.dragOverEl = null;
        }
      };
      row.ondrop = async (e) => {
        e.preventDefault();
        const zone = this.dropZone;
        this.dropZone = null;
        this.clearDropIndicators(row);
        if (this.dragOverEl === row) this.dragOverEl = null;
        if (!this.dragSource || this.dragSource === item.id) return;
        if (zone === 'before') await this.moveItemBefore(this.dragSource, item.id);
        else if (zone === 'after') await this.moveItemAfter(this.dragSource, item.id);
        else await this.moveItemInto(this.dragSource, item.id);
      };

      // Render children
      if (item.children?.length && !item.collapsed) {
        this.renderItems(container, item.children, depth + 1);
      }
    }
  }

  private async loadWordCount(item: BinderItem, el: HTMLElement): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) {
      el.textContent = '0W';
      return;
    }
    const content = await this.app.vault.read(file);
    const wc = this.plugin.fmManager.countWords(content);
    const goal = item.wordCountGoal;

    if (goal) {
      const pct = Math.min(100, Math.round((wc / goal) * 100));
      el.textContent = `${wc}/${goal}`;
      el.title = t('binder.pctComplete', { pct });
    } else {
      el.textContent = t('binder.wordCountSuffix', { count: wc });
    }
  }

  // Called by the plugin's debounced word-count updater on every file change.
  // Patches only the relevant DOM span — no binder re-render needed.
  updateWordCount(filePath: string, wc: number): void {
    const entry = this.wcElements.get(filePath);
    if (!entry) return;
    const { el, item } = entry;
    const goal = item.wordCountGoal;
    if (goal && goal > 0) {
      const pct = Math.min(100, Math.round((wc / goal) * 100));
      el.textContent = `${wc}/${goal}`;
      el.title = t('binder.pctComplete', { pct });
    } else {
      el.textContent = t('binder.wordCountSuffix', { count: wc });
    }
  }

  private getTypeIcon(type: BinderItem['type']): string {
    const icons: Record<string, string> = {
      chapter: '📄',
      section: '§',
      article: '📰',
      note: '📝',
      group: '📁',
      part: '📚',
    };
    return icons[type] || '📄';
  }

  private async openDocument(item: BinderItem): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) {
      new Notice(t('binder.cannotFindFile', { filePath: item.filePath }));
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  private startRename(el: HTMLElement, item: BinderItem): void {
    el.contentEditable = 'true';
    el.focus();

    const range = activeDocument.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const commit = async () => {
      el.contentEditable = 'false';
      const newTitle = el.textContent?.trim() || item.title;
      if (newTitle !== item.title) {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (file instanceof TFile) {
          await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            fm['title'] = newTitle;
          });
          const parentPath = item.filePath.substring(0, item.filePath.lastIndexOf('/'));
          const sanitized = newTitle.replace(/[\\/:*?"<>|]/g, '-');
          const newPath = normalizePath(`${parentPath}/${sanitized}.md`);
          await this.app.fileManager.renameFile(file, newPath);
          item.filePath = newPath;
        }
        item.title = newTitle;
        await this.saveBinder();
      }
    };

    el.onblur = commit;
    el.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = item.title; el.blur(); }
    };
  }

  private showContextMenu(e: MouseEvent, item: BinderItem): void {
    const menu = new Menu();

    menu.addItem(i => i.setTitle(t('binder.menu.openDocument')).setIcon('file-text').onClick(() => { void this.openDocument(item); }));
    menu.addItem(i => i.setTitle(t('binder.menu.newChildDocument')).setIcon('plus').onClick(() => { void this.createNewDocument(item.id); }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusDraft')).onClick(() => { void this.setItemStatus(item, 'draft'); }));
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusInProgress')).onClick(() => { void this.setItemStatus(item, 'in-progress'); }));
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusComplete')).onClick(() => { void this.setItemStatus(item, 'complete'); }));
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusPublished')).onClick(() => { void this.setItemStatus(item, 'published'); }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.duplicate')).setIcon('copy').onClick(() => { void this.duplicateItem(item); }));
    menu.addItem(i => i.setTitle(t('binder.menu.moveToResearch')).setIcon('folder').onClick(() => { void this.moveToResearch(item); }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.publishToWordPress')).setIcon('globe').onClick(() => {
      new PublishModal(this.app, this.plugin, item.filePath).open();
    }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.delete')).setIcon('trash').onClick(() => { void this.deleteItem(item); }));

    menu.showAtMouseEvent(e);
  }

  private async createNewDocument(parentId?: string): Promise<void> {
    if (!this.activeProject) return;
    const title = t('binder.untitledDocument', { time: new Date().toLocaleTimeString() });
    await this.plugin.projectManager.addDocumentToBinder(
      this.activeProject,
      title,
      'chapter',
      parentId
    );
    await this.refresh();
  }

  private async setItemStatus(item: BinderItem, status: DocumentStatus): Promise<void> {
    if (!this.activeProject) return;
    await this.plugin.projectManager.updateItemStatus(this.activeProject, item.id, status);
    await this.refresh();
  }

  private async duplicateItem(item: BinderItem): Promise<void> {
    if (!this.activeProject) return;
    if (item.type === 'group' || item.type === 'part') return;
    const newTitle = `${item.title} ${t('binder.copySuffix')}`;
    const newItem = await this.plugin.projectManager.addDocumentToBinder(
      this.activeProject,
      newTitle,
      item.type
    );

    // Copy content
    const srcFile = this.app.vault.getAbstractFileByPath(item.filePath);
    const dstFile = this.app.vault.getAbstractFileByPath(newItem.filePath);
    if (srcFile instanceof TFile && dstFile instanceof TFile) {
      const content = await this.app.vault.read(srcFile);
      await this.app.vault.modify(dstFile, content);
    }

    await this.refresh();
  }

  private async moveToResearch(item: BinderItem): Promise<void> {
    if (!this.activeProject) return;
    const researchDir = normalizePath(`${this.activeProject.folderPath}/Research`);
    const fileName = item.filePath.split('/').pop() || 'note.md';
    const newPath = normalizePath(`${researchDir}/${fileName}`);
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (file instanceof TFile) {
      await this.app.vault.rename(file, newPath);
    }
    item.filePath = newPath;
    item.type = 'note';
    await this.saveBinder();
    await this.refresh();
  }

  private async deleteItem(item: BinderItem): Promise<void> {
    if (!this.activeProject) return;
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (file instanceof TFile) {
      await this.app.fileManager.trashFile(file);
    }
    await this.plugin.projectManager.removeItemFromBinder(this.activeProject, item.id);
    await this.refresh();
  }

  private clearDropIndicators(el: HTMLElement): void {
    el.classList.remove('ws-binder-drop-before', 'ws-binder-drop-after', 'ws-binder-drop-into');
  }

  private findItem(items: BinderItem[], id: string): BinderItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) { const f = this.findItem(item.children, id); if (f) return f; }
    }
    return null;
  }

  private containsItem(items: BinderItem[], id: string): boolean {
    for (const item of items) {
      if (item.id === id) return true;
      if (item.children && this.containsItem(item.children, id)) return true;
    }
    return false;
  }

  private removeFromTree(items: BinderItem[], id: string): BinderItem | null {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) return items.splice(i, 1)[0];
      if (items[i].children) { const f = this.removeFromTree(items[i].children!, id); if (f) return f; }
    }
    return null;
  }

  private async moveItemBefore(sourceId: string, targetId: string): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    const moving = this.removeFromTree(binder.items, sourceId);
    if (!moving) return;
    const insert = (items: BinderItem[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === targetId) { items.splice(i, 0, moving); return true; }
        if (items[i].children && insert(items[i].children!)) return true;
      }
      return false;
    };
    if (!insert(binder.items)) binder.items.unshift(moving);
    this.reorderItems(binder.items, 1);
    await this.plugin.projectManager.saveBinder(binder);
    await this.refresh();
  }

  private async moveItemAfter(sourceId: string, targetId: string): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    const moving = this.removeFromTree(binder.items, sourceId);
    if (!moving) return;
    const insert = (items: BinderItem[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === targetId) { items.splice(i + 1, 0, moving); return true; }
        if (items[i].children && insert(items[i].children!)) return true;
      }
      return false;
    };
    if (!insert(binder.items)) binder.items.push(moving);
    this.reorderItems(binder.items, 1);
    await this.plugin.projectManager.saveBinder(binder);
    await this.refresh();
  }

  private async moveItemInto(sourceId: string, targetId: string): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    // Prevent nesting a parent into its own descendant
    const sourceItem = this.findItem(binder.items, sourceId);
    if (sourceItem && this.containsItem(sourceItem.children || [], targetId)) return;
    const moving = this.removeFromTree(binder.items, sourceId);
    if (!moving) return;
    const addTo = (items: BinderItem[]): boolean => {
      for (const item of items) {
        if (item.id === targetId) {
          if (!item.children) item.children = [];
          item.children.push(moving);
          item.collapsed = false;
          return true;
        }
        if (item.children && addTo(item.children)) return true;
      }
      return false;
    };
    if (!addTo(binder.items)) binder.items.push(moving);
    this.reorderItems(binder.items, 1);
    await this.plugin.projectManager.saveBinder(binder);
    await this.refresh();
  }

  private async moveItemToRoot(sourceId: string): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    const moving = this.removeFromTree(binder.items, sourceId);
    if (!moving) return;
    binder.items.push(moving);
    this.reorderItems(binder.items, 1);
    await this.plugin.projectManager.saveBinder(binder);
    await this.refresh();
  }

  private reorderItems(items: BinderItem[], start: number): number {
    let order = start;
    for (const item of items) {
      item.order = order++;
      if (item.children) {
        order = this.reorderItems(item.children, 1);
      }
    }
    return order;
  }

  private filterItems(query: string, container: HTMLElement): void {
    const q = query.toLowerCase();
    const rows = container.querySelectorAll<HTMLElement>('.ws-binder-item');
    rows.forEach((row) => {
      const title = row.querySelector('.ws-binder-title')?.textContent?.toLowerCase() || '';
      row.toggleClass('ws-hidden', !(!q || title.includes(q)));
    });
  }

  async scanProjectFolder(): Promise<void> {
    if (!this.activeProject) {
      new Notice(t('binder.selectProjectFirst'));
      return;
    }

    const projectFolder = normalizePath(this.activeProject.folderPath);
    const existingPaths = new Set(
      this.plugin.projectManager.flattenBinder(this.binderItems).map(i => i.filePath)
    );

    const untracked = this.app.vault.getFiles().filter(f =>
      f.extension === 'md' &&
      f.path.startsWith(projectFolder + '/') &&
      !f.name.startsWith('_') &&
      !existingPaths.has(f.path)
    );

    if (untracked.length === 0) {
      new Notice(t('binder.noNewFiles'));
      return;
    }

    new ScanFolderModal(this.app, untracked, async (selected) => {
      if (selected.length === 0) return;
      if (!this.activeProject) return;
      const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
      let order = binder.items.length + 1;
      for (const file of selected) {
        binder.items.push({
          id: `item-${Date.now()}-${order}`,
          title: file.basename,
          filePath: file.path,
          type: this.plugin.settings.defaultDocumentType,
          order: order++,
          status: 'draft',
          includeInExport: true,
          wordCountGoal: 0,
        });
      }
      await this.plugin.projectManager.saveBinder(binder);
      await this.refresh();
    }).open();
  }

  private async saveBinder(): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    binder.items = this.binderItems;
    await this.plugin.projectManager.saveBinder(binder);
  }

  async onClose(): Promise<void> {
    // cleanup
  }
}
