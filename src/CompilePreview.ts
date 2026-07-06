import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ExportOptions, ExportUiState, defaultExportUiState } from './ExportEngine';
import { resolveExportTitle } from './exportTitle';
import { parseFolderPrefix } from './binderOrder';
import { ExportModal } from '../modals/ExportModal';
import { t } from './i18n';
import { safeHandler } from './safeHandler';
import { splitSections, buildJumpItems, sectionId, JumpItem } from './sections';

export const COMPILE_PREVIEW_VIEW_TYPE = 'writing-studio-compile-preview';

export class CompilePreviewView extends ItemView {
  private plugin: WritingStudioPlugin;
  private content = '';
  private sections: string[] = [];
  private jumpItems: JumpItem[] = [];
  // The export dialog's selections this preview renders with — "Proceed to
  // export" hands them back so the round trip loses nothing (#260)
  private state: ExportUiState = defaultExportUiState();
  // Virtual path inside the project folder so relative links and embeds in
  // the rendered preview resolve from the project, not the vault root.
  private sourcePath = '';

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

  // Renders the compile exactly as the export dialog's selections would
  // produce it — same content, same title (#260). Called with no state, it
  // uses the dialog's defaults (the standalone preview command).
  async loadContent(state?: ExportUiState): Promise<void> {
    if (state) this.state = state;
    const s = this.state;

    const project = this.plugin.projectManager.getActiveProject();
    const title = resolveExportTitle(s.titleChoice, {
      projectTitle: project?.title ?? '',
      folderName: s.subtreeRoot
        ? parseFolderPrefix(s.subtreeRoot.split('/').pop() ?? '').displayName
        : undefined,
      customTitle: s.customTitle,
    });

    const exportOpts: ExportOptions = {
      format: 'md',
      scope: s.scope,
      subtreeRoot: s.subtreeRoot,
      currentFile: s.currentFilePath,
      exportTitle: title || undefined,
      includeFrontmatter: s.includeFrontmatter,
      includeTitlesAsHeadings: s.includeTitlesAsHeadings,
      includeFolderNamesAsHeadings: s.includeFolderNamesAsHeadings,
      paperSize: 'letter',
      font: '',
      fontSize: 12,
      addTitlePage: s.addTitlePage,
    };

    this.sourcePath = project ? normalizePath(`${project.folderPath}/_compile.md`) : '';

    try {
      this.content = this.plugin.exportEngine.toMarkdown(await this.plugin.exportEngine.compileContent(exportOpts));
    } catch (e) {
      this.content = '';
      new Notice(t('exportModal.exportFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
    this.sections = splitSections(this.content);
    this.jumpItems = buildJumpItems(this.sections);
    this.render();
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
      new ExportModal(this.app, this.plugin, this.state.scope, this.state.subtreeRoot, this.state).open();
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
      // A workspace-restored leaf opens empty — give it a way to load the
      // compilation instead of being a permanently dead panel
      const loadBtn = contentDiv.createEl('button', {
        cls: 'ws-compile-load-btn mod-cta',
        text: t('compilePreview.loadCompilation'),
      });
      loadBtn.onclick = safeHandler(async () => {
        if (!this.plugin.projectManager.getActiveProject()) {
          new Notice(t('binder.selectProjectFirst'));
          return;
        }
        await this.loadContent();
      });
      return;
    }

    // Render the compiled content section by section
    this.sections.forEach((section, index) => {
      const sectionDiv = contentDiv.createDiv('ws-compile-section');
      if (section.startsWith('# ')) {
        sectionDiv.setAttribute('data-section-id', sectionId(index));
      }
      void MarkdownRenderer.render(this.app, section, sectionDiv, this.sourcePath, this);
    });
  }

  async onClose(): Promise<void> {}

}
