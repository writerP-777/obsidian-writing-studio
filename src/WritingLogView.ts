import { ItemView, WorkspaceLeaf } from 'obsidian';
import type WritingStudioPlugin from '../main';

export const WRITING_LOG_VIEW_TYPE = 'writing-studio-writing-log';

export class WritingLogView extends ItemView {
  private plugin: WritingStudioPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return WRITING_LOG_VIEW_TYPE; }
  getDisplayText(): string { return 'Writing log'; }
  getIcon(): string { return 'calendar-days'; }

  async onOpen(): Promise<void> {
    await this.render();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('ws-log-root');

    const header = root.createDiv('ws-log-header');
    header.createDiv({ text: 'Writing log', cls: 'ws-log-title' });
    header.createDiv({
      text: new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      cls: 'ws-log-date',
    });

    const project = this.plugin.projectManager.getActiveProject();
    if (!project) {
      root.createDiv({
        text: 'No project selected. Open the launcher and select a project to see your writing history.',
        cls: 'ws-log-empty-msg',
      });
      return;
    }

    const streak = await this.plugin.statsTracker.getStreak();
    const streakEl = root.createDiv('ws-log-streak');
    if (streak > 0) {
      streakEl.textContent = `🔥 ${streak}-day streak`;
    } else {
      streakEl.textContent = 'Write today to start a streak';
      streakEl.addClass('ws-log-streak--zero');
    }

    // This session
    const sessionSection = root.createDiv('ws-log-section');
    sessionSection.createDiv({ text: 'This session', cls: 'ws-log-section-label' });

    const stats = this.plugin.statsTracker.getSessionStats();
    const sessionWords = this.plugin.statsTracker.getTotalSessionWords();

    const sessionGrid = sessionSection.createDiv('ws-log-today-grid');
    const sessionItems: Array<[string, string]> = [
      ['Session', sessionWords.toLocaleString()],
      ['Sprint words', stats.wordsWritten.toLocaleString()],
      ['Sprints', String(stats.sprintsCompleted)],
      ['Minutes', String(stats.totalMinutes)],
    ];
    for (const [label, value] of sessionItems) {
      const cell = sessionGrid.createDiv('ws-log-today-stat');
      cell.createDiv({ text: value, cls: 'ws-log-today-val' });
      cell.createDiv({ text: label, cls: 'ws-log-today-label' });
    }

    // 30-day history
    const histSection = root.createDiv('ws-log-section');
    histSection.createDiv({ text: 'Last 30 days', cls: 'ws-log-section-label' });

    const history = await this.plugin.statsTracker.getWritingHistory(30);
    const maxWords = Math.max(...history.map(d => d.wordsWritten), 1);
    const todayStr = new Date().toISOString().split('T')[0];

    const list = histSection.createDiv('ws-log-day-list');
    for (const entry of [...history].reverse()) {
      const row = list.createDiv('ws-log-day-row');
      if (entry.wordsWritten === 0) row.addClass('ws-log-day-row--empty');

      const dateEl = row.createDiv('ws-log-day-date');
      dateEl.textContent = entry.date === todayStr
        ? 'Today'
        : new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const barWrap = row.createDiv('ws-log-day-bar-wrap');
      const bar = barWrap.createDiv('ws-log-day-bar');
      bar.setCssProps({ '--ws-log-bar-width': `${Math.round((entry.wordsWritten / maxWords) * 100)}%` });

      const wordsEl = row.createDiv('ws-log-day-words');
      if (entry.wordsWritten > 0) {
        wordsEl.createSpan({ text: entry.wordsWritten.toLocaleString() });
        if (entry.sprintsCompleted > 0) {
          wordsEl.createSpan({
            text: ` · ${entry.sprintsCompleted} sprint${entry.sprintsCompleted !== 1 ? 's' : ''}`,
            cls: 'ws-log-day-meta',
          });
        }
      } else {
        wordsEl.createSpan({ text: '—' });
      }
    }
  }
}
