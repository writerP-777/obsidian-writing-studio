import { App, WorkspaceLeaf } from 'obsidian';
import { Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type WritingStudioPlugin from '../main';

const FOCUS_CLASS = 'writing-studio-focus-mode';
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
    document.body.classList.add(FOCUS_CLASS);
    this.applyDimOpacity();

    if (this.plugin.settings.focusAutoHideSidebars) {
      this.hideSidebars();
    }

    this.showToolbar();
  }

  disable(): void {
    this.active = false;
    document.body.classList.remove(FOCUS_CLASS);

    if (this.plugin.settings.focusAutoHideSidebars) {
      this.restoreSidebars();
    }

    this.hideToolbar();
  }

  private applyDimOpacity(): void {
    const opacity = (this.plugin.settings.dimOpacity || 20) / 100;
    document.documentElement.style.setProperty('--ws-focus-dim-opacity', String(opacity));
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
    const toolbar = document.createElement('div');
    toolbar.className = 'ws-focus-toolbar';
    toolbar.innerHTML = `
      <span class="ws-focus-wordcount">0 words</span>
      <span class="ws-focus-sprint-time" style="display:none"></span>
      <button class="ws-focus-exit" title="Exit Focus Mode (Esc)">✕ Exit</button>
    `;

    const exitBtn = toolbar.querySelector('.ws-focus-exit') as HTMLButtonElement;
    exitBtn.onclick = () => this.disable();

    document.body.appendChild(toolbar);
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
      el.textContent = `${n} word${n === 1 ? '' : 's'}`;
    }
  }

  updateToolbarSprintTime(timeStr: string | null): void {
    if (!this.toolbar) return;
    const el = this.toolbar.querySelector('.ws-focus-sprint-time') as HTMLElement;
    if (el) {
      if (timeStr) {
        el.style.display = '';
        el.textContent = timeStr;
      } else {
        el.style.display = 'none';
      }
    }
  }

  private getCurrentWordCount(): number {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return 0;
    const view = leaf.view;
    if ('editor' in view) {
      const editor = (view as any).editor;
      if (editor) {
        const content = editor.getValue();
        return this.plugin.fmManager.countWords(content);
      }
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
          if (!plugin.focusMode.isActive()) return Decoration.none;

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
    requestAnimationFrame(() => {
      const coords = view.coordsAtPos(head);
      if (!coords) return;
      const scrollEl = view.scrollDOM;
      const viewMid = scrollEl.clientHeight / 2;
      const lineTop = coords.top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
      scrollEl.scrollTo({ top: lineTop - viewMid, behavior: 'smooth' });
    });
  }

  destroy(): void {
    this.disable();
  }
}
