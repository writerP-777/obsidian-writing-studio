import { ItemView, WorkspaceLeaf, TAbstractFile, TFile, TFolder, Notice, setIcon, setTooltip } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';
import { STATUS_COLORS, DocumentStatus } from '../models/BinderItem';
import { BINDER_VIEW_TYPE } from './BinderView';
import { RESERVED_PROJECT_FOLDERS } from './folderRename';
import { SiblingEntry, sortSiblings, entryDisplayName, parseBinderOrder } from './binderOrder';
import { ProjectModal } from '../modals/ProjectModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { confirmDeleteProject } from '../modals/confirmDeleteProject';
import { ControlStrip } from './ControlStrip';
import { t } from './i18n';
import { treeNavAction, parentIndex } from './treeNav';
import { applyFocus } from './FolderSidebarView';

// The frontmatter keys the tooltip surfaces, in display order.
const TOOLTIP_KEYS = ['binder-order', 'binder-status', 'binder-type', 'binder-compile', 'word-count-goal'];

// One rendered node of the manuscript tree. Metadata is read once per build
// so sorting, rendering, and the change signature all see the same snapshot.
interface TreeNode extends SiblingEntry {
  file: TFile | TFolder;
  displayName: string;
  status: DocumentStatus | null;
  compileExcluded: boolean;
  /** Raw frontmatter lines for the tooltip (documents only). */
  fmLines: string[];
  children: TreeNode[];
  /** Markdown documents in this folder's subtree (folders only). */
  mdCount: number;
}

// Read-only rendering of the active project's folder tree as the manuscript
// zone (ADR 0001, tracer slice 1 — #225). The filesystem is the only source:
// this view never writes a file, a folder, or a frontmatter key. It registers
// under the same view type as the classic binder and is chosen by the
// experimental setting at leaf creation.
export class FilesystemBinderView extends ItemView {
  private plugin: WritingStudioPlugin;
  private activeProject: WritingProject | null = null;
  private listEl: HTMLElement | null = null;
  private controlStrip: ControlStrip | null = null;
  // View-local presentation state — deliberately unpersisted in this slice.
  private collapsed = new Set<string>();
  private showCounts = true;
  private navRows: Array<{ el: HTMLElement; node: TreeNode; depth: number; hasChildren: boolean; isExpanded: boolean }> = [];
  private navFocusPath: string | null = null;
  private refreshTimer: number | null = null;
  // Serialized snapshot of everything render-relevant, so vault and metadata
  // events that changed nothing visible (e.g. body edits) skip the rebuild.
  private lastSignature = '';

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
    this.registerEvent(this.plugin.projectManager.onActiveProjectChanged(() => this.render()));
    this.registerEvent(this.plugin.projectManager.onProjectsChanged(() => this.render()));
    this.registerEvent(this.plugin.studioEvents.onModeChanged(() => this.controlStrip?.sync()));
    this.registerEvent(this.plugin.studioEvents.onFocusChanged(() => this.controlStrip?.sync()));
    this.registerEvent(this.plugin.studioEvents.onTypographyChanged(() => this.controlStrip?.sync()));
    this.registerEvent(this.plugin.studioEvents.onSprintChanged(() => this.controlStrip?.sync()));

    // Disk truth arrives as plain vault events — external changes included
    // (Windows Explorer renames surface as create+delete pairs, which is
    // exactly why rendering the filesystem needs no reconcile pass).
    this.registerEvent(this.app.vault.on('create', (f) => this.onVaultEvent(f.path)));
    this.registerEvent(this.app.vault.on('delete', (f) => this.onVaultEvent(f.path)));
    this.registerEvent(this.app.vault.on('rename', (f, oldPath) => {
      this.onVaultEvent(f.path);
      this.onVaultEvent(oldPath);
    }));
    // Frontmatter edits (binder-order, binder-status, …) change the tree
    // without any vault event; the signature check discards body-only edits.
    this.registerEvent(this.app.metadataCache.on('changed', (f) => this.onVaultEvent(f.path)));

