import { App, Modal } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { listManuscriptDocs } from '../src/manuscriptTree';
import { t } from '../src/i18n';

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
    contentEl.createEl('h2', { text: t('writingDashboard.title') });

    const project = this.plugin.projectManager.getActiveProject();
    const sessionStats = this.plugin.statsTracker.getSessionStats();
    const streak = await this.plugin.statsTracker.getStreak();

    // Session Summary
    const summarySection = contentEl.createDiv('ws-dash-section');
    summarySection.createEl('h3', { text: t('writingDashboard.thisSession') });

    const grid = summarySection.createDiv('ws-dash-grid');
    this.addStat(grid, t('writingDashboard.stat.wordsWritten'), String(sessionStats.wordsWritten));
    this.addStat(grid, t('writingDashboard.stat.sprints'), String(sessionStats.sprintsCompleted));
    this.addStat(grid, t('writingDashboard.stat.minutes'), String(sessionStats.totalMinutes));
    this.addStat(grid, t('writingDashboard.stat.writingStreak'), t('writingDashboard.stat.streakDays', { count: streak }));

    // Active Project
    if (project) {
      const projectSection = contentEl.createDiv('ws-dash-section');
      projectSection.createEl('h3', { text: t('writingDashboard.project', { title: project.title }) });

      const totalWords = await this.plugin.statsTracker.getTotalWordCount();
      const totalGoal = project.goals?.totalWordCount || 0;

      const projGrid = projectSection.createDiv('ws-dash-grid');
      this.addStat(projGrid, t('writingDashboard.stat.totalWords'), String(totalWords));
      if (totalGoal > 0) {
        const pct = Math.min(100, Math.round((totalWords / totalGoal) * 100));
        this.addStat(projGrid, t('writingDashboard.stat.goal'), `${totalGoal}`);
        this.addStat(projGrid, t('writingDashboard.stat.progress'), `${pct}%`);
      }
      this.addStat(projGrid, t('writingDashboard.stat.readingTime'), this.plugin.statsTracker.calculateReadingTime(totalWords));

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
      historySection.createEl('h3', { text: t('writingDashboard.recentSprints') });

      const log = await this.plugin.projectManager.getWritingLog(project);
      // Display-only filter: abandoned sprints (0 words) clutter the table with
      // 0 / 0-WPM rows. Storage, retention, and streak logic are unaffected.
      const recent = [...log].filter(s => s.wordsWritten > 0).reverse().slice(0, 10);

      if (recent.length === 0) {
        historySection.createEl('p', { text: t('writingDashboard.noSprints'), cls: 'ws-empty-state' });
      } else {
        const table = historySection.createEl('table', { cls: 'ws-sprint-history-table' });
        const thead = table.createEl('thead');
        const hr = thead.createEl('tr');
        [
          t('writingDashboard.sprintTable.date'),
          t('writingDashboard.sprintTable.duration'),
          t('writingDashboard.sprintTable.words'),
          t('writingDashboard.sprintTable.wpm'),
          t('writingDashboard.sprintTable.goal'),
        ].forEach(h => hr.createEl('th', { text: h }));

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
      docsSection.createEl('h3', { text: t('writingDashboard.documentWordCounts') });

      // The manuscript zone in binder order (#233) — the filename is the title
      const docs = listManuscriptDocs(this.app, project.folderPath);

      const table = docsSection.createEl('table', { cls: 'ws-doc-wc-table' });
      const thead = table.createEl('thead');
      const hr = thead.createEl('tr');
      [
        t('writingDashboard.docTable.document'),
        t('writingDashboard.docTable.words'),
        t('writingDashboard.docTable.readingTime'),
      ].forEach(h => hr.createEl('th', { text: h }));

      const tbody = table.createEl('tbody');
      for (const file of docs) {
        const content = await this.app.vault.read(file);
        const wc = this.plugin.fmManager.countWords(content);
        const tr = tbody.createEl('tr');
        const titleTd = tr.createEl('td');
        const link = titleTd.createEl('a', { text: file.basename });
        link.href = '#';
        link.onclick = async (e) => {
          e.preventDefault();
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);
          this.close();
        };
        tr.createEl('td', { text: String(wc) });
        tr.createEl('td', { text: this.plugin.statsTracker.calculateReadingTime(wc) });
      }
    }

    const closeBtn = contentEl.createEl('button', { text: t('writingDashboard.close'), cls: 'ws-dash-close' });
    closeBtn.onclick = () => this.close();
  }

  private addStat(container: HTMLElement, label: string, value: string): void {
    const stat = container.createDiv('ws-dash-stat');
    stat.createDiv({ text: value, cls: 'ws-dash-stat-value' });
    stat.createDiv({ text: label, cls: 'ws-dash-stat-label' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
