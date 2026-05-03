import { App, Modal, TFile, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { BinderItem, STATUS_COLORS, STATUS_LABELS } from '../models/BinderItem';

interface DocStats {
  item: BinderItem;
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
    contentEl.createEl('h2', { text: 'Chapter Targets Dashboard' });

    const project = this.plugin.projectManager.getActiveProject();
    if (!project) {
      contentEl.createEl('p', { text: 'No project selected.', cls: 'ws-empty-state' });
      return;
    }

    // Load stats
    await this.loadStats(project);

    // Filters
    const filterRow = contentEl.createDiv('ws-dashboard-filters');
    filterRow.createEl('label', { text: 'Filter: ' });
    const statusSel = filterRow.createEl('select');
    ['all', 'draft', 'in-progress', 'complete', 'published'].forEach(s => {
      const opt = statusSel.createEl('option', { text: s === 'all' ? 'All Statuses' : STATUS_LABELS[s as any] || s });
      opt.value = s;
    });
    statusSel.value = this.statusFilter;
    statusSel.onchange = () => {
      this.statusFilter = statusSel.value;
      this.renderTable(contentEl);
    };

    const refreshBtn = filterRow.createEl('button', { text: '↻ Refresh', cls: 'ws-dashboard-refresh' });
    refreshBtn.onclick = async () => {
      await this.loadStats(project);
      this.renderTable(contentEl);
    };

    this.renderTable(contentEl);
  }

  private async loadStats(project: ReturnType<typeof this.plugin.projectManager.getActiveProject>): Promise<void> {
    if (!project) return;
    const binder = await this.plugin.projectManager.loadBinder(project);
    const items = this.plugin.projectManager.flattenBinder(binder.items);
    this.stats = [];

    for (const item of items) {
      if (item.type === 'group' || item.type === 'part') continue;
      const file = this.app.vault.getAbstractFileByPath(item.filePath);
      let wordCount = 0;
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        wordCount = this.plugin.fmManager.countWords(content);
      }
      this.stats.push({
        item,
        wordCount,
        readingTime: this.plugin.statsTracker.calculateReadingTime(wordCount),
      });
    }
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
      { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'wordCount', label: 'Words' },
      { key: 'goal', label: 'Goal' },
      { key: 'progress', label: 'Progress' },
      { key: 'readingTime', label: 'Reading Time' },
    ];

    for (const col of cols) {
      const th = hr.createEl('th', { text: col.label });
      if (col.key !== 'progress') {
        th.style.cursor = 'pointer';
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
    let filtered = this.stats.filter(s =>
      this.statusFilter === 'all' || s.item.status === this.statusFilter
    );

    filtered.sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      switch (this.sortCol) {
        case 'title': av = a.item.title.toLowerCase(); bv = b.item.title.toLowerCase(); break;
        case 'type': av = a.item.type; bv = b.item.type; break;
        case 'status': av = a.item.status; bv = b.item.status; break;
        case 'wordCount': av = a.wordCount; bv = b.wordCount; break;
        case 'goal': av = a.item.wordCountGoal || 0; bv = b.item.wordCountGoal || 0; break;
        case 'readingTime': av = a.wordCount; bv = b.wordCount; break;
        default: av = a.item.order; bv = b.item.order;
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
      const titleLink = titleTd.createEl('a', { text: stat.item.title });
      titleLink.href = '#';
      titleLink.onclick = async (e) => {
        e.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(stat.item.filePath);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);
          this.close();
        }
      };

      tr.createEl('td', { text: stat.item.type });

      const statusTd = tr.createEl('td');
      const badge = statusTd.createSpan('ws-status-badge');
      badge.textContent = STATUS_LABELS[stat.item.status];
      badge.style.backgroundColor = STATUS_COLORS[stat.item.status];

      tr.createEl('td', { text: String(stat.wordCount) });

      // Goal (editable)
      const goalTd = tr.createEl('td');
      const goalInput = goalTd.createEl('input', { type: 'number', cls: 'ws-dash-goal-input' });
      goalInput.value = String(stat.item.wordCountGoal || '');
      goalInput.placeholder = '—';
      goalInput.onchange = async () => {
        const val = parseInt(goalInput.value) || 0;
        stat.item.wordCountGoal = val || undefined;
        const project = this.plugin.projectManager.getActiveProject();
        if (project) {
          const binder = await this.plugin.projectManager.loadBinder(project);
          const found = this.plugin.projectManager.findItem(binder.items, stat.item.id);
          if (found) {
            found.wordCountGoal = stat.item.wordCountGoal;
            await this.plugin.projectManager.saveBinder(binder);
          }
        }
        this.renderTable(container);
      };

      // Progress bar
      const progressTd = tr.createEl('td');
      const goal = stat.item.wordCountGoal;
      if (goal && goal > 0) {
        const pct = Math.min(100, Math.round((stat.wordCount / goal) * 100));
        const barWrap = progressTd.createDiv('ws-progress-wrap');
        const bar = barWrap.createDiv('ws-progress-bar');
        bar.style.width = `${pct}%`;
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
    const totalGoal = filtered.reduce((s, d) => s + (d.item.wordCountGoal || 0), 0);
    const overallPct = totalGoal > 0 ? Math.round((totalWords / totalGoal) * 100) : 0;

    sumRow.createEl('td', { text: 'TOTAL' });
    sumRow.createEl('td');
    sumRow.createEl('td');
    sumRow.createEl('td', { text: String(totalWords) });
    sumRow.createEl('td', { text: totalGoal > 0 ? String(totalGoal) : '—' });

    const sumProgressTd = sumRow.createEl('td');
    if (totalGoal > 0) {
      const barWrap = sumProgressTd.createDiv('ws-progress-wrap');
      const bar = barWrap.createDiv('ws-progress-bar');
      bar.style.width = `${overallPct}%`;
      sumProgressTd.createSpan({ text: `${overallPct}%`, cls: 'ws-progress-pct' });
    }

    sumRow.createEl('td', { text: this.plugin.statsTracker.calculateReadingTime(totalWords) });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