    this.render();
  }

  private onVaultEvent(path: string): void {
    const project = this.activeProject;
    if (!project) return;
    if (path !== project.folderPath && !path.startsWith(project.folderPath + '/')) return;
    // Debounce — a folder move fires one event per descendant.
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      const tree = this.buildTree();
      const signature = this.treeSignature(tree);
      if (signature !== this.lastSignature) this.renderList(tree);
    }, 120);
  }

  private render(): void {
    this.activeProject = this.plugin.projectManager.getActiveProject();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ws-binder-container');

    this.controlStrip = new ControlStrip(this.plugin, container);

    const header = container.createDiv('ws-binder-header');

    // Project selector — identical to the classic binder's project row
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

    if (this.activeProject) {
      const project = this.activeProject;
      const editProjectBtn = projectRow.createEl('button', { cls: 'ws-binder-btn', title: t('projectModal.editTitle') });
      setIcon(editProjectBtn, 'pencil');
      editProjectBtn.onclick = () => {
        new ProjectModal(this.app, this.plugin, undefined, project).open();
      };

      const deleteProjectBtn = projectRow.createEl('button', { cls: 'ws-binder-btn', title: t('projectModal.deleteTitle') });
      setIcon(deleteProjectBtn, 'trash');
      deleteProjectBtn.onclick = () => {
        confirmDeleteProject(this.app, this.plugin, project);
      };
    }

    // Toolbar — read-only slice: creation buttons arrive with the first
    // mutation slice; here only presentation controls and the dashboard
    const toolbar = header.createDiv('ws-binder-toolbar');

    const countsBtn = toolbar.createEl('button', { cls: 'ws-binder-btn ws-fsb-counts-btn' });
    countsBtn.ariaLabel = t('binder.toggleCounts');
    setIcon(countsBtn, 'hash');
    setTooltip(countsBtn, t('binder.toggleCounts'));
    countsBtn.toggleClass('is-active', this.showCounts);
    countsBtn.onclick = () => {
      this.showCounts = !this.showCounts;
      countsBtn.toggleClass('is-active', this.showCounts);
      this.renderList(this.buildTree());
    };

    const dashBtn = toolbar.createEl('button', { cls: 'ws-binder-btn', title: t('binder.targetsDashboard') });
    setIcon(dashBtn, 'target');
    dashBtn.onclick = () => {
      new TargetsDashboardModal(this.app, this.plugin).open();
    };

    this.listEl = container.createDiv('ws-binder-list ws-fsb-list');
    this.listEl.setAttribute('tabindex', '0');
    this.listEl.setAttribute('role', 'tree');
    this.listEl.addEventListener('keydown', (e) => this.handleTreeKey(e));
    this.renderList(this.buildTree());
  }

  // ─── Tree construction ─────────────────────────────────────────────────────

  // The manuscript zone: the project folder tree minus the reserved
  // resource folders at the root (drawer — slice 2) and plugin plumbing
  // (underscore- and dot-prefixed entries) at every level.
  private buildTree(): TreeNode[] {
    const project = this.activeProject;
    if (!project) return [];
    const root = this.app.vault.getAbstractFileByPath(project.folderPath);
    if (!(root instanceof TFolder)) return [];
    return this.buildChildren(root, true);
  }

  private buildChildren(folder: TFolder, isRoot: boolean): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const child of folder.children) {
      if (child.name.startsWith('_') || child.name.startsWith('.')) continue;
      if (isRoot && child instanceof TFolder &&
          RESERVED_PROJECT_FOLDERS.some(r => r.toLowerCase() === child.name.toLowerCase())) {
        continue;
      }
      const node = this.buildNode(child);
      if (node) nodes.push(node);
    }
    return sortSiblings(nodes);
  }

  private buildNode(file: TAbstractFile): TreeNode | null {
    if (file instanceof TFolder) {
      const children = this.buildChildren(file, false);
      const entry: SiblingEntry = { name: file.name, isFolder: true, binderOrder: null };
      return {
        ...entry,
        file,
        displayName: entryDisplayName(entry),
        status: null,
        compileExcluded: false,
        fmLines: [],
        children,
        mdCount: children.reduce((n, c) => n + (c.isFolder ? c.mdCount : (c.extension === 'md' ? 1 : 0)), 0),
      };
    }
    if (!(file instanceof TFile)) return null;

    const fm = file.extension === 'md'
      ? this.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;
    const rawStatus: unknown = fm?.['binder-status'];
    const status = typeof rawStatus === 'string' && rawStatus in STATUS_COLORS
      ? (rawStatus as DocumentStatus)
      : null;
    const fmLines: string[] = [];
    for (const key of TOOLTIP_KEYS) {
      const value: unknown = fm?.[key];
      if (value === undefined || value === null) continue;
      const shown = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
      fmLines.push(`${key}: ${shown}`);
    }
    const entry: SiblingEntry = {
      name: file.name,
      isFolder: false,
      extension: file.extension,
      binderOrder: parseBinderOrder(fm?.['binder-order']),
    };
    return {
      ...entry,
      file,
      displayName: entryDisplayName(entry),
      status,
      compileExcluded: fm?.['binder-compile'] === false,
      fmLines,
      children: [],
      mdCount: 0,
    };
  }

  // Collapse state is excluded on purpose: it is view-local, and its toggles
  // re-render directly rather than through the event path this guards.
  private treeSignature(nodes: TreeNode[], depth = 0): string {
    return nodes.map(n =>
      `${depth}|${n.isFolder ? 'd' : 'f'}|${n.name}|${n.binderOrder ?? ''}|${n.status ?? ''}|${n.compileExcluded ? 'x' : ''}|${n.fmLines.join(',')}` +
      (n.children.length ? '\n' + this.treeSignature(n.children, depth + 1) : '')
    ).join('\n');
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private renderList(tree: TreeNode[]): void {
    const listEl = this.listEl;
    if (!listEl) return;
    this.lastSignature = this.treeSignature(tree);
    listEl.empty();
    this.navRows = [];

    if (!this.activeProject) {
      listEl.createDiv('ws-binder-empty').textContent = t('binder.noProjectSelected');
      return;
    }

    if (tree.length === 0) {
      listEl.createDiv('ws-binder-empty').textContent = t('binder.fsEmpty');
      return;
    }

    this.renderNodes(listEl, tree, 0);

    // Restore keyboard focus after an event-driven rebuild — only when focus
    // fell to the body, never stealing it from the editor.
    const focusIdx = this.navRows.findIndex(r => r.node.file.path === this.navFocusPath);
    if (focusIdx >= 0 && activeDocument.activeElement === activeDocument.body) {
      listEl.focus();
      applyFocus(this.navRows.map(r => r.el), focusIdx);
    }
  }

  private renderNodes(container: HTMLElement, nodes: TreeNode[], depth: number): void {
    for (const node of nodes) {
      const isExpanded = !this.collapsed.has(node.file.path);
      const row = container.createDiv({ cls: `ws-fsb-row ws-binder-depth-${depth}` });
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 1));
      if (node.children.length) row.setAttribute('aria-expanded', String(isExpanded));
      this.navRows.push({ el: row, node, depth, hasChildren: node.children.length > 0, isExpanded });

      if (depth > 0) {
        row.setCssProps({ '--ws-binder-depth': `${depth * 16 + 8}px` });
      }

      // Status stripe on the left edge — the row's only status signal
      if (node.status) {
        row.addClass('ws-fsb-has-status');
        row.setCssProps({ '--ws-status-color': STATUS_COLORS[node.status] });
      }
      // Excluded-from-compile documents and non-markdown files render dimmed:
      // both are visible disk truth that the compiled manuscript won't contain
      if (node.compileExcluded || (!node.isFolder && node.extension !== 'md')) {
        row.addClass('ws-fsb-dimmed');
      }
      if (node.isFolder) row.addClass('ws-fsb-folder');

      if (node.children.length) {
        const toggle = row.createSpan('ws-binder-toggle');
        toggle.textContent = isExpanded ? '▼' : '▶';
      } else {
        row.createSpan('ws-binder-toggle ws-binder-toggle-leaf');
      }

      row.createSpan({ cls: 'ws-fsb-title', text: node.displayName });

      if (node.isFolder && this.showCounts) {
        row.createSpan({ cls: 'ws-fsb-count', text: String(node.mdCount) });
      }

      // On-disk truth on hover: the real name (prefix and extension intact),
      // plus the raw frontmatter the binder is reading
      setTooltip(row, [node.name, ...node.fmLines].join('\n'));

      row.onclick = () => {
        this.navFocusPath = node.file.path;
        if (node.isFolder) {
          this.toggleCollapse(node.file.path);
          return;
        }
        if (node.file instanceof TFile) void this.openFile(node.file);
      };

      if (node.children.length && isExpanded) {
        this.renderNodes(container, node.children, depth + 1);
      }
    }
  }

  private toggleCollapse(path: string): void {
    if (this.collapsed.has(path)) this.collapsed.delete(path);
    else this.collapsed.add(path);
    this.renderList(this.buildTree());
  }

  private async openFile(file: TFile): Promise<void> {
    try {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    } catch (e) {
      // Non-markdown files with no registered viewer land here
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  private handleTreeKey(e: KeyboardEvent): void {
    const index = this.navRows.findIndex(r => r.node.file.path === this.navFocusPath);
    const row = index >= 0 ? this.navRows[index] : null;
    const action = treeNavAction(e.key === 'F10' && e.shiftKey ? 'ContextMenu' : e.key, row);
    if (!action) return;
    e.preventDefault();

    switch (action) {
      case 'next':
        this.focusRow(Math.min(index + 1, this.navRows.length - 1));
        break;
      case 'prev':
        this.focusRow(index <= 0 ? 0 : index - 1);
        break;
      case 'expand':
        if (row) { this.collapsed.delete(row.node.file.path); this.renderList(this.buildTree()); }
        break;
      case 'collapse':
        if (row) { this.collapsed.add(row.node.file.path); this.renderList(this.buildTree()); }
        break;
      case 'to-parent':
        this.focusRow(parentIndex(this.navRows, index));
        break;
      case 'activate':
        if (!row) break;
        if (row.node.isFolder) {
          if (row.hasChildren) this.toggleCollapse(row.node.file.path);
        } else if (row.node.file instanceof TFile) {
          void this.openFile(row.node.file);
        }
        break;
      case 'menu':
      case 'rename':
        // Mutations arrive in later slices — this view is read-only
        break;
    }
  }

  private focusRow(index: number): void {
    if (index < 0 || index >= this.navRows.length) return;
    this.navFocusPath = this.navRows[index].node.file.path;
    applyFocus(this.navRows.map(r => r.el), index);
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
  }
}
