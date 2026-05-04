import { App, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingModeType, WRITING_MODE_CONFIGS } from '../models/WritingMode';

export class WritingModes {
  private plugin: WritingStudioPlugin;
  private app: App;
  private currentMode: WritingModeType = 'none';
  private statusBarEl: HTMLElement | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  setStatusBar(el: HTMLElement): void {
    this.statusBarEl = el;
  }

  getCurrentMode(): WritingModeType {
    return this.currentMode;
  }

  async switchMode(mode: WritingModeType): Promise<void> {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    const config = WRITING_MODE_CONFIGS[mode];

    // Focus Mode
    if (config.focusMode && !this.plugin.focusMode.isActive()) {
      this.plugin.focusMode.enable();
    } else if (!config.focusMode && this.plugin.focusMode.isActive()) {
      this.plugin.focusMode.disable();
    }

    // Typography Mode
    if (config.typographyMode && !this.plugin.typographyMode.isActive()) {
      this.plugin.typographyMode.enable();
    } else if (!config.typographyMode && this.plugin.typographyMode.isActive()) {
      this.plugin.typographyMode.disable();
    }

    // Binder
    if (config.binderOpen) {
      await this.plugin.openBinder();
    }

    // Sidebars
    if (!config.sidebarsVisible) {
      this.collapseSidebars();
    } else {
      this.expandSidebars();
    }

    // Reading View
    if (config.forceReadingView) {
      this.forceReadingView();
    }

    this.updateStatusBar();
    this.plugin.settings.currentWritingMode = mode;
    await this.plugin.saveSettings();

    const modeLabel = mode === 'none' ? 'Normal' : mode.charAt(0).toUpperCase() + mode.slice(1);
    new Notice(`Writing Studio: ${modeLabel} mode`);
  }

  private collapseSidebars(): void {
    const left = this.app.workspace.leftSplit;
    const right = this.app.workspace.rightSplit;
    if (left && !left.collapsed) left.collapse();
    if (right && !right.collapsed) right.collapse();
  }

  private expandSidebars(): void {
    const left = this.app.workspace.leftSplit;
    const right = this.app.workspace.rightSplit;
    if (left && left.collapsed) left.expand();
    if (right && right.collapsed) right.expand();
  }

  private forceReadingView(): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (leaf && leaf.view.getViewType() === 'markdown') {
      (leaf.view as any).setState({ mode: 'preview' }, { history: false });
    }
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl) return;
    const labels: Record<WritingModeType, string> = {
      draft: '✍ Draft',
      edit: '✎ Edit',
      review: '👁 Review',
      none: '',
    };
    this.statusBarEl.textContent = labels[this.currentMode] || '';
    this.statusBarEl.toggleClass('ws-hidden', this.currentMode === 'none');
  }

  restore(): void {
    const saved = this.plugin.settings.currentWritingMode;
    if (saved && saved !== 'none') {
      void this.switchMode(saved);
    }
  }

  destroy(): void {
    if (this.currentMode !== 'none') {
      void this.switchMode('none');
    }
  }
}
