import { App, ItemView, WorkspaceLeaf, TAbstractFile, TFile, TFolder, Notice, setIcon, setTooltip } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';
import { STATUS_COLORS, DocumentStatus } from '../models/BinderItem';
import { BINDER_VIEW_TYPE } from './BinderView';
import { RESERVED_PROJECT_FOLDERS } from './folderRename';
import { SiblingEntry, sortSiblings, entryDisplayName, isHiddenName, parseBinderOrder } from './binderOrder';
import { ProjectModal } from '../modals/ProjectModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { confirmDeleteProject } from '../modals/confirmDeleteProject';
import { ControlStrip } from './ControlStrip';
import { t } from './i18n';
import { treeNavAction, parentIndex } from './treeNav';
import { applyFocus } from './FolderSidebarView';

// The frontmatter keys the tooltip surfaces, in display order.
const TOOLTIP_KEYS = ['binder-order', 'binder-status', 'binder-type', 'binder-compile', 'word-count-goal'];

// The resources zone: the reserved folders pinned below the manuscript as
// drawer tabs. On-disk folder names are fixed (RESERVED_PROJECT_FOLDERS);
// tab labels are translated UI text.
export type DrawerZone = 'research' | 'exports';

export interface BinderDrawerPref {
  open: boolean;
  tab: DrawerZone;
}

const DRAWER_ZONES: Array<{ zone: DrawerZone; folderName: string; labelKey: string; emptyKey: string }> = [
  { zone: 'research', folderName: 'Research', labelKey: 'binder.drawer.research', emptyKey: 'binder.drawer.emptyResearch' },
  { zone: 'exports', folderName: 'Exports', labelKey: 'binder.drawer.exports', emptyKey: 'binder.drawer.emptyExports' },
];

// Desktop-only members absent from the public typings: the view registry
// (which extensions have a viewer) and the system default-app opener.
interface AppInternals extends App {
  viewRegistry?: { isExtensionRegistered(ext: string): boolean };
  openWithDefaultApp?: (path: string) => Promise<void>;
}

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

// Everything one render pass needs, built in a single scan so the manuscript,
// the drawer, and the change signature all see the same snapshot.
interface BinderModel {
  manuscript: TreeNode[];
  zones: Record<DrawerZone, { folder: TFolder | null; nodes: TreeNode[]; fileCount: number }>;
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
  private drawerEl: HTMLElement | null = null;
  private model: BinderModel | null = null;
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
      const model = this.buildModel();
      if (this.modelSignature(model) !== this.lastSignature) this.renderList(model);
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
      this.renderList(this.buildModel());
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

    // Resources drawer — pinned below the manuscript list (slice 2, #226)
    this.drawerEl = container.createDiv('ws-fsb-drawer');

