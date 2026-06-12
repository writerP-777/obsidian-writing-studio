import { App, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ProjectType } from '../models/Project';
import { t } from '../src/i18n';

export class ProjectModal extends Modal {
  private plugin: WritingStudioPlugin;
  private onDone?: () => void;
  private title = '';
  private type: ProjectType = 'blank';
  private author = '';
  private goalRaw = '';
  private description = '';

  // Most callers need no callback — ProjectManager announces the new project
  // itself. Pass onDone only for work beyond refreshing project state.
  constructor(app: App, plugin: WritingStudioPlugin, onDone?: () => void) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-project-modal');
    contentEl.createEl('h2', { text: t('projectModal.title') });

    // Declared early so the dropdown onChange closure can reference it; assigned below.
    let previewEl!: HTMLElement;

    new Setting(contentEl)
      .setName(t('projectModal.projectTitle'))
      .addText(tx => tx
        .setPlaceholder(t('projectModal.titlePlaceholder'))
        .onChange(v => { this.title = v; }));

    new Setting(contentEl)
      .setName(t('projectModal.template'))
      .setDesc(t('projectModal.templateDesc'))
      .addDropdown(d => d
        .addOption('blank', t('projectModal.templateOption.blank'))
        .addOption('book', t('projectModal.templateOption.book'))
        .addOption('series', t('projectModal.templateOption.series'))
        .addOption('blog', t('projectModal.templateOption.blog'))
        .addOption('journal-article', t('projectModal.templateOption.journalArticle'))
        .addOption('magazine-article', t('projectModal.templateOption.magazineArticle'))
        .setValue(this.type)
        .onChange(v => {
          this.type = v as ProjectType;
          this.updateTemplatePreview(previewEl, this.type);
        }));

    // Author was previously taken silently from settings — surfacing it here
    // means the manuscript title page never gets a blank author unnoticed
    this.author = this.plugin.settings.authorName;
    new Setting(contentEl)
      .setName(t('settings.general.authorName'))
      .addText(tx => tx
        .setValue(this.author)
        .onChange(v => { this.author = v; }));

    new Setting(contentEl)
      .setName(t('projectModal.goalLabel'))
      .setDesc(t('projectModal.goalDesc'))
      .addText(tx => tx
        .setPlaceholder('50000')
        .onChange(v => { this.goalRaw = v; }));

    new Setting(contentEl)
      .setName(t('projectModal.descriptionLabel'))
      .addTextArea(tx => tx
        .setPlaceholder(t('projectModal.descriptionPlaceholder'))
        .onChange(v => { this.description = v; }));

    previewEl = contentEl.createDiv('ws-template-preview');
    this.updateTemplatePreview(previewEl, this.type);

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const createBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('projectModal.createBtn') });
    createBtn.onclick = async () => {
      if (!this.title.trim()) {
        new Notice(t('projectModal.errorNoTitle'));
        return;
      }
      createBtn.disabled = true;
      createBtn.textContent = t('projectModal.creating');
      try {
        const project = await this.plugin.projectManager.createProject(
          this.title.trim(),
          this.type,
          this.author.trim(),
          this.description
        );
        const goal = parseInt(this.goalRaw) || 0;
        if (goal > 0) {
          project.goals = { ...project.goals, totalWordCount: goal };
          await this.plugin.projectManager.saveProject(project);
        }
        await this.plugin.projectManager.setActiveProject(project.id);
        new Notice(t('projectModal.created', { title: project.title }));
        this.close();
        this.onDone?.();
      } catch (e) {
        new Notice(t('projectModal.errorCreate', { error: e instanceof Error ? e.message : String(e) }));
        createBtn.disabled = false;
        createBtn.textContent = t('projectModal.createBtn');
      }
    };

    const cancelBtn = btnRow.createEl('button', { text: t('projectModal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  private updateTemplatePreview(el: HTMLElement, type: ProjectType): void {
    el.empty();
    const previews: Record<ProjectType, string> = {
      blank: t('projectModal.preview.blank'),
      book: t('projectModal.preview.book'),
      series: t('projectModal.preview.series'),
      blog: t('projectModal.preview.blog'),
      'journal-article': t('projectModal.preview.journalArticle'),
      'magazine-article': t('projectModal.preview.magazineArticle'),
    };
    el.createEl('p', { text: previews[type], cls: 'ws-template-desc' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
