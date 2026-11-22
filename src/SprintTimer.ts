import { App, MarkdownView, Notice, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { SprintEndReason, SprintSession, SprintState } from '../models/SprintSession';
import { t } from './i18n';

// Pure word-accounting over the per-file baselines captured during a sprint.
// 'file' scope counts only the document active when the clock started;
// 'project' scope sums every tracked file (limited to the project folder when one is active).
export function computeSprintWords(
  scope: 'file' | 'project',
  primaryFile: string | null,
  baselines: ReadonlyMap<string, number>,
  currents: ReadonlyMap<string, number>,
  projectPrefix: string | null
): number {
  if (scope === 'project') {
    let total = 0;
    for (const [path, current] of currents) {
      if (projectPrefix && !path.startsWith(projectPrefix)) continue;
      const baseline = baselines.get(path) ?? current;
      total += Math.max(0, current - baseline);
    }
    return total;
  }
  if (!primaryFile) return 0;
  const baseline = baselines.get(primaryFile) ?? 0;
  const current = currents.get(primaryFile) ?? baseline;
  return Math.max(0, current - baseline);
}

// Minutes recorded for a finished sprint: the planned length when the time
// limit ran out, otherwise the time actually written (never under a minute)
export function recordedSprintMinutes(
  durationMinutes: number | null,
  elapsedMs: number,
  ranToEnd: boolean
): number {
  if (ranToEnd && durationMinutes !== null) return durationMinutes;
  return Math.max(1, Math.round(elapsedMs / 60000));
}

// The clock a sprint shows: time remaining under a time limit (rounded up, so
// the last second reads 00:01), time written so far when there is no limit
export function formatSprintClock(durationMinutes: number | null, elapsedMs: number): string {
  const elapsed = Math.max(0, elapsedMs);
  const totalSec = durationMinutes === null
    ? Math.floor(elapsed / 1000)
    : Math.ceil(Math.max(0, durationMinutes * 60000 - elapsed) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// True the first time the words written reach the sprint's word count goal
export function goalJustReached(goal: number | undefined, words: number, announced: boolean): boolean {
  return !!goal && goal > 0 && !announced && words >= goal;
}

export class SprintTimer {
  private plugin: WritingStudioPlugin;
  private app: App;
  private state: SprintState | null = null;
  private intervalId: number | null = null;
  private tickCount = 0;
  private floatingEl: HTMLElement | null = null;
  private statusBarEl: HTMLElement | null = null;
  private onComplete: ((session: SprintSession, endedBy: SprintEndReason) => void | Promise<void>) | null = null;
  private onViewSummary: ((session: SprintSession) => void) | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  setStatusBar(el: HTMLElement): void {
    this.statusBarEl = el;
    el.addClass('ws-hidden');
  }

  // Called once when a sprint ends, with how it ended. The handler records the
  // session; it must not open a dialog on 'timeout' — the writer may still be
  // typing (#451)
  setOnComplete(cb: (session: SprintSession, endedBy: SprintEndReason) => void | Promise<void>): void {
    this.onComplete = cb;
  }

  // Called when the writer clicks "View summary" on the finished overlay
  setOnViewSummary(cb: (session: SprintSession) => void): void {
    this.onViewSummary = cb;
  }

  isActive(): boolean {
    return this.state !== null && this.state.active;
  }

  // Armed but not started — the overlay is showing its ready state
  isReady(): boolean {
    return this.state !== null && this.state.ready;
  }

  // The time limit in minutes; null when no sprint is set up or it has no limit
  getDurationMinutes(): number | null {
    return this.state?.durationMinutes ?? null;
  }

  getWordCountGoal(): number | null {
    return this.state?.wordCountGoal ?? null;
  }

  // Opens overlay in paused/ready state — called by SprintModal and preset buttons.
  // The clock does not run until the user presses Start on the overlay itself.
  // A null duration means no time limit: the sprint runs until it is stopped.
  setup(durationMinutes: number | null, wordCountGoal?: number, projectScope: 'file' | 'project' = 'file'): void {
    if (this.state?.active && !this.state.ready) {
      // A sprint is running — refuse rather than silently logging it and
      // popping the summary modal in the middle of starting a new one
      new Notice(t('sprint.alreadyRunning'));
      return;
    }

    this.state = {
      active: true,
      paused: true,
      ready: true,
      startTime: Date.now(),
      pausedAt: Date.now(),
      totalPausedMs: 0,
      durationMinutes,
      wordCountGoal,
      goalAnnounced: false,
      primaryFile: null,
      baselines: new Map(),
      currents: new Map(),
      projectScope,
    };

    this.showFloating();
    this.updateDisplay();
    this.plugin.studioEvents.announceSprintChanged();
  }

  pause(): void {
    if (!this.state || !this.state.active || this.state.paused) return;
    this.sampleActiveFile();
    this.checkGoal();
    this.state.paused = true;
    this.state.pausedAt = Date.now();
    this.stopInterval();
    this.updateDisplay();
  }

  resume(): void {
    if (!this.state || !this.state.active || !this.state.paused) return;
    const wasReady = this.state.ready;
    this.state.totalPausedMs += Date.now() - this.state.pausedAt;
    this.state.paused = false;
    this.state.ready = false;
    if (wasReady) {
      // The clock starts now — capture the baseline here, not at setup, so
      // "navigate to your draft before the clock begins" works as documented
      this.state.baselines.clear();
      this.state.currents.clear();
      this.sampleActiveFile();
      this.state.primaryFile = this.getActiveFilePath();
    }
    this.startInterval();
    this.updateDisplay();
    this.plugin.studioEvents.announceSprintChanged();
    if (wasReady) {
      new Notice(this.state.durationMinutes !== null
        ? t('sprint.started', { minutes: this.state.durationMinutes })
        : t('sprint.startedGoal', { words: this.state.wordCountGoal ?? 0 }));
    }
  }

  stop(): void {
    if (!this.state) return;
    const wasReady = this.state.ready;
    this.stopInterval();
    const session = wasReady ? null : this.buildSession(false);
    this.state = null;
    this.hideFloating();
    this.clearIndicators();
    this.plugin.studioEvents.announceSprintChanged();
    if (session && this.onComplete) void this.onComplete(session, 'stopped');
  }

  // The status bar item and the focus toolbar label show a running sprint only
  private clearIndicators(): void {
    if (this.statusBarEl) this.statusBarEl.addClass('ws-hidden');
    this.plugin.focusMode.updateToolbarSprintTime(null);
  }

  private buildSession(ranToEnd: boolean): SprintSession {
    this.sampleActiveFile();
    const s = this.state!;
    const wordsWritten = this.getWordsWritten();
    const documents = this.getCountedDocuments();
    const startWordCount = documents.reduce((sum, p) => sum + (s.baselines.get(p) ?? 0), 0);

    return {
      id: `sprint-${Date.now()}`,
      date: new Date().toISOString(),
      duration: recordedSprintMinutes(s.durationMinutes, this.getElapsedMs(), ranToEnd),
      wordsWritten,
      startWordCount,
      wordCountGoal: s.wordCountGoal,
      documents,
      completed: true,
    };
  }

  private getWordsWritten(): number {
    const s = this.state;
    if (!s) return 0;
    return computeSprintWords(s.projectScope, s.primaryFile, s.baselines, s.currents, this.getProjectPrefix());
  }

  // Files whose words count toward this sprint, given its scope
  private getCountedDocuments(): string[] {
    const s = this.state;
    if (!s) return [];
    if (s.projectScope === 'project') {
      const prefix = this.getProjectPrefix();
      return [...s.currents.keys()].filter(p => !prefix || p.startsWith(prefix));
    }
    return s.primaryFile ? [s.primaryFile] : [];
  }

  private getProjectPrefix(): string | null {
    if (this.state?.projectScope !== 'project') return null;
    const project = this.plugin.projectManager.getActiveProject();
    return project ? normalizePath(project.folderPath) + '/' : null;
  }

  getElapsedMs(): number {
    if (!this.state) return 0;
    const now = this.state.paused ? this.state.pausedAt : Date.now();
    return now - this.state.startTime - this.state.totalPausedMs;
  }

  // Time left under the time limit; Infinity when the sprint has none
  getRemainingMs(): number {
    if (!this.state) return 0;
    if (this.state.durationMinutes === null) return Infinity;
    const totalMs = this.state.durationMinutes * 60 * 1000;
    return Math.max(0, totalMs - this.getElapsedMs());
  }

  // Countdown under a time limit, time written so far without one
  getFormattedClock(): string {
    if (!this.state) return '00:00';
    return formatSprintClock(this.state.durationMinutes, this.getElapsedMs());
  }

  private startInterval(): void {
    this.intervalId = window.setInterval(() => this.tick(), 1000);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    if (this.getRemainingMs() <= 0) {
      this.handleComplete();
      return;
    }
    // Sample word counts every 5th tick — re-counting a book-length document
    // every second is wasteful; the clock still updates every second
    if (++this.tickCount % 5 === 0) {
      this.sampleActiveFile();
      this.checkGoal();
    }
    this.updateDisplay();
  }

  // Reaching the word count goal is announced once and the sprint keeps
  // running — ending it here would interrupt a writer in mid-sentence (#451)
  private checkGoal(): void {
    const s = this.state;
    if (!s || s.ready) return;
    if (!goalJustReached(s.wordCountGoal, this.getWordsWritten(), s.goalAnnounced)) return;
    s.goalAnnounced = true;
    if (this.plugin.settings.soundNotifications) {
      this.playBell();
    }
    new Notice(t('sprint.goalReached', { words: s.wordCountGoal ?? 0 }), 5000);
  }

  // The time limit ran out. Nothing here may take keyboard focus: the overlay
  // changes to its finished state and the summary waits for a click (#451)
  private handleComplete(): void {
    this.stopInterval();
    this.sampleActiveFile();
    if (this.plugin.settings.soundNotifications) {
      this.playBell();
    }
    new Notice(t('sprint.complete'), 5000);
    const session = this.buildSession(true);
    this.state = null;
    this.showFinished(session);
    this.clearIndicators();
    this.plugin.studioEvents.announceSprintChanged();
    if (this.onComplete) void this.onComplete(session, 'timeout');
  }

  private playBell(): void {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.onended = () => { void ctx.close(); };
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    } catch { /* audio not available */ }
  }

  private updateDisplay(): void {
    const time = this.getFormattedClock();
    const paused = this.state?.paused && !this.state?.ready ? ' ⏸' : '';
    const label = `⏱ ${time}${paused}`;

    if (this.floatingEl) {
      const timeEl = this.floatingEl.querySelector('.ws-sprint-time');
      if (timeEl) timeEl.textContent = time;

      const wcEl = this.floatingEl.querySelector('.ws-sprint-wc');
      if (wcEl) {
        const words = this.getWordsWritten();
        const goal = this.state?.wordCountGoal;
        wcEl.textContent = goal
          ? t('sprint.wordsOfGoal', { n: words, goal })
          : t('sprint.words', { n: words });
        wcEl.toggleClass('is-goal-reached', !!goal && words >= goal);
      }

      const pauseBtn = this.floatingEl.querySelector('.ws-sprint-pause') as HTMLButtonElement;
      if (pauseBtn) {
        if (this.state?.ready) {
          pauseBtn.textContent = '▶';
          pauseBtn.title = t('sprint.startTitle');
        } else if (this.state?.paused) {
          pauseBtn.textContent = '▶';
          pauseBtn.title = t('sprint.resumeTitle');
        } else {
          pauseBtn.textContent = '⏸';
          pauseBtn.title = t('sprint.pauseTitle');
        }
      }
    }

    if (this.statusBarEl) {
      this.statusBarEl.textContent = label;
      this.statusBarEl.removeClass('ws-hidden');
    }

    this.plugin.focusMode.updateToolbarSprintTime(label);
  }

  private showFloating(): void {
    this.hideFloating();
    const el = createDiv({ cls: 'ws-sprint-floating' });
    el.createDiv({ cls: 'ws-sprint-header', text: t('sprint.header') });
    el.createDiv({ cls: 'ws-sprint-time', text: '00:00' });
    el.createDiv({ cls: 'ws-sprint-wc', text: t('sprint.words', { n: 0 }) });

    const controls = el.createDiv({ cls: 'ws-sprint-controls' });
    const pauseBtn = controls.createEl('button', {
      cls: 'ws-sprint-pause',
      title: t('sprint.startTitle'),
      text: '▶',
    });
    const stopBtn = controls.createEl('button', {
      cls: 'ws-sprint-stop',
      title: t('sprint.stopTitle'),
      text: '■',
    });

    pauseBtn.onclick = () => {
      if (this.state?.paused) this.resume();
      else this.pause();
    };

    stopBtn.onclick = () => this.stop();
    this.keepEditorFocus(controls);

    activeDocument.body.appendChild(el);
    this.floatingEl = el;
    this.makeDraggable(el);
  }

  // The overlay after the time limit ran out: the result and two buttons, in
  // the place the writer left it. It stays until dismissed or a new sprint
  // is set up.
  private showFinished(session: SprintSession): void {
    const el = this.floatingEl;
    if (!el) return;
    el.addClass('ws-sprint-floating--finished');
    el.querySelector('.ws-sprint-time')?.remove();
    el.querySelector('.ws-sprint-wc')?.remove();
    el.querySelector('.ws-sprint-controls')?.remove();

    el.createDiv({ cls: 'ws-sprint-finished', text: t('sprint.finished') });
    el.createDiv({
      cls: 'ws-sprint-wc',
      text: t('sprint.finishedStats', { n: session.wordsWritten, minutes: session.duration }),
    });

    const controls = el.createDiv({ cls: 'ws-sprint-controls' });
    const viewBtn = controls.createEl('button', { cls: 'ws-sprint-view', text: t('sprint.viewSummary') });
    const closeBtn = controls.createEl('button', { cls: 'ws-sprint-close', text: t('sprint.close') });
    viewBtn.onclick = () => {
      this.hideFloating();
      this.onViewSummary?.(session);
    };
    closeBtn.onclick = () => this.hideFloating();
    this.keepEditorFocus(controls);
    this.keepInWindow(el);
  }

  // Clicking an overlay button must not pull keyboard focus out of the editor
  private keepEditorFocus(controls: HTMLElement): void {
    controls.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
  }

  // The finished state is wider than the running one — a dragged overlay near
  // the window edge is nudged back inside
  private keepInWindow(el: HTMLElement): void {
    if (!el.hasClass('ws-sprint-floating--dragged')) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(0, Math.min(activeWindow.innerWidth - el.offsetWidth, rect.left));
    const top = Math.max(0, Math.min(activeWindow.innerHeight - el.offsetHeight, rect.top));
    el.setCssProps({ '--ws-float-x': `${left}px`, '--ws-float-y': `${top}px` });
  }

  private makeDraggable(el: HTMLElement): void {
    const header = el.querySelector('.ws-sprint-header') as HTMLElement;
    if (!header) return;
    header.addClass('ws-draggable');

    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const left = Math.max(0, Math.min(activeWindow.innerWidth - el.offsetWidth, startLeft + dx));
      const top = Math.max(0, Math.min(activeWindow.innerHeight - el.offsetHeight, startTop + dy));
      el.addClass('ws-sprint-floating--dragged');
      el.setCssProps({ '--ws-float-x': `${left}px`, '--ws-float-y': `${top}px` });
    };

    const onUp = () => {
      activeDocument.removeEventListener('mousemove', onMove);
      activeDocument.removeEventListener('mouseup', onUp);
      header.removeClass('ws-dragging');
    };

    header.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      header.addClass('ws-dragging');
      activeDocument.addEventListener('mousemove', onMove);
      activeDocument.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  private hideFloating(): void {
    if (this.floatingEl) {
      this.floatingEl.remove();
      this.floatingEl = null;
    }
  }

  // Record the active file's current word count, setting its baseline the
  // first time it is seen during this sprint
  private sampleActiveFile(): void {
    const s = this.state;
    if (!s) return;
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) return;
    const path = view.file.path;
    const count = this.plugin.fmManager.countWords(view.editor?.getValue() || '');
    if (!s.baselines.has(path)) {
      s.baselines.set(path, count);
    }
    s.currents.set(path, count);
  }

  private getActiveFilePath(): string | null {
    const leaf = this.app.workspace.getMostRecentLeaf();
    const view = leaf?.view;
    return view instanceof MarkdownView ? view.file?.path ?? null : null;
  }

  destroy(): void {
    this.stopInterval();
    this.hideFloating();
  }
}
