import { App, MarkdownView, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ExportFormat, ExportScope, ExportUiState } from '../src/ExportEngine';
import { ExportTitleChoice, resolveExportTitle } from '../src/exportTitle';
import { parseFolderPrefix } from '../src/binderOrder';
import { t } from '../src/i18n';

export class ExportModal extends Modal {
  private plugin: WritingStudioPlugin;
  private format: ExportFormat;
  private exportScope: ExportScope = 'current';
  private includeFrontmatter = false;
  private includeResearch = false;
  private includeTitlesAsHeadings = true;
  private includeFolderNames = false;
  private addTitlePage = true;
  // A manuscript-zone folder to export instead of the whole zone (#232) —
  // set when the modal is opened from a folder's context menu
  private subtreeRoot?: string;
  private titleChoice: ExportTitleChoice;
  private customTitle = '';
  // Document a 'current' scope targets when the dialog was reopened from the
  // preview — the live "most recent leaf" lookup would find the preview leaf
  private currentFilePath?: string;
  private coverImagePath = '';
  private authorContact = '';
  private exportBtn: HTMLButtonElement | null = null;
  private pandocWarningEl: HTMLElement | null = null;
  // Checked once per modal open, only when a pandoc format is selected
  private pandocAvailable: boolean | null = null;
  private static readonly PANDOC_FORMATS: ReadonlySet<string> = new Set(['pdf', 'docx', 'rtf']);

