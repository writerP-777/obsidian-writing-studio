import { ItemView, WorkspaceLeaf, getLanguage } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { t } from './i18n';
import { localDateString } from './dates';

export const WRITING_LOG_VIEW_TYPE = 'writing-studio-writing-log';

export class WritingLogView extends ItemView {
  private plugin: WritingStudioPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return WRITING_LOG_VIEW_TYPE; }
  getDisplayText(): string { return t('log.displayText'); }
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

    const lang = getLanguage();

    const header = root.createDiv('ws-log-header');
    header.createDiv({ text: t('log.title'), cls: 'ws-log-title' });
    header.createDiv({
      text: new Date().toLocaleDateString(lang, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      cls: 'ws-log-date',
    });

    const project = this.plugin.projectManager.getActiveProject();
    if (!project) {
      root.createDiv({
        text: t('log.noProjectSelected'),
        cls: 'ws-log-empty-msg',
      });
      return;
    }

    const streak = await this.plugin.statsTracker.getStreak();
    const streakEl = root.createDiv('ws-log-streak');
    if (streak > 0) {
      streakEl.textContent = t('log.streak', { streak });
    } else {
      streakEl.textContent = t('log.startStreak');
      streakEl.addClass('ws-log-streak--zero');
    }

    // This session
    const sessionSection = root.createDiv('ws-log-section');
    sessionSection.createDiv({ text: t('log.thisSession'), cls: 'ws-log-section-label' });

    const stats = this.plugin.statsTracker.getSessionStats();
    const sessionWords = this.plugin.statsTracker.getTotalSessionWords();

    const sessionGrid = sessionSection.createDiv('ws-log-today-grid');
    const sessionItems: Array<[string, string]> = [
      [t('log.stat.session'), sessionWords.toLocaleString()],
      [t('log.stat.sprintWords'), stats.wordsWritten.toLocaleString()],
      [t('log.stat.sprints'), String(stats.sprintsCompleted)],
      [t('log.stat.minutes'), String(stats.totalMinutes)],
    ];
    for (const [label, value] of sessionItems) {
      const cell = sessionGrid.createDiv('ws-log-today-stat');
      cell.createDiv({ text: value, cls: 'ws-log-today-val' });
      cell.createDiv({ text: label, cls: 'ws-log-today-label' });
    }

    // 30-day history
    const histSection = root.createDiv('ws-log-section');
    histSection.createDiv({ text: t('log.last30Days'), cls: 'ws-log-section-label' });

    const history = await this.plugin.statsTracker.getWritingHistory(30);
    const maxWords = Math.max(...history.map(d => d.wordsWritten), 1);
    const todayStr = localDateString();

    const list = histSection.createDiv('ws-log-day-list');
    for (const entry of [...history].reverse()) {
      const row = list.createDiv('ws-log-day-row');
      if (entry.wordsWritten === 0) row.addClass('ws-log-day-row--empty');

      const dateEl = row.createDiv('ws-log-day-date');
      dateEl.textContent = entry.date === todayStr
        ? t('log.today')
        : new Date(`${entry.date}T12:00:00`).toLocaleDateString(lang, { month: 'short', day: 'numeric' });

      const barWrap = row.createDiv('ws-log-day-bar-wrap');
      const bar = barWrap.createDiv('ws-log-day-bar');
      bar.setCssProps({ '--ws-log-bar-width': `${Math.round((entry.wordsWritten / maxWords) * 100)}%` });

      const wordsEl = row.createDiv('ws-log-day-words');
      if (entry.wordsWritten > 0) {
        wordsEl.createSpan({ text: entry.wordsWritten.toLocaleString() });
        if (entry.sprintsCompleted > 0) {
          wordsEl.createSpan({
            text: t('log.sprintsCount', { count: entry.sprintsCompleted }),
            cls: 'ws-log-day-meta',
          });
        }
      } else {
        wordsEl.createSpan({ text: '—' });
      }
    }
  }
}
