import type WritingStudioPlugin from '../main';
import { t } from './i18n';

// Owns the plugin's status bar real estate. Items are created once, in this
// fixed append-only order: mode indicator → word count → sprint timer →
// project goal bar. Anything new goes after the project goal bar.
export class StatusBar {
  private plugin: WritingStudioPlugin;
  private modeEl!: HTMLElement;
  private wordCountEl!: HTMLElement;
  private sprintEl!: HTMLElement;
  private projectGoalEl!: HTMLElement;
  private projectGoalTimer: number | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
  }

  init(onModeClick: (e: MouseEvent) => void): void {
    // All items start hidden — reveal() runs when the studio launches, so a
    // disabled startup toggle leaves the status bar untouched.
    this.modeEl = this.plugin.addStatusBarItem();
    this.modeEl.addClass('ws-status-mode', 'ws-hidden');
    this.plugin.writingModes.setStatusBar(this.modeEl);
    this.modeEl.addEventListener('click', onModeClick);

    this.wordCountEl = this.plugin.addStatusBarItem();
    this.wordCountEl.addClass('ws-status-wordcount', 'ws-hidden');

    this.sprintEl = this.plugin.addStatusBarItem();
    this.sprintEl.addClass('ws-status-sprint', 'ws-hidden');
    this.plugin.sprintTimer.setStatusBar(this.sprintEl);

    this.projectGoalEl = this.plugin.addStatusBarItem();
    this.projectGoalEl.addClass('ws-status-project-goal', 'ws-hidden');
  }

  reveal(): void {
    this.modeEl.removeClass('ws-hidden');
    this.wordCountEl.removeClass('ws-hidden');
    this.sprintEl.removeClass('ws-hidden');
    // The project goal bar stays managed by updateProjectGoalBar — it only
    // shows when the active project has a total word count goal.
  }

  clearWordCount(): void {
    this.wordCountEl.textContent = '';
  }

  showWordCount(wc: number, goal: number | undefined, sessionDelta: number): void {
    const delta = sessionDelta > 0 ? ` ${t('main.statusBar.delta', { delta: sessionDelta })}` : '';
    this.wordCountEl.textContent = goal && goal > 0
      ? t('main.statusBar.wordCountGoal', { count: wc, goal }) + delta
      : t('main.statusBar.wordCount', { count: wc }) + delta;
  }

  async updateProjectGoalBar(): Promise<void> {
    const project = this.plugin.projectManager.getActiveProject();
    const goal = project?.goals?.totalWordCount ?? 0;
    if (!project || goal <= 0) {
      this.projectGoalEl.addClass('ws-hidden');
      return;
    }
    const total = await this.plugin.statsTracker.getTotalWordCount();
    this.projectGoalEl.setText(t('main.statusBar.projectWords', { total: total.toLocaleString(), goal: goal.toLocaleString() }));
    this.projectGoalEl.removeClass('ws-hidden');
  }

  scheduleProjectGoalUpdate(): void {
    if (this.projectGoalTimer) window.clearTimeout(this.projectGoalTimer);
    this.projectGoalTimer = window.setTimeout(() => {
      void this.updateProjectGoalBar();
    }, 5000);
  }

  destroy(): void {
    if (this.projectGoalTimer) {
      window.clearTimeout(this.projectGoalTimer);
      this.projectGoalTimer = null;
    }
  }
}
