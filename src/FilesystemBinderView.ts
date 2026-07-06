import { App, ItemView, Menu, WorkspaceLeaf, TAbstractFile, TFile, TFolder, Notice, setIcon, setTooltip, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';
import { STATUS_COLORS, DocumentStatus } from '../models/BinderItem';
import { BINDER_VIEW_TYPE } from './BinderView';
import { RESERVED_PROJECT_FOLDERS } from './folderRename';
import { SiblingEntry, sortSiblings, entryDisplayName, isHiddenName, parseBinderOrder } from './binderOrder';
import { BinderZone, DropRegion, DragSource, MoveEntry, MoveOp, dropRegion, canStartDrag, evaluateDrop, planMove } from './binderMove';
import { BinderDocType, BINDER_TYPES, ItemNameRejection, menuActionsFor, parseBinderStatus, parseBinderType, renamePrefill, renameTargetName, validateItemName } from './binderMenu';
import { ProjectModal } from '../modals/ProjectModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { TitlePromptModal } from '../modals/TitlePromptModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ExportModal } from '../modals/ExportModal';
import { confirmDeleteProject } from '../modals/confirmDeleteProject';
import { ControlStrip } from './ControlStrip';
import { openCarryOverPreview } from './carryOverBridge';
import { t } from './i18n';
import { treeNavAction, parentIndex } from './treeNav';
import { applyFocus } from './FolderSidebarView';

// The frontmatter keys the tooltip surfaces, in display order.
const TOOLTIP_KEYS = ['binder-order', 'binder-status', 'binder-type', 'binder-compile', 'word-count-goal'];

// Context-menu status entries — reuses the classic binder's labels.
const STATUS_MENU: Array<{ value: DocumentStatus; key: string }> = [
  { value: 'draft', key: 'binder.menu.setStatusDraft' },
  { value: 'in-progress', key: 'binder.menu.setStatusInProgress' },
  { value: 'complete', key: 'binder.menu.setStatusComplete' },
  { value: 'published', key: 'binder.menu.setStatusPublished' },
];

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
  docType: BinderDocType | null;
  compileExcluded: boolean;
  /** Raw frontmatter lines for the tooltip (documents only). */
  fmLines: string[];
  children: TreeNode[];
  /** Markdown documents in this folder's subtree (folders only). */
  mdCount: number;
}

// How long a drag must linger before a collapsed folder expands or a closed
// drawer tab opens (#228 hover-to-expand).
const HOVER_EXPAND_MS = 600;

const toMoveEntry = (n: TreeNode): MoveEntry => ({
  name: n.name,
  isFolder: n.isFolder,
  extension: n.extension,
  binderOrder: n.binderOrder,
  path: n.file.path,
});

// Everything one render pass needs, built in a single scan so the manuscript,
// the drawer, and the change signature all see the same snapshot.
interface BinderModel {
  manuscript: TreeNode[];
  zones: Record<DrawerZone, { folder: TFolder | null; nodes: TreeNode[]; fileCount: number }>;
}