    this.renderList(this.buildModel());
  }

  // ─── Tree construction ─────────────────────────────────────────────────────

  // The manuscript zone is the project folder tree minus the reserved
  // resource folders at the root — those render in the drawer — and plugin
  // plumbing (underscore- and dot-prefixed entries) at every level.
  private buildModel(): BinderModel {
    const model: BinderModel = {
      manuscript: [],
      zones: {
        research: { folder: null, nodes: [], fileCount: 0 },
        exports: { folder: null, nodes: [], fileCount: 0 },
      },
    };
    const project = this.activeProject;
    if (!project) return model;
    const root = this.app.vault.getAbstractFileByPath(project.folderPath);
    if (!(root instanceof TFolder)) return model;
    model.manuscript = this.buildChildren(root, true);
    for (const { zone, folderName } of DRAWER_ZONES) {
      const folder = root.children.find((c): c is TFolder =>
        c instanceof TFolder && c.name.toLowerCase() === folderName.toLowerCase());
      if (!folder) continue;
      model.zones[zone] = {
        folder,
        nodes: this.buildChildren(folder, false),
        fileCount: this.countVisibleFiles(folder),
      };
    }
    return model;
  }

  // Drawer tab counts: every visible file in the zone's subtree, markdown or
  // not — the resource folders mostly hold non-markdown material
  private countVisibleFiles(folder: TFolder): number {
    let n = 0;
    for (const child of folder.children) {
      if (isHiddenName(child.name)) continue;
      if (child instanceof TFolder) n += this.countVisibleFiles(child);
      else n++;
    }
    return n;
  }

  private buildChildren(folder: TFolder, isRoot: boolean): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const child of folder.children) {
      if (isHiddenName(child.name)) continue;
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

  private modelSignature(model: BinderModel): string {
    return [
      this.treeSignature(model.manuscript),
      ...DRAWER_ZONES.map(({ zone }) =>
        `##${zone}|${model.zones[zone].fileCount}\n` + this.treeSignature(model.zones[zone].nodes)),
    ].join('\n');
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private renderList(model: BinderModel): void {
    const listEl = this.listEl;
    if (!listEl) return;
    this.model = model;
    this.lastSignature = this.modelSignature(model);
    listEl.empty();
    this.navRows = [];
    this.renderDrawer();

    if (!this.activeProject) {
      listEl.createDiv('ws-binder-empty').textContent = t('binder.noProjectSelected');
      return;
    }

    if (model.manuscript.length === 0) {
      listEl.createDiv('ws-binder-empty').textContent = t('binder.fsEmpty');
      return;
    }

    this.renderNodes(listEl, model.manuscript, 0);

    // Restore keyboard focus after an event-driven rebuild — only when focus
    // fell to the body, never stealing it from the editor.
    const focusIdx = this.navRows.findIndex(r => r.node.file.path === this.navFocusPath);
    if (focusIdx >= 0 && activeDocument.activeElement === activeDocument.body) {
      listEl.focus();
      applyFocus(this.navRows.map(r => r.el), focusIdx);
    }
  }

  // ─── Resources drawer (slice 2) ────────────────────────────────────────────

  private renderDrawer(): void {
    const drawerEl = this.drawerEl;
    const model = this.model;
    if (!drawerEl) return;
    drawerEl.empty();
    if (!this.activeProject || !model) return;

    const pref = this.drawerPref();

    if (pref.open) {
      const zoneDef = DRAWER_ZONES.find(z => z.zone === pref.tab) ?? DRAWER_ZONES[0];
      const zone = model.zones[zoneDef.zone];
      const panel = drawerEl.createDiv('ws-fsb-drawer-panel');
      panel.setAttribute('role', 'tree');
      if (zone.nodes.length === 0) {
        panel.createDiv('ws-binder-empty').textContent = t(zoneDef.emptyKey);
      } else {
        this.renderNodes(panel, zone.nodes, 0, false);
      }
    }

    const tabs = drawerEl.createDiv('ws-fsb-drawer-tabs');
    for (const zoneDef of DRAWER_ZONES) {
      const zone = model.zones[zoneDef.zone];
      const tab = tabs.createEl('button', { cls: 'ws-fsb-drawer-tab' });
      tab.toggleClass('is-active', pref.open && pref.tab === zoneDef.zone);
      tab.createSpan({ cls: 'ws-fsb-drawer-tab-label', text: t(zoneDef.labelKey) });
      tab.createSpan({ cls: 'ws-fsb-count', text: String(zone.fileCount) });
      // On-disk truth: the tab label is UI text, the tooltip is the folder
      setTooltip(tab, zone.folder?.name ?? zoneDef.folderName);
      tab.onclick = () => { void this.selectDrawerTab(zoneDef.zone); };
    }
  }

  // Clicking the open tab closes the drawer; any other click opens it there
  private async selectDrawerTab(zone: DrawerZone): Promise<void> {
    const pref = this.drawerPref();
    const next: BinderDrawerPref = pref.open && pref.tab === zone
      ? { ...pref, open: false }
      : { open: true, tab: zone };
    await this.setDrawerPref(next);
    this.renderDrawer();
  }

  private drawerPref(): BinderDrawerPref {
    const id = this.activeProject?.id;
    return (id ? this.plugin.settings.binderDrawer[id] : undefined) ?? { open: false, tab: 'research' };
  }

  // A view preference — persists per project in plugin settings, never in
  // the vault (ADR 0001: not manuscript state)
  private async setDrawerPref(pref: BinderDrawerPref): Promise<void> {
    const id = this.activeProject?.id;
    if (!id) return;
    this.plugin.settings.binderDrawer[id] = pref;
    await this.plugin.saveSettings();
  }

  // `nav` gates keyboard-navigation tracking: manuscript rows join navRows,
  // drawer rows are click-only in this slice
  private renderNodes(container: HTMLElement, nodes: TreeNode[], depth: number, nav = true): void {
    for (const node of nodes) {
      const isExpanded = !this.collapsed.has(node.file.path);
      const row = container.createDiv({ cls: `ws-fsb-row ws-binder-depth-${depth}` });
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 1));
      if (node.children.length) row.setAttribute('aria-expanded', String(isExpanded));
      if (nav) this.navRows.push({ el: row, node, depth, hasChildren: node.children.length > 0, isExpanded });

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
        if (nav) this.navFocusPath = node.file.path;
        if (node.isFolder) {
          this.toggleCollapse(node.file.path);
          return;
        }
        if (node.file instanceof TFile) void this.openFile(node.file);
      };

      if (node.children.length && isExpanded) {
        this.renderNodes(container, node.children, depth + 1, nav);
      }
    }
  }

  private toggleCollapse(path: string): void {
    if (this.collapsed.has(path)) this.collapsed.delete(path);
    else this.collapsed.add(path);
    this.renderList(this.buildModel());
  }

  private async openFile(file: TFile): Promise<void> {
    const internals = this.app as AppInternals;
    try {
      if (file.extension !== 'md' &&
          internals.viewRegistry?.isExtensionRegistered(file.extension) === false &&
          internals.openWithDefaultApp) {
        // Nothing inside the app can display this type — hand it to the OS
        await internals.openWithDefaultApp(file.path);
        return;
      }
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    } catch (e) {
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
        if (row) { this.collapsed.delete(row.node.file.path); this.renderList(this.buildModel()); }
        break;
      case 'collapse':
        if (row) { this.collapsed.add(row.node.file.path); this.renderList(this.buildModel()); }
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
