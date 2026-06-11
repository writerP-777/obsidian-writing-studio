import { App, MarkdownView } from 'obsidian';
import { Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type WritingStudioPlugin from '../main';
import { t } from './i18n';

const FOCUS_CLASS = 'writing-studio-focus-mode';
const FOCUS_FONT_CLASS = 'ws-focus-fontsize';
const FOCUS_PARA_CLASS = 'cm-ws-focus-para';

export class FocusMode {
  private plugin: WritingStudioPlugin;
  private app: App;
  private active = false;
  private toolbar: HTMLElement | null = null;
  private savedLeafStates: Map<string, boolean> = new Map();
  private editorExtension: Extension[] = [];

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.editorExtension = this.buildExtension();
  }

  isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) {
      this.disable();
    } else {
      this.enable();
    }
  }

  enable(): void {
    this.active = true;
    activeDocument.body.classList.add(FOCUS_CLASS);
    this.applyDimOpacity();
    this.applyFontSize();

    if (this.plugin.settings.focusAutoHideSidebars) {
      this.hideSidebars();
    }

    this.showToolbar();
  }

  disable(): void {
    this.active = false;
    activeDocument.body.classList.remove(FOCUS_CLASS);
    this.applyFontSize();

    if (this.plugin.settings.focusAutoHideSidebars) {
      this.restoreSidebars();
    }

    this.hideToolbar();
  }

  // Applies the focus font size override while focus mode is active.
  // 0 means no override: the class is absent and the theme default applies.
  applyFontSize(): void {
    const size = this.plugin.settings.focusFontSize || 0;
    if (this.active && size > 0) {
      activeDocument.documentElement.setCssProps({ '--ws-focus-font-size': `${size}px` });
      activeDocument.body.classList.add(FOCUS_FONT_CLASS);
    } else {
      activeDocument.body.classList.remove(FOCUS_FONT_CLASS);
    }
  }

  applyDimOpacity(): void {
    const opacity = (this.plugin.settings.dimOpacity || 20) / 100;
    activeDocument.documentElement.setCssProps({ '--ws-focus-dim-opacity': String(opacity) });
  }

  private hideSidebars(): void {
    const left = this.app.workspace.leftSplit;
    const right = this.app.workspace.rightSplit;
    if (left && !left.collapsed) {
      this.savedLeafStates.set('left', true);
      left.collapse();
    }
    if (right && !right.collapsed) {
      this.savedLeafStates.set('right', true);
      right.collapse();
    }
  }

  private restoreSidebars(): void {
    const left = this.app.workspace.leftSplit;
    const right = this.app.workspace.rightSplit;
    if (left && this.savedLeafStates.get('left')) {
      left.expand();
    }
    if (right && this.savedLeafStates.get('right')) {
      right.expand();
    }
    this.savedLeafStates.clear();
  }

  private showToolbar(): void {
    this.hideToolbar();
    const toolbar = createDiv({ cls: 'ws-focus-toolbar' });
    toolbar.createSpan({ cls: 'ws-focus-wordcount', text: t('focusToolbar.wordCount', { count: 0 }) });
    toolbar.createSpan({ cls: 'ws-focus-sprint-time ws-hidden' });
    const exitBtn = toolbar.createEl('button', { cls: 'ws-focus-exit', title: t('focusToolbar.exitTitle'), text: t('focusToolbar.exitBtn') });
    exitBtn.onclick = () => this.disable();

    activeDocument.body.appendChild(toolbar);
    this.toolbar = toolbar;
    this.updateToolbarWordCount();
  }

  private hideToolbar(): void {
    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
  }

  updateToolbarWordCount(count?: number): void {
    if (!this.toolbar) return;
    const el = this.toolbar.querySelector('.ws-focus-wordcount');
    if (el) {
      const n = count ?? this.getCurrentWordCount();
      el.textContent = t('focusToolbar.wordCount', { count: n });
    }
  }

  updateToolbarSprintTime(timeStr: string | null): void {
    if (!this.toolbar) return;
    const el = this.toolbar.querySelector<HTMLElement>('.ws-focus-sprint-time');
    if (el) {
      el.toggleClass('ws-hidden', !timeStr);
      if (timeStr) el.textContent = timeStr;
    }
  }

  private getCurrentWordCount(): number {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return 0;
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      const content = view.editor?.getValue() || '';
      return this.plugin.fmManager.countWords(content);
    }
    return 0;
  }

  getEditorExtension(): Extension[] {
    return this.editorExtension;
  }

  private buildExtension(): Extension[] {
    const plugin = this.plugin;

    const focusParaDecoration = Decoration.line({ class: FOCUS_PARA_CLASS });

    const focusPlugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.selectionSet) {
            this.decorations = this.buildDecorations(update.view);
          }
          if (plugin.focusMode.isActive() && plugin.settings.typewriterScroll && update.selectionSet) {
            plugin.focusMode.scrollToCursor(update.view);
          }
        }

        buildDecorations(view: EditorView): DecorationSet {
          // Build unconditionally: the dim styles only apply under the focus
          // body class, so keeping the focus-para marker current even while
          // inactive means enabling focus mode highlights the active
          // paragraph immediately instead of dimming everything until the
          // next cursor move.
          const builder = new RangeSetBuilder<Decoration>();
          const state = view.state;
          const sel = state.selection.main;
          const doc = state.doc;
          const cursorLine = doc.lineAt(sel.head);
          const isParaMode = plugin.settings.focusUnit !== 'sentence';

          if (isParaMode) {
            let start = cursorLine.number;
            let end = cursorLine.number;

            while (start > 1) {
              const prev = doc.line(start - 1);
              if (prev.text.trim() === '') break;
              start--;
            }
            while (end < doc.lines) {
              const next = doc.line(end + 1);
              if (next.text.trim() === '') break;
              end++;
            }

            for (let i = start; i <= end; i++) {
              const line = doc.line(i);
              builder.add(line.from, line.from, focusParaDecoration);
            }
          } else {
            // Sentence mode: highlight just the active line
            builder.add(cursorLine.from, cursorLine.from, focusParaDecoration);
          }

          return builder.finish();
        }
      },
      { decorations: (v) => v.decorations }
    );

    return [focusPlugin];
  }

  scrollToCursor(view: EditorView): void {
    const { head } = view.state.selection.main;
    window.requestAnimationFrame(() => {
      const coords = view.coordsAtPos(head);
      if (!coords) return;
      const scrollEl = view.scrollDOM;
      const viewMid = scrollEl.clientHeight / 2;
      const lineTop = coords.top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
      // 'auto' rather than 'smooth': rapid typing fires a scroll per
      // selection change, and queued smooth animations visibly jitter
      scrollEl.scrollTo({ top: lineTop - viewMid, behavior: 'auto' });
    });
  }

  destroy(): void {
    this.disable();
  }
}
