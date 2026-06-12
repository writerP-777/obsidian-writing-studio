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
import { ConfirmModal } from '../modals/ConfirmModal';
import { t } from './i18n';
import { safeHandler } from './safeHandler';
import { computeBinderFilter, BinderFilterResult } from './binderFilter';
import { treeNavAction, parentIndex } from './treeNav';
import { applyFocus } from './FolderSidebarView';

export const BINDER_VIEW_TYPE = 'writing-studio-binder';

export class BinderView extends ItemView {
  private plugin: WritingStudioPlugin;
  private activeProject: WritingProject | null = null;
  private binderItems: BinderItem[] = [];
  private dragSource: string | null = null;
  private dropZone: 'before' | 'into' | 'after' | null = null;
  private dragOverEl: HTMLElement | null = null;
  // Maps filePath → live DOM elements so word counts can be patched without
  // re-render. One file can back several binder items, hence the array.
  private wcElements = new Map<string, Array<{ el: HTMLElement; item: BinderItem }>>();
  private searchQuery = '';
  private listEl: HTMLElement | null = null;
  // Non-null while a search is active — computed from the data model so
  // matches inside collapsed groups are found and their ancestors expanded.
  private filterSets: BinderFilterResult | null = null;
  // Visible rows in visual order, rebuilt on every list render — the flat
  // sequence keyboard navigation moves through.
  private navRows: Array<{ el: HTMLElement; item: BinderItem; depth: number; hasChildren: boolean; isExpanded: boolean }> = [];
  // Item id of the keyboard-focused row, so focus survives event-driven
  // re-renders (every expand/collapse rebuilds the DOM).
  private navFocusItemId: string | null = null;

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
    this.registerEvent(this.plugin.projectManager.onActiveProjectChanged(() => {
      void this.refresh();
    }));
    this.registerEvent(this.plugin.projectManager.onBinderChanged((binder) => {
      if (binder.projectId === this.activeProject?.id) void this.refresh();
    }));
    this.registerEvent(this.plugin.projectManager.onProjectsChanged(() => {
      void this.refresh();
    }));
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.activeProject = this.plugin.projectManager.getActiveProject();
    if (this.activeProject) {
      const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
      this.binderItems = binder.items;
      await this.syncDriftedTitles();
    } else {
      this.binderItems = [];
    }
    this.render();
  }

  // Align binder titles with live filenames once per refresh — doing this
  // during render() fired a concurrent saveBinder() per drifted row
  private async syncDriftedTitles(): Promise<void> {
    let drifted = false;
    const walk = (items: BinderItem[]) => {
      for (const item of items) {
        const live = this.app.vault.getAbstractFileByPath(item.filePath);
        if (live instanceof TFile && item.title !== live.basename) {
          item.title = live.basename;
          drifted = true;
        }
        if (item.children) walk(item.children);
      }
    };
    walk(this.binderItems);
    if (drifted) await this.saveBinder();
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
    };

    const newProjectBtn = projectRow.createEl('button', { cls: 'ws-binder-btn', title: t('binder.newProject') });
    setIcon(newProjectBtn, 'plus');
    newProjectBtn.onclick = () => {
      new ProjectModal(this.app, this.plugin).open();
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

    // Search — re-renders only the list so the input keeps focus while typing
    const searchInput = header.createEl('input', {
      cls: 'ws-binder-search',
      type: 'text',
      placeholder: t('binder.searchPlaceholder'),
    });
    searchInput.value = this.searchQuery;
    searchInput.oninput = () => {
      this.searchQuery = searchInput.value;
      this.renderList();
    };

    // Document list — the list container holds DOM focus; rows carry a
    // visual focus class (same pattern as the folder sidebar listing)
    this.listEl = container.createDiv('ws-binder-list');
    this.listEl.setAttribute('tabindex', '0');
    this.listEl.setAttribute('role', 'tree');
    this.listEl.addEventListener('keydown', (e) => this.handleTreeKey(e));
    this.renderList();
  }

  private handleTreeKey(e: KeyboardEvent): void {
    // Never intercept keys meant for the inline-rename editor
    if (e.target instanceof HTMLElement && e.target.isContentEditable) return;

    const index = this.navRows.findIndex(r => r.item.id === this.navFocusItemId);
    const row = index >= 0 ? this.navRows[index] : null;
    const action = treeNavAction(e.key === 'F10' && e.shiftKey ? 'ContextMenu' : e.key, row);
    if (!action) return;
    e.preventDefault();

    switch (action) {
      case 'next':
        this.focusRow(Math.min(index + 1, this.navRows.length - 1));
        break;
      case 'prev':
        // First arrow press with nothing focused lands on the first row
        this.focusRow(index <= 0 ? 0 : index - 1);
        break;
      case 'expand':
        if (row) { row.item.collapsed = false; void this.saveBinder(); }
        break;
      case 'collapse':
        if (row) { row.item.collapsed = true; void this.saveBinder(); }
        break;
      case 'to-parent':
        this.focusRow(parentIndex(this.navRows, index));
        break;
      case 'activate':
        if (!row) break;
        if (row.hasChildren) {
          row.item.collapsed = !row.item.collapsed;
          void this.saveBinder();
        } else {
          void this.openDocument(row.item);
        }
        break;
      case 'menu':
        if (row) {
          const rect = row.el.getBoundingClientRect();
          this.buildContextMenu(row.item).showAtPosition({ x: rect.left, y: rect.bottom });
        }
        break;
    }
  }

  private focusRow(index: number): void {
    if (index < 0 || index >= this.navRows.length) return;
    this.navFocusItemId = this.navRows[index].item.id;
    applyFocus(this.navRows.map(r => r.el), index);
  }

  private renderList(): void {
    const listEl = this.listEl;
    if (!listEl) return;
    listEl.empty();
    this.wcElements.clear();
    this.navRows = [];

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

    const query = this.searchQuery.trim();
    this.filterSets = query ? computeBinderFilter(this.binderItems, query) : null;

    if (this.filterSets && this.filterSets.visible.size === 0) {
      const empty = listEl.createDiv('ws-binder-empty');
      empty.textContent = t('binder.noMatches', { query });
      return;
    }

    this.renderItems(listEl, this.binderItems, 0);

    // Restore keyboard focus after an event-driven rebuild (expand/collapse,
    // reorder). Only when focus fell to the body — never steal it from the
    // search input or the editor.
    const focusIdx = this.navRows.findIndex(r => r.item.id === this.navFocusItemId);
    if (focusIdx >= 0 && activeDocument.activeElement === activeDocument.body) {
      listEl.focus();
      applyFocus(this.navRows.map(r => r.el), focusIdx);
    }

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
      const filter = this.filterSets;
      if (filter && !filter.visible.has(item.id)) continue;
      // During a search, ancestors of matches render expanded even if collapsed
      const isExpanded = filter
        ? filter.expanded.has(item.id) || !item.collapsed
        : !item.collapsed;

      const row = container.createDiv({ cls: `ws-binder-item ws-binder-depth-${depth}` });
      row.setAttribute('data-item-id', item.id);
      row.setAttribute('draggable', 'true');
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 1));
      if (item.children?.length) row.setAttribute('aria-expanded', String(isExpanded));
      this.navRows.push({ el: row, item, depth, hasChildren: !!item.children?.length, isExpanded });

      // Indent — padding-left comes from .ws-binder-item { padding-left: var(--ws-binder-depth, 0px) } in CSS
      if (depth > 0) {
        row.setCssProps({ '--ws-binder-depth': `${depth * 16 + 8}px` });
      }

      // Collapse toggle for groups
      if (item.children?.length) {
        const toggle = row.createSpan('ws-binder-toggle');
        toggle.textContent = isExpanded ? '▼' : '▶';
        toggle.onclick = (e) => {
          e.stopPropagation();
          item.collapsed = !item.collapsed;
          void this.saveBinder();
        };
      } else {
        row.createSpan('ws-binder-toggle ws-binder-toggle-leaf');
      }

      // Type icon
      setIcon(row.createSpan('ws-binder-icon'), this.getTypeIcon(item.type));

      // Status dot
      const dot = row.createSpan('ws-binder-status-dot');
      dot.setCssProps({ '--ws-status-color': STATUS_COLORS[item.status] });
      dot.title = t(STATUS_DOT_KEY[item.status]);

      // Title — refresh() has already synced drifted titles with live filenames
      const titleEl = row.createSpan('ws-binder-title');
      titleEl.textContent = item.title;
      titleEl.contentEditable = 'false';

      // Word count
      const wcEl = row.createSpan('ws-binder-wc');
      const wcEntries = this.wcElements.get(item.filePath) ?? [];
      wcEntries.push({ el: wcEl, item });
      this.wcElements.set(item.filePath, wcEntries);
      void this.loadWordCount(item, wcEl);

      // Click to open — slightly delayed so the first click of a rename
      // double-click does not navigate away before editing starts
      let clickTimer: number | null = null;
      row.onclick = () => {
        // Keep keyboard position in sync with mouse interaction
        this.navFocusItemId = item.id;
        if (clickTimer !== null) return;
        clickTimer = window.setTimeout(() => {
          clickTimer = null;
          void this.openDocument(item);
        }, 250);
      };

      // Double click to rename
      titleEl.ondblclick = (e) => {
        e.stopPropagation();
        if (clickTimer !== null) {
          window.clearTimeout(clickTimer);
          clickTimer = null;
        }
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
      if (item.children?.length && isExpanded) {
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
    const content = await this.app.vault.cachedRead(file);
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
    const entries = this.wcElements.get(filePath);
    if (!entries) return;
    for (const { el, item } of entries) {
      const goal = item.wordCountGoal;
      if (goal && goal > 0) {
        const pct = Math.min(100, Math.round((wc / goal) * 100));
        el.textContent = `${wc}/${goal}`;
        el.title = t('binder.pctComplete', { pct });
      } else {
        el.textContent = t('binder.wordCountSuffix', { count: wc });
      }
    }
  }

  // Lucide icon names — emoji clashed with the icon language everywhere else
  private getTypeIcon(type: BinderItem['type']): string {
    const icons: Record<string, string> = {
      chapter: 'file-text',
      section: 'pilcrow',
      article: 'newspaper',
      note: 'sticky-note',
      group: 'folder',
      part: 'library',
    };
    return icons[type] || 'file-text';
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
      if (newTitle === item.title) return;
      try {
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
      } catch (e) {
        // Rename failed (target exists, illegal name) — without this the UI
        // shows the new title while the file keeps the old name
        el.textContent = item.title;
        new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
      }
    };

    el.onblur = () => { void commit(); };
    el.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = item.title; el.blur(); }
    };
  }

  private showContextMenu(e: MouseEvent, item: BinderItem): void {
    this.buildContextMenu(item).showAtMouseEvent(e);
  }

  private buildContextMenu(item: BinderItem): Menu {
    const menu = new Menu();

    menu.addItem(i => i.setTitle(t('binder.menu.openDocument')).setIcon('file-text').onClick(safeHandler(() => this.openDocument(item))));
    menu.addItem(i => i.setTitle(t('binder.menu.newChildDocument')).setIcon('plus').onClick(safeHandler(() => this.createNewDocument(item.id))));
    menu.addSeparator();
    // Keyboard-accessible reorder — drag-and-drop was the only mechanism
    menu.addItem(i => i.setTitle(t('binder.menu.moveUp')).setIcon('arrow-up').onClick(safeHandler(() => this.nudgeItem(item, -1))));
    menu.addItem(i => i.setTitle(t('binder.menu.moveDown')).setIcon('arrow-down').onClick(safeHandler(() => this.nudgeItem(item, 1))));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusDraft')).onClick(safeHandler(() => this.setItemStatus(item, 'draft'))));
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusInProgress')).onClick(safeHandler(() => this.setItemStatus(item, 'in-progress'))));
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusComplete')).onClick(safeHandler(() => this.setItemStatus(item, 'complete'))));
    menu.addItem(i => i.setTitle(t('binder.menu.setStatusPublished')).onClick(safeHandler(() => this.setItemStatus(item, 'published'))));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.duplicate')).setIcon('copy').onClick(safeHandler(() => this.duplicateItem(item))));
    menu.addItem(i => i.setTitle(t('binder.menu.moveToResearch')).setIcon('folder').onClick(safeHandler(() => this.moveToResearch(item))));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.publishToWordPress')).setIcon('globe').onClick(() => {
      new PublishModal(this.app, this.plugin, item.filePath).open();
    }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('binder.menu.delete')).setIcon('trash').onClick(() => this.deleteItem(item)));

    return menu;
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
  }

  private async setItemStatus(item: BinderItem, status: DocumentStatus): Promise<void> {
    if (!this.activeProject) return;
    await this.plugin.projectManager.updateItemStatus(this.activeProject, item.id, status);
  }

  private async duplicateItem(item: BinderItem): Promise<void> {
    if (!this.activeProject) return;
    if (item.type === 'group' || item.type === 'part') return;
    const newTitle = `${item.title} ${t('binder.copySuffix')}`;

    // Pass the source content in so the file is written once
    const srcFile = this.app.vault.getAbstractFileByPath(item.filePath);
    const content = srcFile instanceof TFile
      ? await this.app.vault.read(srcFile)
      : undefined;

    const newItem = await this.plugin.projectManager.addDocumentToBinder(
      this.activeProject,
      newTitle,
      item.type,
      undefined,
      content
    );

    // Carry over metadata — a duplicate previously reset status, word count
    // goal, and export inclusion to defaults
    newItem.status = item.status;
    newItem.wordCountGoal = item.wordCountGoal;
    newItem.includeInExport = item.includeInExport;
    await this.saveBinder();
  }

  private async moveToResearch(item: BinderItem): Promise<void> {
    if (!this.activeProject) return;
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) {
      // Do not mutate the binder when the move cannot happen — the old code
      // pointed the item at a path no file was ever moved to
      new Notice(t('binder.fileNotFound', { path: item.filePath }));
      return;
    }
    const researchDir = normalizePath(`${this.activeProject.folderPath}/Research`);
    if (!this.app.vault.getAbstractFileByPath(researchDir)) {
      // Research/ is only guaranteed at project creation; the user may have deleted it
      await this.app.vault.createFolder(researchDir);
    }
    const fileName = item.filePath.split('/').pop() || 'note.md';
    const newPath = normalizePath(`${researchDir}/${fileName}`);
    await this.app.vault.rename(file, newPath);
    item.filePath = newPath;
    item.type = 'note';
    await this.saveBinder();
  }

  private deleteItem(item: BinderItem): void {
    const project = this.activeProject;
    if (!project) return;
    // The file is recoverable from the trash, but the binder entry (status,
    // goal, position) is not — confirm before destroying it
    new ConfirmModal(
      this.app,
      t('binder.deleteConfirm.title'),
      t('binder.deleteConfirm.message', { title: item.title }),
      t('binder.deleteConfirm.delete'),
      t('binder.deleteConfirm.cancel'),
      async () => {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (file instanceof TFile) {
          await this.app.fileManager.trashFile(file);
        }
        await this.plugin.projectManager.removeItemFromBinder(project, item.id);
      }
    ).open();
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
  }

  // Swap an item with its previous/next sibling
  private async nudgeItem(item: BinderItem, delta: -1 | 1): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    const siblings = this.findSiblings(binder.items, item.id);
    if (!siblings) return;
    const idx = siblings.findIndex(i => i.id === item.id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= siblings.length) return;
    [siblings[idx], siblings[target]] = [siblings[target], siblings[idx]];
    this.reorderItems(binder.items, 1);
    await this.plugin.projectManager.saveBinder(binder);
  }

  private findSiblings(items: BinderItem[], id: string): BinderItem[] | null {
    if (items.some(i => i.id === id)) return items;
    for (const item of items) {
      if (item.children) {
        const found = this.findSiblings(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private async moveItemToRoot(sourceId: string): Promise<void> {
    if (!this.activeProject) return;
    const binder = await this.plugin.projectManager.loadBinder(this.activeProject);
    const moving = this.removeFromTree(binder.items, sourceId);
    if (!moving) return;
    binder.items.push(moving);
    this.reorderItems(binder.items, 1);
    await this.plugin.projectManager.saveBinder(binder);
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
