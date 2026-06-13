import { App, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ExportFormat, ExportScope } from '../src/ExportEngine';
import { t } from '../src/i18n';

export class ExportModal extends Modal {
  private plugin: WritingStudioPlugin;
  private format: ExportFormat;
  private exportScope: ExportScope = 'current';
  private includeFrontmatter = false;
  private includeResearch = false;
  private includeTitlesAsHeadings = true;
  private addTitlePage = true;
  private coverImagePath = '';
  private authorContact = '';
  private pandocWarningEl: HTMLElement | null = null;
  // Checked once per modal open, only when a pandoc format is selected
  private pandocAvailable: boolean | null = null;
  private static readonly PANDOC_FORMATS: ReadonlySet<string> = new Set(['pdf', 'docx', 'rtf']);

  constructor(app: App, plugin: WritingStudioPlugin, initialScope: ExportScope = 'current') {
    super(app);
    this.plugin = plugin;
    this.format = plugin.settings.defaultExportFormat;
    this.exportScope = initialScope;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-export-modal');
    contentEl.createEl('h2', { text: t('exportModal.title') });

    let coverSetting: Setting;
    let contactSetting: Setting;

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

    new Setting(contentEl)
      .setName(t('exportModal.scopeName'))
      .addDropdown(d => d
        .addOption('current', t('exportModal.scopeCurrent'))
        .addOption('project', t('exportModal.scopeProject'))
        .setValue(this.exportScope)
        .onChange(v => { this.exportScope = v as ExportScope; }));

    new Setting(contentEl)
      .setName(t('exportModal.includeFrontmatter'))
      .addToggle(tx => tx.setValue(this.includeFrontmatter).onChange(v => { this.includeFrontmatter = v; }));

    new Setting(contentEl)
      .setName(t('exportModal.includeResearch'))
      .addToggle(tx => tx.setValue(this.includeResearch).onChange(v => { this.includeResearch = v; }));

    new Setting(contentEl)
      .setName(t('exportModal.includeTitlesAsHeadings'))
      .addToggle(tx => tx.setValue(this.includeTitlesAsHeadings).onChange(v => { this.includeTitlesAsHeadings = v; }));

    new Setting(contentEl)
      .setName(t('exportModal.addTitlePage'))
      .setDesc(t('exportModal.addTitlePageDesc'))
      .addToggle(tx => tx.setValue(this.addTitlePage).onChange(v => { this.addTitlePage = v; }));

    const previewBtn = contentEl.createEl('button', {
      cls: 'ws-export-preview-btn',
      text: t('exportModal.previewBtn'),
    });
    previewBtn.onclick = async () => {
      this.close();
      await this.plugin.openCompilePreview();
    };

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const exportBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('exportModal.exportBtn') });
    exportBtn.onclick = async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = t('exportModal.exporting');
      try {
        await this.plugin.exportEngine.export({
          format: this.format,
          scope: this.exportScope,
          includeFrontmatter: this.includeFrontmatter,
          includeResearch: this.includeResearch,
          includeTitlesAsHeadings: this.includeTitlesAsHeadings,
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
        exportBtn.disabled = false;
        exportBtn.textContent = t('exportModal.exportBtn');
      }
    };

    const cancelBtn = btnRow.createEl('button', { text: t('exportModal.cancel') });
    cancelBtn.onclick = () => this.close();
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
