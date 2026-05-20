import { App, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ExportFormat, ExportScope } from '../src/ExportEngine';

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

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app);
    this.plugin = plugin;
    this.format = plugin.settings.defaultExportFormat;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-export-modal');
    contentEl.createEl('h2', { text: 'Export document' });

    let coverSetting: Setting;
    let contactSetting: Setting;

    new Setting(contentEl)
      .setName('Format')
      .addDropdown(d => d
        .addOption('md', 'Markdown (.md)')
        .addOption('html', 'HTML')
        .addOption('manuscript', 'Manuscript (HTML)')
        .addOption('epub', 'EPUB (.epub)')
        .addOption('pdf', 'PDF (requires pandoc)')
        .addOption('docx', 'Word (.docx) (requires pandoc)')
        .addOption('rtf', 'RTF (requires pandoc)')
        .setValue(this.format)
        .onChange(v => {
          this.format = v as ExportFormat;
          coverSetting.settingEl.toggleClass('ws-hidden', v !== 'epub');
          contactSetting.settingEl.toggleClass('ws-hidden', v !== 'manuscript');
        }));

    coverSetting = new Setting(contentEl)
      .setName('Cover image path')
      .setDesc('Vault path to a JPG or PNG cover image. Leave empty for a generated text cover.')
      .addText(t => t
        .setValue(this.coverImagePath)
        .setPlaceholder('e.g. Assets/cover.jpg')
        .onChange(v => { this.coverImagePath = v.trim(); }));
    coverSetting.settingEl.toggleClass('ws-hidden', this.format !== 'epub');

    contactSetting = new Setting(contentEl)
      .setName('Contact info (optional)')
      .setDesc('Appears on the title page — name, email, or mailing address.')
      .addTextArea(t => t
        .setValue(this.authorContact)
        .setPlaceholder('Name, email, or mailing address')
        .onChange(v => { this.authorContact = v; }));
    contactSetting.settingEl.toggleClass('ws-hidden', this.format !== 'manuscript');

    new Setting(contentEl)
      .setName('Scope')
      .addDropdown(d => d
        .addOption('current', 'Current document')
        .addOption('project', 'Entire project (in binder order)')
        .setValue(this.exportScope)
        .onChange(v => { this.exportScope = v as ExportScope; }));

    new Setting(contentEl)
      .setName('Include frontmatter')
      .addToggle(t => t.setValue(this.includeFrontmatter).onChange(v => { this.includeFrontmatter = v; }));

    new Setting(contentEl)
      .setName('Include research notes')
      .addToggle(t => t.setValue(this.includeResearch).onChange(v => { this.includeResearch = v; }));

    new Setting(contentEl)
      .setName('Include document titles as headings')
      .addToggle(t => t.setValue(this.includeTitlesAsHeadings).onChange(v => { this.includeTitlesAsHeadings = v; }));

    new Setting(contentEl)
      .setName('Add title page')
      .setDesc('Prepend a title page with project title, author, and date.')
      .addToggle(t => t.setValue(this.addTitlePage).onChange(v => { this.addTitlePage = v; }));

    const previewBtn = contentEl.createEl('button', {
      cls: 'ws-export-preview-btn',
      text: 'Preview compiled manuscript',
    });
    previewBtn.onclick = async () => {
      this.close();
      await this.plugin.openCompilePreview();
    };

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const exportBtn = btnRow.createEl('button', { cls: 'mod-cta', text: 'Export' });
    exportBtn.onclick = async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Exporting…';
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
        new Notice(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
        exportBtn.disabled = false;
        exportBtn.textContent = 'Export';
      }
    };

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
