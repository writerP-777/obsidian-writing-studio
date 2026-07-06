import { App, Modal, TFile } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { STATUS_COLORS, DocumentStatus } from '../models/BinderItem';
import { parseBinderStatus, parseBinderType } from '../src/binderMenu';
import { listManuscriptDocs } from '../src/manuscriptTree';

const STATUS_KEY: Record<DocumentStatus, string> = {
  draft: 'targetsDashboard.status.draft',
  'in-progress': 'targetsDashboard.status.inProgress',
  complete: 'targetsDashboard.status.complete',
  published: 'targetsDashboard.status.published',
};

const TYPE_KEY: Record<string, string> = {
  chapter: 'targetsDashboard.typeLabel.chapter',
  section: 'targetsDashboard.typeLabel.section',
  article: 'targetsDashboard.typeLabel.article',
  note: 'targetsDashboard.typeLabel.note',
  group: 'targetsDashboard.typeLabel.group',
  part: 'targetsDashboard.typeLabel.part',
};
import { t } from '../src/i18n';

// One dashboard row: a manuscript-zone document. Frontmatter
// `word-count-goal` is the sole goal authority (#229/#233); type and status
// are optional binder-* frontmatter.
interface DocStats {
  title: string;
  filePath: string;
  type: string | null;
  status: DocumentStatus | null;
  goal: number | undefined;
  order: number;
  wordCount: number;
  readingTime: string;
}

export class TargetsDashboardModal extends Modal {
  private plugin: WritingStudioPlugin;
  private stats: DocStats[] = [];
  private sortCol = 'order';
  private sortAsc = true;
  private statusFilter = 'all';

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-dashboard-modal');
    contentEl.createEl('h2', { text: t('targetsDashboard.title') });

    const project = this.plugin.projectManager.getActiveProject();
    if (!project) {
      contentEl.createEl('p', { text: t('targetsDashboard.noProject'), cls: 'ws-empty-state' });
      return;
    }

    // Load stats
    await this.loadStats(project);

    // Filters
    const filterRow = contentEl.createDiv('ws-dashboard-filters');
    filterRow.createEl('label', { text: t('targetsDashboard.filterLabel') });
    const statusSel = filterRow.createEl('select');
    ['all', 'draft', 'in-progress', 'complete', 'published'].forEach(s => {
      const opt = statusSel.createEl('option', { text: s === 'all' ? t('targetsDashboard.allStatuses') : t(STATUS_KEY[s as DocumentStatus]) });
      opt.value = s;
    });
    statusSel.value = this.statusFilter;
    statusSel.onchange = () => {
      this.statusFilter = statusSel.value;
      this.renderTable(contentEl);
    };

    const refreshBtn = filterRow.createEl('button', { text: t('targetsDashboard.refresh'), cls: 'ws-dashboard-refresh' });
    refreshBtn.onclick = async () => {
      await this.loadStats(project);
      this.renderTable(contentEl);
    };

