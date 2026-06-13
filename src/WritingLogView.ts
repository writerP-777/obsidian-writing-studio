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

    // No activity anywhere in the window — show a friendly empty state
    // instead of a chart that is all empty rows.
    if (!history.some(d => d.wordsWritten > 0)) {
      histSection.createDiv({ text: t('log.noActivity'), cls: 'ws-log-empty-msg' });
      return;
    }

    // Newest first. Active days render as a full row; consecutive empty days
    // collapse into a single compact "quiet days" row so the chart isn't a
    // wall of empty rows with one bar buried in it.
    const ordered = [...history].reverse();
    const list = histSection.createDiv('ws-log-day-list');
    let i = 0;
    while (i < ordered.length) {
      if (ordered[i].wordsWritten === 0) {
        let j = i;
        while (j < ordered.length && ordered[j].wordsWritten === 0) j++;
        this.renderQuietRow(list, ordered.slice(i, j), todayStr, lang);
        i = j;
      } else {
        this.renderActiveRow(list, ordered[i], maxWords, todayStr, lang);
        i++;
      }
    }
  }

  private formatDayLabel(date: string, todayStr: string, lang: string): string {
    return date === todayStr
      ? t('log.today')
      : new Date(`${date}T12:00:00`).toLocaleDateString(lang, { month: 'short', day: 'numeric' });
  }

  private renderActiveRow(
    list: HTMLElement, entry: { date: string; wordsWritten: number; sprintsCompleted: number },
    maxWords: number, todayStr: string, lang: string,
  ): void {
    const row = list.createDiv('ws-log-day-row');
    row.createDiv({ text: this.formatDayLabel(entry.date, todayStr, lang), cls: 'ws-log-day-date' });

    const barWrap = row.createDiv('ws-log-day-bar-wrap');
    const bar = barWrap.createDiv('ws-log-day-bar');
    bar.setCssProps({ '--ws-log-bar-width': `${Math.round((entry.wordsWritten / maxWords) * 100)}%` });

    const wordsEl = row.createDiv('ws-log-day-words');
    wordsEl.createSpan({ text: entry.wordsWritten.toLocaleString() });
    if (entry.sprintsCompleted > 0) {
      wordsEl.createSpan({
        text: t('log.sprintsCount', { count: entry.sprintsCompleted }),
        cls: 'ws-log-day-meta',
      });
    }
  }

  private renderQuietRow(
    list: HTMLElement, run: Array<{ date: string }>, todayStr: string, lang: string,
  ): void {
    const row = list.createDiv('ws-log-day-row');
    row.addClass('ws-log-day-row--collapsed');

    // run is newest-first: run[0] is the most recent quiet day, the last is oldest.
    const newest = this.formatDayLabel(run[0].date, todayStr, lang);
    const oldest = this.formatDayLabel(run[run.length - 1].date, todayStr, lang);
    row.createDiv({
      text: run.length === 1 ? newest : `${newest} – ${oldest}`,
      cls: 'ws-log-day-date',
    });

    row.createDiv('ws-log-day-bar-wrap');

    const wordsEl = row.createDiv('ws-log-day-words');
    wordsEl.createSpan({ text: t('log.quietDays', { count: run.length }), cls: 'ws-log-day-meta' });
  }
}
