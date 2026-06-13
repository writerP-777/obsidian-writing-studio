import { App, MarkdownView, Notice, setIcon } from 'obsidian';
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
    // An explicit mode switch counts as launching the studio. Ordered after
    // currentMode is set so activation skips its saved-mode restore — the
    // user's fresh choice beats the previous session.
    this.plugin.activateStudio();
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
    this.plugin.studioEvents.announceModeChanged(mode);
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
    const mode = this.currentMode;
    this.statusBarEl.empty();
    // With no mode active the pill is meaningless — hide it entirely rather
    // than show a placeholder. Independent of the launch-gating ws-hidden
    // class managed by StatusBar.reveal().
    this.statusBarEl.toggleClass('ws-status-mode-empty', mode === 'none');
    this.statusBarEl.toggleClass('ws-status-mode--active', mode !== 'none');
    if (mode === 'none') return;
    const icons: Record<Exclude<WritingModeType, 'none'>, string> = {
      draft: 'pencil',
      edit: 'edit-3',
      review: 'eye',
    };
    const labels: Record<Exclude<WritingModeType, 'none'>, string> = {
      draft: t('writingModes.statusDraft'),
      edit: t('writingModes.statusEdit'),
      review: t('writingModes.statusReview'),
    };
    setIcon(this.statusBarEl.createSpan('ws-status-mode-icon'), icons[mode]);
    this.statusBarEl.createSpan({ text: labels[mode] });
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
