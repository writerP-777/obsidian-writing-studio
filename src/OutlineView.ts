import { ItemView, WorkspaceLeaf, TFile, Notice, setIcon, setTooltip } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { buildManuscriptTree, ManuscriptNode } from './manuscriptTree';
import {
  buildOutlineRows, visibleRows, filterRowsByStatus, outlineTotals, outlineToMarkdown,
  progressPercent, OutlineRow, StatusFilter,
} from './outlineModel';
import { SYNOPSIS_KEY, normalizeSynopsis, parseBinderStatus } from './binderMenu';
import { STATUS_COLORS, DocumentStatus, DOCUMENT_STATUSES } from '../models/BinderItem';
import { countWords } from './words';
import { safeHandler } from './safeHandler';
import { t } from './i18n';

export const OUTLINE_VIEW_TYPE = 'writing-studio-outline';

// Status labels are shared with the targets dashboard so the two surfaces
// never disagree on wording.
const STATUS_LABEL_KEY: Record<DocumentStatus, string> = {
  draft: 'targetsDashboard.status.draft',
  'in-progress': 'targetsDashboard.status.inProgress',
  complete: 'targetsDashboard.status.complete',
  published: 'targetsDashboard.status.published',
};

// How long a burst of vault/metadata events settles before the outline
// rebuilds — a folder move fires one event per descendant.
const REFRESH_DEBOUNCE_MS = 150;

interface WordCacheEntry {
  mtime: number;
  size: number;
  words: number;
}

