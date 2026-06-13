import { App, MarkdownView, Notice, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { SprintSession, SprintState } from '../models/SprintSession';
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

export class SprintTimer {
  private plugin: WritingStudioPlugin;
  private app: App;
  private state: SprintState | null = null;
  private intervalId: number | null = null;
  private tickCount = 0;
  private floatingEl: HTMLElement | null = null;
  private statusBarEl: HTMLElement | null = null;
  private onComplete: ((session: SprintSession) => void | Promise<void>) | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  setStatusBar(el: HTMLElement): void {
    this.statusBarEl = el;
    el.addClass('ws-hidden');
  }

  setOnComplete(cb: (session: SprintSession) => void | Promise<void>): void {
    this.onComplete = cb;
  }

  isActive(): boolean {
    return this.state !== null && this.state.active;
  }

  // Armed but not started — the overlay is showing its ready state
  isReady(): boolean {
    return this.state !== null && this.state.ready;
  }

  getDurationMinutes(): number | null {
    return this.state?.durationMinutes ?? null;
  }

  // Opens overlay in paused/ready state — called by SprintModal and preset buttons.
  // The clock does not run until the user presses Start on the overlay itself.
  setup(durationMinutes: number, wordCountGoal?: number, projectScope: 'file' | 'project' = 'file'): void {
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
      new Notice(t('sprint.started', { minutes: this.state.durationMinutes }));
    }
  }

  stop(): void {
    if (!this.state) return;
    const wasReady = this.state.ready;
    this.stopInterval();
    const session = wasReady ? null : this.buildSession();
    this.state = null;
    this.hideFloating();
    if (this.statusBarEl) this.statusBarEl.addClass('ws-hidden');
    this.plugin.studioEvents.announceSprintChanged();
    if (!wasReady && session && this.onComplete) void this.onComplete(session);
  }

  private buildSession(): SprintSession {
    this.sampleActiveFile();
    const s = this.state!;
    const wordsWritten = this.getWordsWritten();
    const documents = this.getCountedDocuments();
    const startWordCount = documents.reduce((sum, p) => sum + (s.baselines.get(p) ?? 0), 0);

    return {
      id: `sprint-${Date.now()}`,
      date: new Date().toISOString(),
      duration: s.durationMinutes,
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

  getRemainingMs(): number {
    if (!this.state) return 0;
    const totalMs = this.state.durationMinutes * 60 * 1000;
    return Math.max(0, totalMs - this.getElapsedMs());
  }

  getFormattedRemaining(): string {
    const ms = this.getRemainingMs();
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
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
    }
    this.updateDisplay();
  }

  private handleComplete(): void {
    this.stopInterval();
    this.sampleActiveFile();
    if (this.plugin.settings.soundNotifications) {
      this.playBell();
    }
    new Notice(t('sprint.complete'), 5000);
    const session = this.buildSession();
    this.state = null;
    this.hideFloating();
    if (this.statusBarEl) this.statusBarEl.addClass('ws-hidden');
    if (this.onComplete) void this.onComplete(session);
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
    const time = this.getFormattedRemaining();
    const paused = this.state?.paused && !this.state?.ready ? ' ⏸' : '';
    const label = `⏱ ${time}${paused}`;

    if (this.floatingEl) {
      const timeEl = this.floatingEl.querySelector('.ws-sprint-time');
      if (timeEl) timeEl.textContent = time;

      const wcEl = this.floatingEl.querySelector('.ws-sprint-wc');
      if (wcEl) wcEl.textContent = t('sprint.words', { n: this.getWordsWritten() });

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

    activeDocument.body.appendChild(el);
    this.floatingEl = el;
    this.makeDraggable(el);
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