  constructor(app: App, plugin: WritingStudioPlugin, initialScope: ExportScope = 'current', subtreeRoot?: string, initial?: ExportUiState) {
    super(app);
    this.plugin = plugin;
    this.format = plugin.settings.defaultExportFormat;
    this.exportScope = initialScope;
    this.subtreeRoot = subtreeRoot;
    this.titleChoice = subtreeRoot ? 'folder' : 'project';
    // Selections carried back from the compile preview win over the defaults
    if (initial) {
      this.exportScope = initial.scope;
      this.subtreeRoot = initial.subtreeRoot;
      this.currentFilePath = initial.currentFilePath;
      this.includeFrontmatter = initial.includeFrontmatter;
      this.includeResearch = initial.includeResearch;
      this.includeTitlesAsHeadings = initial.includeTitlesAsHeadings;
      this.includeFolderNames = initial.includeFolderNamesAsHeadings;
      this.addTitlePage = initial.addTitlePage;
      this.titleChoice = initial.titleChoice;
      this.customTitle = initial.customTitle;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-export-modal');
    contentEl.createEl('h2', { text: t('exportModal.title') });

    let coverSetting: Setting;
    let contactSetting: Setting;
    let customTitleSetting: Setting;

    new Setting(contentEl)
      .setName(t('exportModal.formatName'))
      .addDropdown(d => d
        .addOption('md', t('exportModal.format.md'))
        .addOption('html', t('exportModal.format.html'))
        .addOption('manuscript', t('exportModal.format.manuscript'))
        .addOption('epub', t('exportModal.format.epub'))
        .addOption('pdf', t('exportModal.format.pdf'))
        .addOption('docx', t('exportModal.format.docx'))
        .addOption('rtf', t('exportModal.format.rtf'))
        .setValue(this.format)
        .onChange(v => {
          this.format = v as ExportFormat;
          coverSetting.settingEl.toggleClass('ws-hidden', v !== 'epub');
          contactSetting.settingEl.toggleClass('ws-hidden', v !== 'manuscript');
          this.updatePandocWarning();
        }));

    this.pandocWarningEl = contentEl.createDiv({ cls: 'ws-export-pandoc-warning ws-hidden', text: t('exportModal.pandocWarning') });
    this.updatePandocWarning();

    coverSetting = new Setting(contentEl)
      .setName(t('exportModal.coverImageName'))
      .setDesc(t('exportModal.coverImageDesc'))
      .addText(tx => tx
        .setValue(this.coverImagePath)
        .setPlaceholder(t('exportModal.coverImagePlaceholder'))
        .onChange(v => { this.coverImagePath = v.trim(); }));
    coverSetting.settingEl.toggleClass('ws-hidden', this.format !== 'epub');

    contactSetting = new Setting(contentEl)
      .setName(t('exportModal.contactInfoName'))
      .setDesc(t('exportModal.contactInfoDesc'))
      .addTextArea(tx => tx
        .setValue(this.authorContact)
        .setPlaceholder(t('exportModal.contactInfoPlaceholder'))
        .onChange(v => { this.authorContact = v; }));
    contactSetting.settingEl.toggleClass('ws-hidden', this.format !== 'manuscript');

    // A subtree export IS its scope — the dropdown would only contradict it
    if (!this.subtreeRoot) {
      new Setting(contentEl)
        .setName(t('exportModal.scopeName'))
        .addDropdown(d => d
          .addOption('current', t('exportModal.scopeCurrent'))
          .addOption('project', t('exportModal.scopeProject'))
          .setValue(this.exportScope)
          .onChange(v => { this.exportScope = v as ExportScope; }));
    }

    // One title names the export everywhere — filename, title page, metadata
    // (#260). The folder-based choices only exist for a folder export.
    new Setting(contentEl)
      .setName(t('exportModal.titleName'))
      .addDropdown(d => {
        if (this.subtreeRoot) {
          d.addOption('folder', t('exportModal.titleFolder'));
          d.addOption('project-folder', t('exportModal.titleProjectFolder'));
        }
        d.addOption('project', t('exportModal.titleProject'));
        d.addOption('custom', t('exportModal.titleCustom'));
        d.setValue(this.titleChoice);
        d.onChange(v => {
          this.titleChoice = v as ExportTitleChoice;
          customTitleSetting.settingEl.toggleClass('ws-hidden', v !== 'custom');
          this.updateExportEnabled();
        });
      });

    customTitleSetting = new Setting(contentEl)
      .setName(t('exportModal.customTitleName'))
      .addText(tx => tx
        .setValue(this.customTitle)
        .setPlaceholder(t('exportModal.customTitlePlaceholder'))
        .onChange(v => {
          this.customTitle = v;
          this.updateExportEnabled();
        }));
    customTitleSetting.settingEl.toggleClass('ws-hidden', this.titleChoice !== 'custom');

    new Setting(contentEl)
      .setName(t('exportModal.includeFrontmatter'))
      .addToggle(tx => tx.setValue(this.includeFrontmatter).onChange(v => { this.includeFrontmatter = v; }));

    // Under the experimental binder the zone boundary is the compile boundary
    // (ADR 0001) — Research never compiles, so the option disappears
    if (!this.plugin.settings.filesystemBinder) {
      new Setting(contentEl)
        .setName(t('exportModal.includeResearch'))
        .addToggle(tx => tx.setValue(this.includeResearch).onChange(v => { this.includeResearch = v; }));
    }

    new Setting(contentEl)
      .setName(t('exportModal.includeTitlesAsHeadings'))
      .addToggle(tx => tx.setValue(this.includeTitlesAsHeadings).onChange(v => { this.includeTitlesAsHeadings = v; }));

    // Folder names only exist as a compile concept in the filesystem binder;
    // the classic compile skips structural items entirely
    if (this.plugin.settings.filesystemBinder) {
      new Setting(contentEl)
        .setName(t('exportModal.includeFolderHeadings'))
        .addToggle(tx => tx.setValue(this.includeFolderNames).onChange(v => { this.includeFolderNames = v; }));
    }

    new Setting(contentEl)
      .setName(t('exportModal.addTitlePage'))
      .setDesc(t('exportModal.addTitlePageDesc'))
      .addToggle(tx => tx.setValue(this.addTitlePage).onChange(v => { this.addTitlePage = v; }));

    const previewBtn = contentEl.createEl('button', {
      cls: 'ws-export-preview-btn',
      text: t('exportModal.previewBtn'),
    });
    previewBtn.onclick = async () => {
      const state = this.uiState();
      this.close();
      await this.plugin.openCompilePreview(state);
    };

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const exportBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('exportModal.exportBtn') });
    this.exportBtn = exportBtn;
    this.updateExportEnabled();
    exportBtn.onclick = async () => {
      const title = this.resolvedTitle();
      if (title === null) return;
      exportBtn.disabled = true;
      exportBtn.textContent = t('exportModal.exporting');
      try {
        await this.plugin.exportEngine.export({
          format: this.format,
          scope: this.exportScope,
          includeFrontmatter: this.includeFrontmatter,
          includeResearch: this.includeResearch,
          includeTitlesAsHeadings: this.includeTitlesAsHeadings,
          includeFolderNamesAsHeadings: this.includeFolderNames,
          subtreeRoot: this.subtreeRoot,
          exportTitle: title || undefined,
          currentFile: this.currentFilePath,
          paperSize: this.plugin.settings.defaultPaperSize,
          font: this.plugin.settings.defaultExportFont,
          fontSize: this.plugin.settings.defaultExportFontSize,
          addTitlePage: this.addTitlePage,
          coverImagePath: this.coverImagePath || undefined,
          authorContact: this.authorContact || undefined,
        });
        this.close();
      } catch (e) {
        new Notice(t('exportModal.exportFailed', { error: e instanceof Error ? e.message : String(e) }));
        exportBtn.textContent = t('exportModal.exportBtn');
        this.updateExportEnabled();
      }
    };

