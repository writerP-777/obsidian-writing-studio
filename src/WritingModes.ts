import { App, MarkdownView, Notice } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingModeType, WRITING_MODE_CONFIGS } from '../models/WritingMode';
import { t } from './i18n';

export class WritingModes {
  private plugin: WritingStudioPlugin;
  private app: App;
  private currentMode: WritingModeType = 'none';
  private statusBarEl: HTMLElement | null = null;
  private reviewPrior: { leaf: WorkspaceLeaf; mode: string } | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  setStatusBar(el: HTMLElement): void {
    this.statusBarEl = el;
    this.updateStatusBar();
  }

  getCurrentMode(): WritingModeType {
    return this.currentMode;
  }

  async switchMode(mode: WritingModeType, silent = false): Promise<void> {
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
      await this.plugin.typographyMode.enable();
    } else if (!config.typographyMode && this.plugin.typographyMode.isActive()) {
      await this.plugin.typographyMode.disable();
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
    } else {
      this.restoreEditorViewMode();
    }

    this.updateStatusBar();
    this.plugin.settings.currentWritingMode = mode;
    await this.plugin.saveSettings();

    if (!silent) {
      const modeLabel = mode === 'none' ? t('writingModes.normal') : t(`launcher.mode.${mode}`);
      new Notice(t('writingModes.switchedTo', { mode: modeLabel }));
    }
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
    if (!leaf || !(leaf.view instanceof MarkdownView)) return;
    const mode = leaf.view.getMode();
    if (mode !== 'preview') {
      this.reviewPrior = { leaf, mode };
    }
    void this.setLeafMode(leaf, 'preview');
  }

  private restoreEditorViewMode(): void {
    const prior = this.reviewPrior;
    this.reviewPrior = null;
    if (!prior || !(prior.leaf.view instanceof MarkdownView)) return;
    void this.setLeafMode(prior.leaf, prior.mode);
  }

  private async setLeafMode(leaf: WorkspaceLeaf, mode: string): Promise<void> {
    const state = leaf.getViewState();
    await leaf.setViewState({ ...state, state: { ...state.state, mode } });
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl) return;
    const labels: Record<WritingModeType, string> = {
      draft: t('writingModes.statusDraft'),
      edit: t('writingModes.statusEdit'),
      review: t('writingModes.statusReview'),
      none: t('writingModes.statusNone'),
    };
    this.statusBarEl.textContent = labels[this.currentMode];
    this.statusBarEl.toggleClass('ws-status-mode--active', this.currentMode !== 'none');
  }

  restore(): void {
    const saved = this.plugin.settings.currentWritingMode;
    if (saved && saved !== 'none') {
      // Silent: a startup restore should not toast on every launch
      void this.switchMode(saved, true);
    }
  }

  destroy(): void {
    // Teardown restores workspace state only — it must never write settings.
    // switchMode('none') here would persist 'none' on every clean shutdown,
    // leaving restore() nothing to restore.
    if (this.currentMode === 'none') return;
    const config = WRITING_MODE_CONFIGS[this.currentMode];
    if (!config.sidebarsVisible) {
      this.expandSidebars();
    }
    this.restoreEditorViewMode();
    this.currentMode = 'none';
  }
}
