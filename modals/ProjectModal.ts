import { App, Modal, Setting, Notice, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ProjectType, WritingProject, resolveDocumentFolder } from '../models/Project';
import {
  validateDocumentFolderName, FolderNameRejection,
  documentFolderDisplayName, documentFolderRenameTarget,
} from '../src/folderRename';
import { t } from '../src/i18n';

const FOLDER_REJECTION_KEYS: Record<FolderNameRejection, string> = {
  empty: 'projectModal.folderNameEmpty',
  'invalid-chars': 'projectModal.folderNameInvalidChars',
  trailing: 'projectModal.folderNameTrailing',
  reserved: 'projectModal.folderNameReserved',
  exists: 'projectModal.folderNameExists',
};

export class ProjectModal extends Modal {
  private plugin: WritingStudioPlugin;
  private onDone?: () => void;
  // Edit mode when set: fields prefill from this project and saving updates
  // it in place. The template row is hidden — type is fixed once scaffolded.
  private edit?: WritingProject;
  private title = '';
  private type: ProjectType = 'blank';
  private author = '';
  private goalRaw = '';
  private description = '';
  private documentFolder = '';

  // Most callers need no callback — ProjectManager announces the new project
  // itself. Pass onDone only for work beyond refreshing project state.
  constructor(app: App, plugin: WritingStudioPlugin, onDone?: () => void, edit?: WritingProject) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.edit = edit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-project-modal');
    contentEl.createEl('h2', { text: this.edit ? t('projectModal.editTitle') : t('projectModal.title') });

    if (this.edit) {
      this.title = this.edit.title;
      this.author = this.edit.author;
      this.description = this.edit.description;
      this.goalRaw = String(this.edit.goals?.totalWordCount || '');
      // Display name only — a folder order marker never shows here
      this.documentFolder = documentFolderDisplayName(resolveDocumentFolder(this.edit));
    } else {
      // Author was previously taken silently from settings — surfacing it
      // means the manuscript title page never gets a blank author unnoticed
      this.author = this.plugin.settings.authorName;
    }

    // Declared early so the dropdown onChange closure can reference it; assigned below.
    let previewEl: HTMLElement | null = null;

    new Setting(contentEl)
      .setName(t('projectModal.projectTitle'))
      .addText(tx => tx
        .setPlaceholder(t('projectModal.titlePlaceholder'))
        .setValue(this.title)
        .onChange(v => { this.title = v; }));

    if (!this.edit) {
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
            if (previewEl) this.updateTemplatePreview(previewEl, this.type);
          }));
    }

    new Setting(contentEl)
      .setName(t('settings.general.authorName'))
      .addText(tx => tx
        .setValue(this.author)
        .onChange(v => { this.author = v; }));

    if (this.edit) {
      new Setting(contentEl)
        .setName(t('projectModal.documentFolder'))
        .setDesc(t('projectModal.documentFolderDesc'))
        .addText(tx => tx
          .setValue(this.documentFolder)
          .onChange(v => { this.documentFolder = v; }));
    }

    new Setting(contentEl)
      .setName(t('projectModal.goalLabel'))
      .setDesc(t('projectModal.goalDesc'))
      .addText(tx => tx
        .setPlaceholder(t('projectModal.goalPlaceholder'))
        .setValue(this.goalRaw)
        .onChange(v => { this.goalRaw = v; }));

    new Setting(contentEl)
      .setName(t('projectModal.descriptionLabel'))
      .addTextArea(tx => tx
        .setPlaceholder(t('projectModal.descriptionPlaceholder'))
        .setValue(this.description)
        .onChange(v => { this.description = v; }));

    if (!this.edit) {
      previewEl = contentEl.createDiv('ws-template-preview');
      this.updateTemplatePreview(previewEl, this.type);
    }

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const submitBtn = btnRow.createEl('button', {
      cls: 'mod-cta',
      text: this.edit ? t('projectModal.saveBtn') : t('projectModal.createBtn'),
    });
    submitBtn.onclick = async () => {
      if (!this.title.trim()) {
        new Notice(t('projectModal.errorNoTitle'));
        return;
      }
      submitBtn.disabled = true;
      if (this.edit) {
        await this.saveEdit(this.edit, submitBtn);
      } else {
        await this.createNew(submitBtn);
      }
    };

    const cancelBtn = btnRow.createEl('button', { text: t('projectModal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  private async createNew(submitBtn: HTMLButtonElement): Promise<void> {
    submitBtn.textContent = t('projectModal.creating');
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
      submitBtn.disabled = false;
      submitBtn.textContent = t('projectModal.createBtn');
    }
  }

  // Retitling is display-only — the project folder keeps the name it was
  // scaffolded with. Only the document folder can be renamed here, and that
  // rename happens in the vault; the rename-event handler updates the
  // project record and binder, exactly as for a manual rename.
  private async saveEdit(project: WritingProject, submitBtn: HTMLButtonElement): Promise<void> {
    const currentFolder = resolveDocumentFolder(project);
    if (this.documentFolder !== documentFolderDisplayName(currentFolder)) {
      const renamed = await this.renameDocumentFolder(project, currentFolder);
      if (!renamed) {
        submitBtn.disabled = false;
        return;
      }
    }
    try {
      project.title = this.title.trim();
      project.author = this.author.trim();
      project.description = this.description;
      const goal = parseInt(this.goalRaw) || 0;
      if (goal > 0) {
        project.goals = { ...project.goals, totalWordCount: goal };
      } else {
        delete project.goals.totalWordCount;
      }
      await this.plugin.projectManager.saveProject(project);
      new Notice(t('projectModal.updated', { title: project.title }));
      this.close();
      this.onDone?.();
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
      submitBtn.disabled = false;
    }
  }

  // False (with a notice shown) when validation rejects the name or the
  // vault rename fails — a failed rename never passes silently.
  private async renameDocumentFolder(project: WritingProject, currentFolder: string): Promise<boolean> {
    // The typed value is a display name; the on-disk target re-attaches the
    // folder's existing order marker, so a rename here can never cost the
    // folder its order (#233 audit ruling)
    const targetName = documentFolderRenameTarget(currentFolder, this.documentFolder);
    const target = normalizePath(`${project.folderPath}/${targetName}`);
    const targetExists = this.app.vault.getAbstractFileByPath(target) !== null;
    const verdict = validateDocumentFolderName(this.documentFolder, documentFolderDisplayName(currentFolder), targetExists);
    if (!verdict.ok) {
      new Notice(t(FOLDER_REJECTION_KEYS[verdict.reason ?? 'empty'], { name: this.documentFolder }));
      return false;
    }
    const source = this.app.vault.getFolderByPath(normalizePath(`${project.folderPath}/${currentFolder}`));
    if (!source) {
      new Notice(t('projectModal.folderMissing', { name: documentFolderDisplayName(currentFolder) }));
      return false;
    }
    try {
      await this.app.fileManager.renameFile(source, target);
      return true;
    } catch (e) {
      new Notice(t('projectModal.folderRenameFailed', { error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
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
