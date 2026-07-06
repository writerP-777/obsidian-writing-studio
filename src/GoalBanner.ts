import { MarkdownView } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { t } from './i18n';

// The inline word-count-goal banner: a progress bar injected between the
// editor toolbar and the document content when the active file has a word
// count goal. One banner at a time, tied to the most recent leaf.
export class GoalBanner {
  private plugin: WritingStudioPlugin;
  private generation = 0;
  private currentGoal = 0;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
  }

  // Patch the live banner in place so it updates while the user types,
  // without the async goal lookup show() performs.
  patch(wc: number): void {
    if (this.currentGoal <= 0) return;
    const banner = activeDocument.querySelector('.ws-inline-goal-banner');
    if (!banner) return;
    const pct = Math.min(100, Math.round((wc / this.currentGoal) * 100));
    const textEl = banner.querySelector('.ws-goal-text');
    const barEl = banner.querySelector<HTMLElement>('.ws-goal-bar');
    if (textEl) textEl.textContent = t('main.statusBar.goalBanner', { count: wc, goal: this.currentGoal, pct });
    if (barEl) barEl.setCssProps({ '--ws-bar-width': `${pct}%` });
  }

  async show(): Promise<void> {
    // Increment generation so any stale in-flight call abandons its result.
    const gen = ++this.generation;

    activeDocument.querySelectorAll('.ws-inline-goal-banner').forEach(el => el.remove());

    if (!this.plugin.settings.inlineGoalBanner) return;

    const leaf = this.plugin.app.workspace.getMostRecentLeaf();
    if (!leaf) return;

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;

    const file = view.file;
    if (!file) return;

    const goal = this.plugin.projectManager.getWordCountGoalForFile(file);
    if (gen !== this.generation) return;
    if (!goal || goal <= 0) return;

    // Store so patch() can refresh the bar without an async lookup.
    this.currentGoal = goal;

    const content = view.editor.getValue();
    const wc = this.plugin.fmManager.countWords(content);
    const pct = Math.min(100, Math.round((wc / goal) * 100));

    if (gen !== this.generation) return;

    // Position: find .view-header (the toolbar row) inside the leaf container and
    // insert the banner immediately after it. This places the banner between the
    // bottom edge of the toolbar and the top of the document content area,
    // regardless of which child element the CM6 editor happens to live in.
    const viewHeader = leaf.view.containerEl.querySelector(':scope > .view-header');
    if (!viewHeader) return;

    // Final duplicate guard after all async work is done.
    leaf.view.containerEl.querySelectorAll('.ws-inline-goal-banner').forEach(el => el.remove());

    const banner = createDiv({ cls: 'ws-inline-goal-banner' });
    banner.createSpan({ cls: 'ws-goal-text', text: t('main.statusBar.goalBanner', { count: wc, goal, pct }) });
    const barWrap = banner.createDiv({ cls: 'ws-goal-bar-wrap' });
    const barEl = barWrap.createDiv({ cls: 'ws-goal-bar' });
    barEl.setCssProps({ '--ws-bar-width': `${pct}%` });
    const dismissBtn = banner.createEl('button', { cls: 'ws-goal-dismiss', title: t('main.statusBar.dismiss'), text: '✕' });
    dismissBtn.addEventListener('click', () => banner.remove());
    viewHeader.insertAdjacentElement('afterend', banner);
  }

  destroy(): void {
    activeDocument.querySelectorAll('.ws-inline-goal-banner').forEach(el => el.remove());
  }
}