// Live rendering of the active project's folder tree (ADR 0001, tracer
// slices 1–4 — #225–#228). The filesystem is the only source of structure;
// every mutation is a filesystem operation executed through
// fileManager.renameFile (links heal) or processFrontMatter (binder-order).
// It registers under the same view type as the classic binder and is chosen
// by the experimental setting at leaf creation.
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
  // Drag state (#227/#228): the source is plain data so a mid-drag
  // re-render (hover-to-expand) cannot invalidate it
  private dragSource: DragSource | null = null;
  private dragOverEl: HTMLElement | null = null;
  private dropRegionState: DropRegion = 'before';
  private hoverExpandTimer: number | null = null;
  private hoverExpandKey: string | null = null;
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

    // Hover-to-expand re-renders mid-drag, which replaces the source row —
    // its own dragend can no longer fire, so cleanup lives on the document.
    this.registerDomEvent(activeDocument, 'dragend', () => this.endDrag());
    this.registerDomEvent(activeDocument, 'drop', () => this.endDrag());

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

      // Quiet carry-over re-offer (#230): only surfaces while a legacy
      // _binder.json exists, independent of the one-time notice flag
      const legacyBinder = this.app.vault.getAbstractFileByPath(
        normalizePath(`${project.folderPath}/_binder.json`));
      if (legacyBinder instanceof TFile) {
        const carryOverBtn = projectRow.createEl('button', { cls: 'ws-binder-btn', title: t('binder.carryOver.action') });
        setIcon(carryOverBtn, 'import');
        carryOverBtn.onclick = () => {
          void openCarryOverPreview(this.plugin, project);
        };
      }
    }

    // Toolbar — creation targets the manuscript root (#229); presentation
    // controls and the dashboard follow
    const toolbar = header.createDiv('ws-binder-toolbar');

    const newDocBtn = toolbar.createEl('button', { cls: 'ws-binder-btn', title: t('binder.titlePrompt.heading') });
    setIcon(newDocBtn, 'file-plus');
    newDocBtn.onclick = () => this.promptCreateAtRoot(false);

    const newFolderBtn = toolbar.createEl('button', { cls: 'ws-binder-btn', title: t('binder.fs.newFolder') });
    setIcon(newFolderBtn, 'folder-plus');
    newFolderBtn.onclick = () => this.promptCreateAtRoot(true);

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
    // The empty space below the last row is the root drop target — the only
    // way to promote an item back to the top level (#228)
    this.listEl.addEventListener('dragover', (e) => this.onRootDragOver(e));
    this.listEl.addEventListener('drop', (e) => this.onRootDrop(e));

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
        docType: null,
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
    const status = parseBinderStatus(fm?.['binder-status']);
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
      docType: parseBinderType(fm?.['binder-type']),
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

    this.renderNodes(listEl, model.manuscript, 0, 'manuscript');

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
    const project = this.activeProject;

    // Prototype variant C order: the tab bar is the divider under the
    // manuscript, and the selected zone opens downward BELOW the tabs
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

      // The tab is the zone's root drop target (#228): Research accepts .md
      // documents; Exports explains its refusal (output-only). Lingering over
      // an acceptable tab opens it so subfolders become reachable.
      const zoneFolderPath = zone.folder?.path
        ?? normalizePath(`${project.folderPath}/${zoneDef.folderName}`);
      tab.addEventListener('dragover', (e) => {
        const src = this.dragSource;
        if (!src) return;
        const verdict = evaluateDrop(src, zoneFolderPath, zoneDef.zone);
        if (verdict.kind === 'refuse') return;
        e.preventDefault();
        if (verdict.kind !== 'accept') return;
        tab.addClass('ws-fsb-drop-into');
        if (!pref.open || pref.tab !== zoneDef.zone) {
          this.scheduleHoverExpand('tab:' + zoneDef.zone, () => { void this.openDrawerTab(zoneDef.zone); });
        }
      });
      tab.addEventListener('dragleave', (e) => {
        if (tab.contains(e.relatedTarget as Node)) return;
        tab.removeClass('ws-fsb-drop-into');
        this.cancelHoverExpand();
      });
      tab.addEventListener('drop', (e) => {
        const src = this.dragSource;
        if (!src) return;
        const verdict = evaluateDrop(src, zoneFolderPath, zoneDef.zone);
        if (verdict.kind === 'refuse') return;
        e.preventDefault();
        tab.removeClass('ws-fsb-drop-into');
        this.cancelHoverExpand();
        if (verdict.kind === 'notice') {
          new Notice(t(verdict.messageKey));
          return;
        }
        const group = zone.nodes.filter(n => n.file.path !== src.path).map(toMoveEntry);
        void this.executeZoneDrop(src, zoneFolderPath, group);
      });
    }

    if (pref.open) {
      const zoneDef = DRAWER_ZONES.find(z => z.zone === pref.tab) ?? DRAWER_ZONES[0];
      const zone = model.zones[zoneDef.zone];
      const panel = drawerEl.createDiv('ws-fsb-drawer-panel');
      panel.setAttribute('role', 'tree');
      if (zone.nodes.length === 0) {
        panel.createDiv('ws-binder-empty').textContent = t(zoneDef.emptyKey);
      } else {
        this.renderNodes(panel, zone.nodes, 0, zoneDef.zone);
      }
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

  // Keyboard-navigation tracking is manuscript-only: manuscript rows join
  // navRows, drawer rows are pointer-only
  private renderNodes(container: HTMLElement, nodes: TreeNode[], depth: number, zone: BinderZone): void {
    const nav = zone === 'manuscript';
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

      // Mutation surface (slice 5, #229): right-click on every zone's rows;
      // keyboard parity (Shift+F10, F2) is manuscript-only like all nav
      row.oncontextmenu = (e) => {
        e.preventDefault();
        if (nav) this.navFocusPath = node.file.path;
        this.buildContextMenu(node, zone).showAtMouseEvent(e);
      };

      // Reorder (#227) and structural moves (#228) — every zone wires drops;
      // what may start a drag or receive one is decided in binderMove
      this.wireDrag(row, node, nodes, zone);

      if (node.children.length && isExpanded) {
        this.renderNodes(container, node.children, depth + 1, zone);
      }
    }
  }

  // Drag wiring for one row (#227 reorder + #228 structural moves). What may
  // start a drag and whether a drop is accepted, refused, or explained is
  // decided by the pure helpers in binderMove; this only reads the pointer.
  private wireDrag(row: HTMLElement, node: TreeNode, siblings: TreeNode[], zone: BinderZone): void {
    const parentPath = node.file.parent?.path ?? '';

    if (canStartDrag(node, zone)) {
      row.setAttribute('draggable', 'true');
      row.ondragstart = (e) => {
        this.dragSource = {
          path: node.file.path,
          name: node.name,
          isFolder: node.isFolder,
          extension: node.extension,
          binderOrder: node.binderOrder,
          zone,
        };
        row.addClass('ws-fsb-dragging');
        e.dataTransfer?.setData('text/plain', node.file.path);
      };
    }

    // Outside the manuscript, position is meaningless (order is never
    // written there), so every drop means containment: into the folder row
    // itself, or into a document row's parent.
    const regionFor = (e: DragEvent): DropRegion => {
      if (zone !== 'manuscript') return 'into';
      const rect = row.getBoundingClientRect();
      return dropRegion(node.isFolder, e.clientY - rect.top, rect.height);
    };
    const destParentFor = (region: DropRegion): string =>
      region === 'into' && node.isFolder ? node.file.path : parentPath;

    row.ondragover = (e) => {
      const src = this.dragSource;
      if (!src || src.path === node.file.path) return;
      const region = regionFor(e);
      const verdict = evaluateDrop(src, destParentFor(region), zone);
      if (verdict.kind === 'refuse') {
        this.clearDropIndicator();
        this.cancelHoverExpand();
        return;
      }
      e.preventDefault();
      if (this.dragOverEl !== row) this.clearDropIndicator();
      this.dragOverEl = row;
      this.dropRegionState = region;
      const accepted = verdict.kind === 'accept';
      row.toggleClass('ws-fsb-drop-before', accepted && region === 'before');
      row.toggleClass('ws-fsb-drop-after', accepted && region === 'after');
      row.toggleClass('ws-fsb-drop-into', accepted && region === 'into');
      // Lingering over a collapsed folder while aiming into it expands it
      if (accepted && region === 'into' && node.isFolder && node.children.length && this.collapsed.has(node.file.path)) {
        this.scheduleHoverExpand('row:' + node.file.path, () => {
          this.collapsed.delete(node.file.path);
          this.renderList(this.buildModel());
        });
      } else {
        this.cancelHoverExpand();
      }
    };
    row.ondragleave = (e) => {
      if (!row.contains(e.relatedTarget as Node) && this.dragOverEl === row) {
        this.clearDropIndicator();
        this.cancelHoverExpand();
      }
    };
    row.ondrop = (e) => {
      const src = this.dragSource;
      if (!src || src.path === node.file.path) return;
      const region = this.dropRegionState;
      const destParent = destParentFor(region);
      const verdict = evaluateDrop(src, destParent, zone);
      if (verdict.kind === 'refuse') return;
      e.preventDefault();
      this.clearDropIndicator();
      this.cancelHoverExpand();
      if (verdict.kind === 'notice') {
        new Notice(t(verdict.messageKey));
        return;
      }
      const intoFolder = region === 'into' && node.isFolder;
      const group = (intoFolder ? node.children : siblings)
        .filter(n => n.file.path !== src.path)
        .map(toMoveEntry);
      let insertAt: number | 'end' = 'end';
      if (region !== 'into') {
        const tgtIdx = group.findIndex(m => m.path === node.file.path);
        if (tgtIdx < 0) return;
        insertAt = region === 'before' ? tgtIdx : tgtIdx + 1;
      }
      void this.executeMove(planMove(src, destParent, group, insertAt, zone === 'manuscript'));
    };
  }

  private onRootDragOver(e: DragEvent): void {
    const src = this.dragSource;
    const project = this.activeProject;
    if (!src || !project || e.target !== this.listEl) return;
    if (evaluateDrop(src, project.folderPath, 'manuscript').kind !== 'accept') return;
    e.preventDefault();
    this.clearDropIndicator();
    this.listEl?.addClass('ws-fsb-drop-root');
  }

  private onRootDrop(e: DragEvent): void {
    const src = this.dragSource;
    const project = this.activeProject;
    const model = this.model;
    this.listEl?.removeClass('ws-fsb-drop-root');
    if (!src || !project || !model || e.target !== this.listEl) return;
    if (evaluateDrop(src, project.folderPath, 'manuscript').kind !== 'accept') return;
    e.preventDefault();
    const group = model.manuscript.filter(n => n.file.path !== src.path).map(toMoveEntry);
    void this.executeMove(planMove(src, project.folderPath, group, 'end', true));
  }

  private clearDropIndicator(): void {
    this.dragOverEl?.removeClass('ws-fsb-drop-before');
    this.dragOverEl?.removeClass('ws-fsb-drop-after');
    this.dragOverEl?.removeClass('ws-fsb-drop-into');
    this.dragOverEl = null;
    this.listEl?.removeClass('ws-fsb-drop-root');
  }

  // Document-level safety net: a mid-drag re-render can replace the source
  // row, so per-row dragend cannot be relied on for cleanup.
  private endDrag(): void {
    this.dragSource = null;
    this.clearDropIndicator();
    this.cancelHoverExpand();
    this.containerEl.querySelectorAll<HTMLElement>('.ws-fsb-dragging, .ws-fsb-drop-into').forEach((el) => {
      el.removeClass('ws-fsb-dragging');
      el.removeClass('ws-fsb-drop-into');
    });
  }

  private scheduleHoverExpand(key: string, action: () => void): void {
    if (this.hoverExpandKey === key) return;
    this.cancelHoverExpand();
    this.hoverExpandKey = key;
    this.hoverExpandTimer = window.setTimeout(() => {
      this.hoverExpandTimer = null;
      this.hoverExpandKey = null;
      action();
    }, HOVER_EXPAND_MS);
  }

  private cancelHoverExpand(): void {
    if (this.hoverExpandTimer !== null) window.clearTimeout(this.hoverExpandTimer);
    this.hoverExpandTimer = null;
    this.hoverExpandKey = null;
  }

  // Opens (never toggles closed) a drawer tab — the hover-to-expand path.
  private async openDrawerTab(zone: DrawerZone): Promise<void> {
    await this.setDrawerPref({ open: true, tab: zone });
    this.renderDrawer();
  }

  // A drop on a zone tab: the zone folder may not exist yet on a young
  // project — create it, then move to its root. Research never gets order
  // writes, so the plan is the bare rename.
  private async executeZoneDrop(src: DragSource, zoneFolderPath: string, group: MoveEntry[]): Promise<void> {
    try {
      if (!(this.app.vault.getAbstractFileByPath(zoneFolderPath) instanceof TFolder)) {
        await this.app.vault.createFolder(zoneFolderPath);
      }
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
      return;
    }
    await this.executeMove(planMove(src, zoneFolderPath, group, 'end', false));
  }

  // Executes a move plan: renames go through fileManager.renameFile so links
  // heal, order writes through processFrontMatter. Re-render arrives via the
  // vault/metadata event path. A failure (e.g. a name collision at the
  // destination) stops the plan and surfaces as a notice — each rename is
  // atomic, so nothing is left half-moved.
  private async executeMove(ops: MoveOp[]): Promise<void> {
    try {
      for (const op of ops) {
        const file = this.app.vault.getAbstractFileByPath(op.path);
        if (!file) continue;
        if (op.kind === 'rename') {
          await this.app.fileManager.renameFile(file, normalizePath(op.newPath));
        } else if (file instanceof TFile) {
          await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            fm['binder-order'] = op.order;
          });
        }
      }
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
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

  // ─── Mutation surface (slice 5, #229) ──────────────────────────────────────

  // Every mutation is a filesystem or frontmatter write; the binder re-renders
  // through the vault/metadata event path, never by a manual refresh call.

  private buildContextMenu(node: TreeNode, zone: BinderZone): Menu {
    const menu = new Menu();
    const actions = new Set(menuActionsFor(node, zone));
    const doc = node.file instanceof TFile && node.extension === 'md' ? node.file : null;

    if (actions.has('rename')) {
      menu.addItem(i => i.setTitle(t('binder.menu.rename')).setIcon('pencil')
        .onClick(() => this.promptRename(node)));
    }

    // Subtree export (#232): the export modal compiles this folder's
    // documents in binder order, depth rebased to the folder
    if (actions.has('export') && node.file instanceof TFolder) {
      const folderPath = node.file.path;
      menu.addItem(i => i.setTitle(t('binder.fs.exportFolder')).setIcon('download')
        .onClick(() => { new ExportModal(this.app, this.plugin, 'project', folderPath).open(); }));
    }

    if (actions.has('status') && doc) {
      menu.addSeparator();
      for (const s of STATUS_MENU) {
        menu.addItem(i => i.setTitle(t(s.key)).setChecked(node.status === s.value)
          .onClick(() => { void this.writeDocMeta(doc, fm => { fm['binder-status'] = s.value; }); }));
      }
      if (node.status) {
        menu.addItem(i => i.setTitle(t('binder.fs.clearStatus'))
          .onClick(() => { void this.writeDocMeta(doc, fm => { delete fm['binder-status']; }); }));
      }
    }

    if (actions.has('goal') && doc) {
      menu.addSeparator();
      menu.addItem(i => i.setTitle(t('main.menu.setGoal')).setIcon('target')
        .onClick(() => { this.plugin.setWordCountGoal(doc); }));
    }

    if (actions.has('type') && doc) {
      for (const v of BINDER_TYPES) {
        menu.addItem(i => i.setTitle(t('binder.menu.changeType', { type: t(`targetsDashboard.typeLabel.${v}`) }))
          .setChecked(node.docType === v)
          .onClick(() => { void this.writeDocMeta(doc, fm => { fm['binder-type'] = v; }); }));
      }
      if (node.docType) {
        menu.addItem(i => i.setTitle(t('binder.fs.clearType'))
          .onClick(() => { void this.writeDocMeta(doc, fm => { delete fm['binder-type']; }); }));
      }
    }

    if (actions.has('compile') && doc) {
      const excluded = node.compileExcluded;
      menu.addSeparator();
      // Re-including removes the key rather than writing `true` (#229 ruling)
      menu.addItem(i => i.setTitle(t(excluded ? 'binder.fs.includeInCompile' : 'binder.fs.excludeFromCompile'))
        .setIcon(excluded ? 'file-check' : 'file-x')
        .onClick(() => { void this.writeDocMeta(doc, fm => {
          if (excluded) delete fm['binder-compile'];
          else fm['binder-compile'] = false;
        }); }));
    }

    if (actions.has('newDoc') || actions.has('newFolder')) {
      // A folder row creates inside itself; a document row creates in its
      // own parent folder (#229 ruling on "beside")
      const parent = node.file instanceof TFolder ? node.file : node.file.parent;
      if (parent) {
        menu.addSeparator();
        if (actions.has('newDoc')) {
          menu.addItem(i => i.setTitle(t('binder.titlePrompt.heading')).setIcon('file-plus')
            .onClick(() => this.promptCreate(parent, false)));
        }
        if (actions.has('newFolder')) {
          menu.addItem(i => i.setTitle(t('binder.fs.newFolder')).setIcon('folder-plus')
            .onClick(() => this.promptCreate(parent, true)));
        }
      }
    }

    if (actions.has('delete')) {
      menu.addSeparator();
      menu.addItem(i => i.setTitle(t('binder.fs.delete')).setIcon('trash')
        .onClick(() => this.confirmDelete(node)));
    }

    return menu;
  }

  private promptRename(node: TreeNode): void {
    new TitlePromptModal(
      this.app,
      t('binder.menu.rename'),
      renamePrefill(node),
      t('binder.menu.rename'),
      t('binder.deleteConfirm.cancel'),
      async (typed) => {
        const target = renameTargetName(node, typed);
        if (target === node.file.name) return;
        const siblings = (node.file.parent?.children ?? [])
          .filter(c => c !== node.file)
          .map(c => c.name);
        const verdict = validateItemName(typed, target, siblings);
        if (!verdict.ok) {
          this.rejectName(verdict.reason, target);
          return;
        }
        const parent = node.file.parent?.path ?? '';
        const newPath = parent === '' || parent === '/' ? target : `${parent}/${target}`;
        try {
          // One atomic rename; links heal, and a document's binder-order
          // rides inside the file untouched
          await this.app.fileManager.renameFile(node.file, normalizePath(newPath));
        } catch (e) {
          new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
        }
      }
    ).open();
  }

  private promptCreateAtRoot(isFolder: boolean): void {
    const project = this.activeProject;
    const root = project ? this.app.vault.getAbstractFileByPath(project.folderPath) : null;
    if (!(root instanceof TFolder)) {
      new Notice(t('binder.selectProjectFirst'));
      return;
    }
    this.promptCreate(root, isFolder);
  }

  private promptCreate(parent: TFolder, isFolder: boolean): void {
    // The prefill must itself be a valid filename (typed names are rejected,
    // never silently altered), so the time uses dots rather than colons
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join('.');
    const prefill = isFolder ? t('binder.fs.untitledFolder') : t('binder.untitledDocument', { time });
    new TitlePromptModal(
      this.app,
      isFolder ? t('binder.fs.newFolder') : t('binder.titlePrompt.heading'),
      prefill,
      t('binder.titlePrompt.create'),
      t('binder.deleteConfirm.cancel'),
      async (typed) => {
        // No order write at creation (#229 ruling): the new item lands
        // unordered in natural-sort position; order emerges on first drag
        const target = isFolder
          ? typed
          : renameTargetName({ name: '', isFolder: false, extension: 'md', binderOrder: null }, typed);
        const verdict = validateItemName(typed, target, parent.children.map(c => c.name));
        if (!verdict.ok) {
          this.rejectName(verdict.reason, target);
          return;
        }
        const path = normalizePath(`${parent.path}/${target}`);
        try {
          if (isFolder) {
            await this.app.vault.createFolder(path);
          } else {
            const created = await this.app.vault.create(path, '');
            await this.openFile(created);
          }
        } catch (e) {
          new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
        }
      }
    ).open();
  }

  private confirmDelete(node: TreeNode): void {
    const folder = node.file instanceof TFolder ? node.file : null;
    new ConfirmModal(
      this.app,
      folder ? t('binder.fs.deleteFolderTitle') : t('binder.deleteConfirm.title'),
      folder
        ? t('binder.fs.deleteFolderMessage', { name: node.displayName, count: this.countAllFiles(folder) })
        : t('binder.fs.deleteDocMessage', { name: node.displayName }),
      t('binder.deleteConfirm.delete'),
      t('binder.deleteConfirm.cancel'),
      async () => {
        try {
          // Respects the user's "Deleted files" preference
          await this.app.fileManager.trashFile(node.file);
        } catch (e) {
          new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
        }
      }
    ).open();
  }

  // Everything in the subtree goes to the trash, hidden plumbing included —
  // the confirm states the honest total, not the visible count
  private countAllFiles(folder: TFolder): number {
    let n = 0;
    for (const child of folder.children) {
      if (child instanceof TFolder) n += this.countAllFiles(child);
      else n++;
    }
    return n;
  }

  private async writeDocMeta(file: TFile, mutate: (fm: Record<string, unknown>) => void): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, mutate);
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private rejectName(reason: ItemNameRejection | undefined, target: string): void {
    const keys: Record<ItemNameRejection, string> = {
      empty: 'binder.fs.nameEmpty',
      'invalid-chars': 'binder.fs.nameInvalidChars',
      trailing: 'binder.fs.nameTrailing',
      exists: 'binder.fs.nameExists',
    };
    new Notice(t(keys[reason ?? 'empty'], { name: target }));
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
        if (row) {
          const rect = row.el.getBoundingClientRect();
          this.buildContextMenu(row.node, 'manuscript').showAtPosition({ x: rect.left, y: rect.bottom });
        }
        break;
      case 'rename':
        if (row) this.promptRename(row.node);
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
    this.cancelHoverExpand();
  }
}
