import { App, Modal, TFile } from 'obsidian';
import type WritingStudioPlugin from '../main';

export class WritingDashboardModal extends Modal {
  private plugin: WritingStudioPlugin;

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-writing-dashboard');
    contentEl.createEl('h2', { text: 'Writing dashboard' });

    const project = this.plugin.projectManager.getActiveProject();
    const sessionStats = this.plugin.statsTracker.getSessionStats();
    const streak = await this.plugin.statsTracker.getStreak();

    // Session Summary
    const summarySection = contentEl.createDiv('ws-dash-section');
    summarySection.createEl('h3', { text: 'This session' });

    const grid = summarySection.createDiv('ws-dash-grid');
    this.addStat(grid, 'Words written', String(sessionStats.wordsWritten));
    this.addStat(grid, 'Sprints', String(sessionStats.sprintsCompleted));
    this.addStat(grid, 'Minutes', String(sessionStats.totalMinutes));
    this.addStat(grid, 'Writing streak', `${streak} day${streak !== 1 ? 's' : ''}`);

    // Active Project
    if (project) {
      const projectSection = contentEl.createDiv('ws-dash-section');
      projectSection.createEl('h3', { text: `Project: ${project.title}` });

      const totalWords = await this.plugin.statsTracker.getTotalWordCount();
      const totalGoal = project.goals?.totalWordCount || 0;

      const projGrid = projectSection.createDiv('ws-dash-grid');
      this.addStat(projGrid, 'Total Words', String(totalWords));
      if (totalGoal > 0) {
        const pct = Math.min(100, Math.round((totalWords / totalGoal) * 100));
        this.addStat(projGrid, 'Goal', `${totalGoal}`);
        this.addStat(projGrid, 'Progress', `${pct}%`);
      }
      this.addStat(projGrid, 'Reading time', this.plugin.statsTracker.calculateReadingTime(totalWords));

      // Progress bar
      if (totalGoal > 0) {
        const pct = Math.min(100, Math.round((totalWords / totalGoal) * 100));
        const barWrap = projectSection.createDiv('ws-progress-wrap ws-dash-progress');
        const bar = barWrap.createDiv('ws-progress-bar');
        bar.setCssProps({ '--ws-bar-width': `${pct}%` });
        projectSection.createEl('p', { text: `${totalWords} / ${totalGoal} words (${pct}%)`, cls: 'ws-dash-progress-label' });
      }
    }

    // Sprint History
    if (project) {
      const historySection = contentEl.createDiv('ws-dash-section');
      historySection.createEl('h3', { text: 'Recent sprints' });

      const log = await this.plugin.projectManager.getWritingLog(project);
      const recent = [...log].reverse().slice(0, 10);

      if (recent.length === 0) {
        historySection.createEl('p', { text: 'No sprints recorded yet.', cls: 'ws-empty-state' });
      } else {
        const table = historySection.createEl('table', { cls: 'ws-sprint-history-table' });
        const thead = table.createEl('thead');
        const hr = thead.createEl('tr');
        ['Date', 'Duration', 'Words', 'WPM', 'Goal'].forEach(h => hr.createEl('th', { text: h }));

        const tbody = table.createEl('tbody');
        for (const s of recent) {
          const tr = tbody.createEl('tr');
          const date = new Date(s.date).toLocaleDateString();
          const wpm = s.duration > 0 ? Math.round(s.wordsWritten / s.duration) : 0;
          tr.createEl('td', { text: date });
          tr.createEl('td', { text: `${s.duration}m` });
          tr.createEl('td', { text: String(s.wordsWritten) });
          tr.createEl('td', { text: String(wpm) });
          tr.createEl('td', { text: s.wordCountGoal ? `${s.wordsWritten}/${s.wordCountGoal}` : '—' });
        }
      }
    }

    // Per-document breakdown
    if (project) {
      const docsSection = contentEl.createDiv('ws-dash-section');
      docsSection.createEl('h3', { text: 'Document word counts' });

      const binder = await this.plugin.projectManager.loadBinder(project);
      const items = this.plugin.projectManager.flattenBinder(binder.items);

      const table = docsSection.createEl('table', { cls: 'ws-doc-wc-table' });
      const thead = table.createEl('thead');
      const hr = thead.createEl('tr');
      ['Document', 'Words', 'Reading Time'].forEach(h => hr.createEl('th', { text: h }));

      const tbody = table.createEl('tbody');
      for (const item of items) {
        if (item.type === 'group' || item.type === 'part') continue;
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        let wc = 0;
        if (file instanceof TFile) {
          const content = await this.app.vault.read(file);
          wc = this.plugin.fmManager.countWords(content);
        }
        const tr = tbody.createEl('tr');
        const titleTd = tr.createEl('td');
        const link = titleTd.createEl('a', { text: item.title });
        link.href = '#';
        link.onclick = async (e) => {
          e.preventDefault();
          if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
            this.close();
          }
        };
        tr.createEl('td', { text: String(wc) });
        tr.createEl('td', { text: this.plugin.statsTracker.calculateReadingTime(wc) });
      }
    }

    const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'ws-dash-close' });
    closeBtn.onclick = () => this.close();
  }

  private addStat(container: HTMLElement, label: string, value: string): void {
    const stat = container.createDiv('ws-dash-stat');
    stat.createEl('div', { text: value, cls: 'ws-dash-stat-value' });
    stat.createEl('div', { text: label, cls: 'ws-dash-stat-label' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
