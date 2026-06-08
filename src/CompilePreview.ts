import { ItemView, WorkspaceLeaf, MarkdownRenderer } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ExportOptions } from './ExportEngine';
import { ExportModal } from '../modals/ExportModal';
import { t } from './i18n';

export const COMPILE_PREVIEW_VIEW_TYPE = 'writing-studio-compile-preview';

export class CompilePreviewView extends ItemView {
  private plugin: WritingStudioPlugin;
  private content = '';
  private jumpItems: Array<{ title: string; id: string }> = [];

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return COMPILE_PREVIEW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('compilePreview.displayText');
  }

  getIcon(): string {
    return 'layers';
  }

  onOpen(): Promise<void> {
    this.render();
    return Promise.resolve();
  }

  async loadContent(opts: Partial<ExportOptions> = {}): Promise<void> {
    const exportOpts: ExportOptions = {
      format: 'md',
      scope: 'project',
      includeFrontmatter: false,
      includeResearch: opts.includeResearch || false,
      includeTitlesAsHeadings: true,
      paperSize: 'letter',
      font: '',
      fontSize: 12,
      addTitlePage: true,
    };

    this.content = await this.plugin.exportEngine.compileContent(exportOpts);
    this.buildJumpItems();
    this.render();
  }

  private buildJumpItems(): void {
    this.jumpItems = [];
    const lines = this.content.split('\n');
    for (const line of lines) {
      const h1 = line.match(/^# (.+)$/);
      if (h1) {
        const title = h1[1];
        const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        this.jumpItems.push({ title, id });
      }
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ws-compile-preview-container');

    // Toolbar
    const toolbar = container.createDiv('ws-compile-toolbar');

    const jumpSel = toolbar.createEl('select', { cls: 'ws-compile-jump' });
    const defaultOpt = jumpSel.createEl('option', { text: t('compilePreview.jumpToSection') });
    defaultOpt.value = '';
    for (const item of this.jumpItems) {
      const opt = jumpSel.createEl('option', { text: item.title });
      opt.value = item.id;
    }
    jumpSel.onchange = () => {
      const id = jumpSel.value;
      if (!id) return;
      const el = container.querySelector(`[data-section-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    const exportBtn = toolbar.createEl('button', {
      cls: 'ws-compile-export-btn mod-cta',
      text: t('compilePreview.proceedToExport'),
    });
    exportBtn.onclick = () => {
      new ExportModal(this.app, this.plugin, 'project').open();
    };

    const closeBtn = toolbar.createEl('button', {
      cls: 'ws-compile-close-btn',
      text: t('compilePreview.closePreview'),
    });
    closeBtn.onclick = () => {
      this.leaf.detach();
    };

    // Content
    const contentDiv = container.createDiv('ws-compile-content markdown-reading-view');

    if (!this.content) {
      contentDiv.createEl('p', {
        text: t('compilePreview.noContent'),
        cls: 'ws-empty-state',
      });
      return;
    }

    // Render the compiled content section by section
    const sections = this.content.split(/\n(?=# )/);
    for (const section of sections) {
      const sectionDiv = contentDiv.createDiv('ws-compile-section');
      const h1 = section.match(/^# (.+)\n/);
      if (h1) {
        const id = h1[1].toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        sectionDiv.setAttribute('data-section-id', id);
      }

      void MarkdownRenderer.render(this.app, section, sectionDiv, '', this);
    }
  }

  async onClose(): Promise<void> {}

}
