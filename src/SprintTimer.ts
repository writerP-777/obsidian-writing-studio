import { App, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { SprintSession, SprintState } from '../models/SprintSession';

export class SprintTimer {
  private plugin: WritingStudioPlugin;
  private app: App;
  private state: SprintState | null = null;
  private intervalId: number | null = null;
  private floatingEl: HTMLElement | null = null;
  private statusBarEl: HTMLElement | null = null;
  private onComplete: ((session: SprintSession) => void) | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  setStatusBar(el: HTMLElement): void {
    this.statusBarEl = el;
    el.style.display = 'none';
  }

  setOnComplete(cb: (session: SprintSession) => void): void {
    this.onComplete = cb;
  }

  isActive(): boolean {
    return this.state !== null && this.state.active;
  }

  start(durationMinutes: number, wordCountGoal?: number, projectScope: 'file' | 'project' = 'file'): void {
    if (this.state?.active) this.stop();

    this.state = {
      active: true,
      paused: false,
      startTime: Date.now(),
      pausedAt: 0,
      totalPausedMs: 0,
      durationMinutes,
      wordCountGoal,
      startWordCount: this.getCurrentWordCount(),
      projectScope,
    };

    this.showFloating();
    this.startInterval();
    new Notice(`Sprint started: ${durationMinutes} minutes`);
  }

  pause(): void {
    if (!this.state || !this.state.active || this.state.paused) return;
    this.state.paused = true;
    this.state.pausedAt = Date.now();
    this.stopInterval();
    this.updateDisplay();
  }

  resume(): void {
    if (!this.state || !this.state.active || !this.state.paused) return;
    this.state.totalPausedMs += Date.now() - this.state.pausedAt;
    this.state.paused = false;
    this.startInterval();
    this.updateDisplay();
  }

  stop(): void {
    if (!this.state) return;
    this.stopInterval();
    const session = this.buildSession();
    this.state = null;
    this.hideFloating();
    if (this.statusBarEl) this.statusBarEl.style.display = 'none';
    if (this.onComplete) this.onComplete(session);
  }

  private buildSession(): SprintSession {
    const s = this.state!;
    const wordsWritten = Math.max(0, this.getCurrentWordCount() - s.startWordCount);
    const now = new Date();

    return {
      id: `sprint-${Date.now()}`,
      date: now.toISOString(),
      duration: s.durationMinutes,
      wordsWritten,
      startWordCount: s.startWordCount,
      wordCountGoal: s.wordCountGoal,
      documents: this.getCurrentDocuments(),
      completed: true,
    };
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
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    if (this.getRemainingMs() <= 0) {
      this.handleComplete();
      return;
    }
    this.updateDisplay();
  }

  private handleComplete(): void {
    this.stopInterval();
    if (this.plugin.settings.soundNotifications) {
      this.playBell();
    }
    new Notice('Sprint complete! Great work.', 5000);
    const session = this.buildSession();
    this.state = null;
    this.hideFloating();
    if (this.statusBarEl) this.statusBarEl.style.display = 'none';
    if (this.onComplete) this.onComplete(session);
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
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    } catch { /* audio not available */ }
  }

  private updateDisplay(): void {
    const time = this.getFormattedRemaining();
    const paused = this.state?.paused ? ' ⏸' : '';
    const label = `⏱ ${time}${paused}`;

    if (this.floatingEl) {
      const timeEl = this.floatingEl.querySelector('.ws-sprint-time');
      if (timeEl) timeEl.textContent = time;
      const wc = this.getCurrentWordCount() - (this.state?.startWordCount || 0);
      const wcEl = this.floatingEl.querySelector('.ws-sprint-wc');
      if (wcEl) wcEl.textContent = `+${Math.max(0, wc)} words`;
      const pauseBtn = this.floatingEl.querySelector('.ws-sprint-pause') as HTMLButtonElement;
      if (pauseBtn) pauseBtn.textContent = this.state?.paused ? '▶' : '⏸';
    }

    if (this.statusBarEl) {
      this.statusBarEl.textContent = label;
      this.statusBarEl.style.display = '';
    }

    // Update focus toolbar
    this.plugin.focusMode.updateToolbarSprintTime(label);
  }

  private showFloating(): void {
    this.hideFloating();
    const el = document.createElement('div');
    el.className = 'ws-sprint-floating';
    el.innerHTML = `
      <div class="ws-sprint-header">Writing Sprint</div>
      <div class="ws-sprint-time">00:00</div>
      <div class="ws-sprint-wc">+0 words</div>
      <div class="ws-sprint-controls">
        <button class="ws-sprint-pause" title="Pause/Resume">⏸</button>
        <button class="ws-sprint-stop" title="Stop Sprint">■</button>
      </div>
    `;

    const pauseBtn = el.querySelector('.ws-sprint-pause') as HTMLButtonElement;
    pauseBtn.onclick = () => {
      if (this.state?.paused) this.resume();
      else this.pause();
    };

    const stopBtn = el.querySelector('.ws-sprint-stop') as HTMLButtonElement;
    stopBtn.onclick = () => this.stop();

    document.body.appendChild(el);
    this.floatingEl = el;
    this.updateDisplay();
  }

  private hideFloating(): void {
    if (this.floatingEl) {
      this.floatingEl.remove();
      this.floatingEl = null;
    }
  }

  private getCurrentWordCount(): number {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return 0;
    const view = leaf.view;
    if ('editor' in view) {
      const content = (view as any).editor?.getValue() || '';
      return this.plugin.fmManager.countWords(content);
    }
    return 0;
  }

  private getCurrentDocuments(): string[] {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return [];
    const file = (leaf.view as any).file;
    return file ? [file.path] : [];
  }

  destroy(): void {
    this.stopInterval();
    this.hideFloating();
  }
}