    const cancelBtn = btnRow.createEl('button', { text: t('exportModal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  // The dialog's title choice resolved to the export's one title. Null while
  // "Type your own title" is chosen with an empty field — Export stays
  // disabled rather than inventing a fallback.
  private resolvedTitle(): string | null {
    const project = this.plugin.projectManager.getActiveProject();
    return resolveExportTitle(this.titleChoice, {
      projectTitle: project?.title ?? '',
      folderName: this.subtreeRoot
        ? parseFolderPrefix(this.subtreeRoot.split('/').pop() ?? '').displayName
        : undefined,
      customTitle: this.customTitle,
    });
  }

  private updateExportEnabled(): void {
    if (this.exportBtn) {
      this.exportBtn.disabled = this.resolvedTitle() === null;
    }
  }

  // The dialog's current selections, handed to the compile preview so it
  // renders exactly what this export would produce (#260)
  private uiState(): ExportUiState {
    let currentFilePath = this.currentFilePath;
    if (this.exportScope === 'current' && !currentFilePath) {
      const view = this.app.workspace.getMostRecentLeaf()?.view;
      currentFilePath = view instanceof MarkdownView ? view.file?.path : undefined;
    }
    return {
      scope: this.exportScope,
      subtreeRoot: this.subtreeRoot,
      currentFilePath,
      includeFrontmatter: this.includeFrontmatter,
      includeResearch: this.includeResearch,
      includeTitlesAsHeadings: this.includeTitlesAsHeadings,
      includeFolderNamesAsHeadings: this.includeFolderNames,
      addTitlePage: this.addTitlePage,
      titleChoice: this.titleChoice,
      customTitle: this.customTitle,
    };
  }

  // Warning only — the export attempt itself stays allowed
  private updatePandocWarning(): void {
    const el = this.pandocWarningEl;
    if (!el) return;
    if (!ExportModal.PANDOC_FORMATS.has(this.format)) {
      el.addClass('ws-hidden');
      return;
    }
    if (this.pandocAvailable !== null) {
      el.toggleClass('ws-hidden', this.pandocAvailable);
      return;
    }
    void this.plugin.exportEngine.isPandocAvailable().then(ok => {
      this.pandocAvailable = ok;
      // The user may have switched to a non-pandoc format while we checked
      if (ExportModal.PANDOC_FORMATS.has(this.format)) {
        el.toggleClass('ws-hidden', ok);
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