    this.renderTable(contentEl);
  }

  private async loadStats(project: ReturnType<typeof this.plugin.projectManager.getActiveProject>): Promise<void> {
    if (!project) return;
    this.stats = [];

    // The manuscript zone in binder order, goals and metadata read from
    // frontmatter (#229 goal single-authority, sole path since #233)
    const docs = listManuscriptDocs(this.app, project.folderPath);
    for (let i = 0; i < docs.length; i++) {
      const file = docs[i];
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const rawGoal = Number(fm?.['word-count-goal']);
      this.stats.push({
        title: file.basename,
        filePath: file.path,
        type: parseBinderType(fm?.['binder-type']),
        status: parseBinderStatus(fm?.['binder-status']),
        goal: Number.isFinite(rawGoal) && rawGoal > 0 ? rawGoal : undefined,
        order: i,
        ...(await this.countFor(file)),
      });
    }
  }

  private async countFor(file: TFile): Promise<{ wordCount: number; readingTime: string }> {
    const content = await this.app.vault.read(file);
    const wordCount = this.plugin.fmManager.countWords(content);
    return { wordCount, readingTime: this.plugin.statsTracker.calculateReadingTime(wordCount) };
  }

  private async saveGoal(stat: DocStats, goal: number | undefined): Promise<void> {
    stat.goal = goal;
    const file = this.app.vault.getAbstractFileByPath(stat.filePath);
    if (!(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (goal === undefined) delete fm['word-count-goal'];
      else fm['word-count-goal'] = goal;
    });
  }

  private renderTable(container: HTMLElement): void {
    const existing = container.querySelector('.ws-dashboard-table-wrap');
    if (existing) existing.remove();

    const wrap = container.createDiv('ws-dashboard-table-wrap');
    const table = wrap.createEl('table', { cls: 'ws-dashboard-table' });

    // Header
    const thead = table.createEl('thead');
    const hr = thead.createEl('tr');
    const cols: Array<{ key: string; label: string }> = [
      { key: 'title',       label: t('targetsDashboard.col.title') },
      { key: 'type',        label: t('targetsDashboard.col.type') },
      { key: 'status',      label: t('targetsDashboard.col.status') },
      { key: 'wordCount',   label: t('targetsDashboard.col.words') },
      { key: 'goal',        label: t('targetsDashboard.col.goal') },
      { key: 'progress',    label: t('targetsDashboard.col.progress') },
      { key: 'readingTime', label: t('targetsDashboard.col.readingTime') },
    ];

    for (const col of cols) {
      const th = hr.createEl('th', { text: col.label });
      if (col.key !== 'progress') {
        th.addClass('ws-sortable');
        th.onclick = () => {
          if (this.sortCol === col.key) this.sortAsc = !this.sortAsc;
          else { this.sortCol = col.key; this.sortAsc = true; }
          this.renderTable(container);
        };
        if (this.sortCol === col.key) {
          th.textContent += this.sortAsc ? ' ↑' : ' ↓';
        }
      }
    }

    // Filter & sort
    const filtered = this.stats.filter(s =>
      this.statusFilter === 'all' || s.status === this.statusFilter
    );

    filtered.sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      switch (this.sortCol) {
        case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
        case 'type': av = a.type ?? ''; bv = b.type ?? ''; break;
        case 'status': av = a.status ?? ''; bv = b.status ?? ''; break;
        case 'wordCount': av = a.wordCount; bv = b.wordCount; break;
        case 'goal': av = a.goal || 0; bv = b.goal || 0; break;
        case 'readingTime': av = a.wordCount; bv = b.wordCount; break;
        default: av = a.order; bv = b.order;
      }
      if (av < bv) return this.sortAsc ? -1 : 1;
      if (av > bv) return this.sortAsc ? 1 : -1;
      return 0;
    });

    // Body
    const tbody = table.createEl('tbody');
    for (const stat of filtered) {
      const tr = tbody.createEl('tr');

      // Title (clickable)
      const titleTd = tr.createEl('td', { cls: 'ws-dash-title' });
      const titleLink = titleTd.createEl('a', { text: stat.title });
      titleLink.href = '#';
      titleLink.onclick = async (e) => {
        e.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(stat.filePath);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);
          this.close();
        }
      };

      tr.createEl('td', { text: stat.type ? t(TYPE_KEY[stat.type] ?? stat.type) : '—' });

      const statusTd = tr.createEl('td');
      if (stat.status) {
        const badge = statusTd.createSpan('ws-status-badge');
        badge.textContent = t(STATUS_KEY[stat.status]);
        badge.setCssProps({ '--ws-status-color': STATUS_COLORS[stat.status] });
      } else {
        statusTd.textContent = '—';
      }

      tr.createEl('td', { text: String(stat.wordCount) });

      // Goal (editable)
      const goalTd = tr.createEl('td');
      const goalInput = goalTd.createEl('input', { type: 'number', cls: 'ws-dash-goal-input' });
      goalInput.value = String(stat.goal || '');
      goalInput.placeholder = '—';
      goalInput.onchange = async () => {
        const val = parseInt(goalInput.value) || 0;
        await this.saveGoal(stat, val || undefined);
        this.renderTable(container);
      };

      // Progress bar
      const progressTd = tr.createEl('td');
      const goal = stat.goal;
      if (goal && goal > 0) {
        const pct = Math.min(100, Math.round((stat.wordCount / goal) * 100));
        const barWrap = progressTd.createDiv('ws-progress-wrap');
        const bar = barWrap.createDiv('ws-progress-bar');
        bar.setCssProps({ '--ws-bar-width': `${pct}%` });
        progressTd.createSpan({ text: `${pct}%`, cls: 'ws-progress-pct' });
      } else {
        progressTd.textContent = '—';
      }

      tr.createEl('td', { text: stat.readingTime });
    }

    // Summary row
    const tfoot = table.createEl('tfoot');
    const sumRow = tfoot.createEl('tr', { cls: 'ws-dash-summary' });
    const totalWords = filtered.reduce((s, d) => s + d.wordCount, 0);
    const totalGoal = filtered.reduce((s, d) => s + (d.goal || 0), 0);
    const overallPct = totalGoal > 0 ? Math.round((totalWords / totalGoal) * 100) : 0;

    sumRow.createEl('td', { text: t('targetsDashboard.total') });
    sumRow.createEl('td');
    sumRow.createEl('td');
    sumRow.createEl('td', { text: String(totalWords) });
    sumRow.createEl('td', { text: totalGoal > 0 ? String(totalGoal) : '—' });

    const sumProgressTd = sumRow.createEl('td');
    if (totalGoal > 0) {
      const barWrap = sumProgressTd.createDiv('ws-progress-wrap');
      const bar = barWrap.createDiv('ws-progress-bar');
      bar.setCssProps({ '--ws-bar-width': `${overallPct}%` });
      sumProgressTd.createSpan({ text: `${overallPct}%`, cls: 'ws-progress-pct' });
    }

    sumRow.createEl('td', { text: this.plugin.statsTracker.calculateReadingTime(totalWords) });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