// The outline: the active project's manuscript zone as an editable table —
// every section's synopsis, status, and words against goal, with folder
// rows carrying subtree totals. For nonfiction this is the working outline
// of the argument. Rows come from outlineModel (pure); this view reads
// files for word counts, renders, and writes frontmatter through the same
// API the binder's own actions use, so the two can never disagree.
export class OutlineView extends ItemView {
  private plugin: WritingStudioPlugin;
  private nodes: ManuscriptNode[] = [];
  private rows: OutlineRow[] = [];
  private collapsed = new Set<string>();
  private statusFilter: StatusFilter = 'all';
  // Word counts keyed by path, invalidated by mtime+size so an unchanged
  // file is never re-read on a refresh.
  private wordCache = new Map<string, WordCacheEntry>();
  private refreshTimer: number | null = null;
  // A synopsis box with focus must not be torn out from under the writer by
  // an event-driven rebuild; the rebuild waits for blur.
  private editing = false;
  private pendingRefresh = false;
  private tableHost: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return OUTLINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('outline.displayText');
  }

  getIcon(): string {
    return 'list-tree';
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.plugin.projectManager.onActiveProjectChanged(() => { void this.refresh(); }));
    this.registerEvent(this.plugin.projectManager.onProjectsChanged(() => { void this.refresh(); }));
    this.registerEvent(this.app.vault.on('create', (f) => this.onVaultEvent(f.path)));
    this.registerEvent(this.app.vault.on('delete', (f) => this.onVaultEvent(f.path)));
    this.registerEvent(this.app.vault.on('rename', (f, oldPath) => {
      this.onVaultEvent(f.path);
      this.onVaultEvent(oldPath);
    }));
    this.registerEvent(this.app.metadataCache.on('changed', (f) => this.onVaultEvent(f.path)));
    await this.refresh();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
  }

  private onVaultEvent(path: string): void {
    const project = this.plugin.projectManager.getActiveProject();
    if (!project) return;
    if (path !== project.folderPath && !path.startsWith(project.folderPath + '/')) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  // Rebuilds rows from disk truth and re-renders. Deferred while a synopsis
  // is being typed; runs once on blur.
  async refresh(): Promise<void> {
    if (this.editing) {
      this.pendingRefresh = true;
      return;
    }
    this.pendingRefresh = false;
    const project = this.plugin.projectManager.getActiveProject();
    if (!project) {
      this.nodes = [];
      this.rows = [];
      this.render();
      return;
    }
    const tree = buildManuscriptTree(this.app, project.folderPath);
    const counts = await this.countAll(tree.docFiles);
    this.nodes = tree.nodes;
    this.rows = buildOutlineRows(tree.nodes, p => counts.get(p) ?? 0);
    this.render();
  }

  private async countAll(files: TFile[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const next = new Map<string, WordCacheEntry>();
    for (const file of files) {
      const cached = this.wordCache.get(file.path);
      if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
        next.set(file.path, cached);
        counts.set(file.path, cached.words);
        continue;
      }
      let words = 0;
      try {
        words = countWords(await this.app.vault.read(file));
      } catch {
        // A file deleted mid-refresh counts as empty; the next event rebuilds
      }
      next.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, words });
      counts.set(file.path, words);
    }
    this.wordCache = next;
    return counts;
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ws-outline-container');
    this.tableHost = null;

    const project = this.plugin.projectManager.getActiveProject();

    const toolbar = container.createDiv('ws-outline-toolbar');
    const heading = toolbar.createDiv('ws-outline-heading');
    setIcon(heading.createSpan('ws-outline-heading-icon'), 'list-tree');
    heading.createSpan({
      cls: 'ws-outline-heading-text',
      text: project ? t('outline.heading', { project: project.title }) : t('outline.displayText'),
    });

    if (project && this.rows.length > 0) {
      const filter = toolbar.createEl('select', { cls: 'ws-outline-filter dropdown' });
      setTooltip(filter, t('outline.filterTooltip'));
      const all = filter.createEl('option', { text: t('outline.filterAll') });
      all.value = 'all';
      for (const s of DOCUMENT_STATUSES) {
        const opt = filter.createEl('option', { text: t(STATUS_LABEL_KEY[s]) });
        opt.value = s;
      }
      filter.value = this.statusFilter;
      filter.onchange = () => {
        this.statusFilter = (parseBinderStatus(filter.value) ?? 'all');
        this.renderTable();
      };

      const copyBtn = toolbar.createEl('button', { cls: 'ws-outline-copy-btn' });
      setIcon(copyBtn.createSpan('ws-outline-btn-icon'), 'copy');
      copyBtn.createSpan({ text: t('outline.copy') });
      setTooltip(copyBtn, t('outline.copyTooltip'));
      copyBtn.onclick = safeHandler(() => this.copyOutline());
    }

    if (!project) {
      container.createDiv({ cls: 'ws-outline-empty', text: t('outline.noProject') });
      return;
    }
    if (this.rows.length === 0) {
      container.createDiv({ cls: 'ws-outline-empty', text: t('outline.empty') });
      return;
    }

    // First-time guidance: shown only while no section has a synopsis yet
    const totals = outlineTotals(this.rows);
    if (totals.docCount > 0 && totals.missingSynopsis === totals.docCount) {
      const intro = container.createDiv('ws-outline-intro');
      setIcon(intro.createSpan('ws-outline-intro-icon'), 'lightbulb');
      intro.createSpan({ text: t('outline.intro') });
    }

    this.tableHost = container.createDiv('ws-outline-table-wrap');
    this.renderTable();
  }

  private renderTable(): void {
    const host = this.tableHost;
    if (!host) return;
    host.empty();

    const filtered = filterRowsByStatus(this.rows, this.statusFilter);
    if (filtered.length === 0) {
      host.createDiv({ cls: 'ws-outline-empty', text: t('outline.noMatches') });
      return;
    }
    const shown = visibleRows(filtered, this.collapsed);

    const table = host.createEl('table', { cls: 'ws-outline-table' });
    const headRow = table.createEl('thead').createEl('tr');
    const columns: Array<{ key: string; cls: string }> = [
      { key: 'outline.col.section', cls: 'ws-outline-col-section' },
      { key: 'outline.col.synopsis', cls: 'ws-outline-col-synopsis' },
      { key: 'outline.col.status', cls: 'ws-outline-col-status' },
      { key: 'outline.col.words', cls: 'ws-outline-col-num' },
      { key: 'outline.col.goal', cls: 'ws-outline-col-num' },
      { key: 'outline.col.progress', cls: 'ws-outline-col-progress' },
    ];
    for (const col of columns) headRow.createEl('th', { text: t(col.key), cls: col.cls });

    const body = table.createEl('tbody');
    for (const row of shown) {
      if (row.kind === 'folder') this.renderFolderRow(body, row);
      else this.renderDocRow(body, row);
    }

    const totals = outlineTotals(filtered);
    const foot = table.createEl('tfoot').createEl('tr', { cls: 'ws-outline-total' });
    foot.createEl('td', { text: t('outline.total') });
    foot.createEl('td');
    foot.createEl('td');
    foot.createEl('td', { text: formatNumber(totals.words), cls: 'ws-outline-col-num' });
    foot.createEl('td', { text: totals.goal === null ? '' : formatNumber(totals.goal), cls: 'ws-outline-col-num' });
    this.renderProgress(foot.createEl('td', { cls: 'ws-outline-col-progress' }), totals.words, totals.goal);

    if (totals.missingSynopsis > 0) {
      host.createDiv({ cls: 'ws-outline-footnote', text: t('outline.missing', { count: totals.missingSynopsis }) });
    }
  }

  private renderFolderRow(body: HTMLElement, row: OutlineRow): void {
    const tr = body.createEl('tr', { cls: 'ws-outline-row ws-outline-folder' });
    const isOpen = !this.collapsed.has(row.path);
    tr.setAttribute('aria-expanded', String(isOpen));

    const sectionTd = tr.createEl('td', { cls: 'ws-outline-col-section' });
    const cell = sectionTd.createDiv('ws-outline-section-cell');
    cell.setCssProps({ '--ws-outline-depth': `${row.depth * 18}px` });
    const chevron = cell.createSpan('ws-outline-chevron');
    setIcon(chevron, isOpen ? 'chevron-down' : 'chevron-right');
    cell.createSpan({ cls: 'ws-outline-folder-title', text: row.title });
    setTooltip(cell, t(isOpen ? 'outline.collapse' : 'outline.expand', { name: row.title }));
    cell.onclick = () => {
      if (this.collapsed.has(row.path)) this.collapsed.delete(row.path);
      else this.collapsed.add(row.path);
      this.renderTable();
    };

    tr.createEl('td', { cls: 'ws-outline-col-synopsis' });
    tr.createEl('td', { cls: 'ws-outline-col-status' });
    tr.createEl('td', { text: formatNumber(row.words), cls: 'ws-outline-col-num' });
    tr.createEl('td', { text: row.goal === null ? '' : formatNumber(row.goal), cls: 'ws-outline-col-num' });
    this.renderProgress(tr.createEl('td', { cls: 'ws-outline-col-progress' }), row.words, row.goal);
  }

  private renderDocRow(body: HTMLElement, row: OutlineRow): void {
    const tr = body.createEl('tr', { cls: 'ws-outline-row ws-outline-doc' });
    if (row.status) {
      tr.addClass('ws-outline-has-status');
      tr.setCssProps({ '--ws-status-color': STATUS_COLORS[row.status] });
    }
    if (row.compileExcluded) tr.addClass('ws-outline-dimmed');

    // Section: the title opens the document in a new tab so the outline stays
    const sectionTd = tr.createEl('td', { cls: 'ws-outline-col-section' });
    const cell = sectionTd.createDiv('ws-outline-section-cell');
    cell.setCssProps({ '--ws-outline-depth': `${row.depth * 18}px` });
    const link = cell.createEl('a', { cls: 'ws-outline-doc-title', text: row.title, href: '#' });
    setTooltip(link, t('outline.openDoc', { name: row.title }));
    link.onclick = (e) => {
      e.preventDefault();
      void this.openDoc(row.path);
    };

    // Synopsis: edited in place, saved on blur or Ctrl+Enter, reverted on Escape
    const synopsisTd = tr.createEl('td', { cls: 'ws-outline-col-synopsis' });
    const box = synopsisTd.createEl('textarea', {
      cls: 'ws-outline-synopsis',
      attr: { rows: '1', placeholder: t('outline.addSynopsis') },
    });
    box.value = row.synopsis ?? '';
    setTooltip(box, t('outline.synopsisTooltip'));
    box.onfocus = () => { this.editing = true; };
    box.onblur = () => {
      this.editing = false;
      const value = normalizeSynopsis(box.value);
      if (value !== (row.synopsis ?? '')) {
        void this.writeMeta(row.path, fm => {
          if (value) fm[SYNOPSIS_KEY] = value;
          else delete fm[SYNOPSIS_KEY];
        });
      } else if (this.pendingRefresh) {
        void this.refresh();
      }
    };
    box.onkeydown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        box.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        box.value = row.synopsis ?? '';
        box.blur();
      }
    };

    // Status: a dropdown that writes binder-status, or removes it
    const statusTd = tr.createEl('td', { cls: 'ws-outline-col-status' });
    const select = statusTd.createEl('select', { cls: 'ws-outline-status dropdown' });
    const none = select.createEl('option', { text: t('outline.noStatus') });
    none.value = '';
    for (const s of DOCUMENT_STATUSES) {
      const opt = select.createEl('option', { text: t(STATUS_LABEL_KEY[s]) });
      opt.value = s;
    }
    select.value = row.status ?? '';
    select.toggleClass('ws-outline-status-set', row.status !== null);
    setTooltip(select, t('outline.statusTooltip'));
    select.onchange = () => {
      const next = parseBinderStatus(select.value);
      void this.writeMeta(row.path, fm => {
        if (next) fm['binder-status'] = next;
        else delete fm['binder-status'];
      });
    };

    tr.createEl('td', { text: formatNumber(row.words), cls: 'ws-outline-col-num' });

    // Goal: a number field that writes word-count-goal, or removes it
    const goalTd = tr.createEl('td', { cls: 'ws-outline-col-num' });
    const goalInput = goalTd.createEl('input', {
      cls: 'ws-outline-goal',
      type: 'number',
      attr: { min: '0', step: '100', placeholder: '—' },
    });
    goalInput.value = row.goal === null ? '' : String(row.goal);
    setTooltip(goalInput, t('outline.goalTooltip'));
    goalInput.onchange = () => {
      const n = Math.floor(Number(goalInput.value));
      const next = Number.isFinite(n) && n > 0 ? n : null;
      void this.writeMeta(row.path, fm => {
        if (next) fm['word-count-goal'] = next;
        else delete fm['word-count-goal'];
      });
    };

    this.renderProgress(tr.createEl('td', { cls: 'ws-outline-col-progress' }), row.words, row.goal);
  }

  private renderProgress(td: HTMLElement, words: number, goal: number | null): void {
    if (goal === null || goal <= 0) return;
    const pct = progressPercent(words, goal);
    const wrap = td.createDiv('ws-outline-progress');
    const track = wrap.createDiv('ws-progress-wrap');
    const bar = track.createDiv('ws-progress-bar');
    bar.setCssProps({ '--ws-bar-width': `${pct}%` });
    if (pct >= 100) bar.addClass('ws-progress-bar-done');
    wrap.createSpan({ text: `${pct}%`, cls: 'ws-progress-pct' });
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  private async openDoc(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf('tab').openFile(file);
  }

  // Every edit is a frontmatter write; the outline re-renders through the
  // metadata event path, never by patching its own rows.
  private async writeMeta(path: string, mutate: (fm: Record<string, unknown>) => void): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    try {
      await this.app.fileManager.processFrontMatter(file, mutate);
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private async copyOutline(): Promise<void> {
    const text = outlineToMarkdown(this.nodes);
    await navigator.clipboard.writeText(text);
    new Notice(t('outline.copied'));
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}
