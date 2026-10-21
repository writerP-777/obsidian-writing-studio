import { App, Modal, Setting, Notice, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ProjectType, WritingProject, resolveDocumentFolder } from '../models/Project';
import { DEFAULT_WRITING_DAYS, isDefaultWritingDays, isIsoDate, normalizeWritingDays } from '../src/pacing';
import {
  validateDocumentFolderName, FolderNameRejection,
  documentFolderDisplayName, documentFolderRenameTarget,
  planProjectFolderForTitle, validateProjectFolderName, ProjectFolderRejection,
  baseName, parentPath, joinPath,
} from '../src/folderRename';
import { t } from '../src/i18n';

const FOLDER_REJECTION_KEYS: Record<FolderNameRejection, string> = {
  empty: 'projectModal.folderNameEmpty',
  'invalid-chars': 'projectModal.folderNameInvalidChars',
  trailing: 'projectModal.folderNameTrailing',
  reserved: 'projectModal.folderNameReserved',
  exists: 'projectModal.folderNameExists',
};

const PROJECT_FOLDER_REJECTION_KEYS: Record<ProjectFolderRejection, string> = {
  empty: 'projectModal.projectFolderEmpty',
  exists: 'projectModal.projectFolderExists',
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
  // Deadline pacing (item 5): the date input's value (YYYY-MM-DD or empty)
  // and the days of the week the writer plans to write.
  private deadline = '';
  private writingDays: number[] = [...DEFAULT_WRITING_DAYS];
  private description = '';
  private documentFolder = '';
  // Edit mode: whether a title change also renames the project folder (#391).
  private renameFolder = true;

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
      this.deadline = isIsoDate(this.edit.goals?.deadline) ? this.edit.goals.deadline : '';
      this.writingDays = normalizeWritingDays(this.edit.goals?.writingDays);
      // Display name only — a folder order marker never shows here
      this.documentFolder = documentFolderDisplayName(resolveDocumentFolder(this.edit));
    } else {
      // Author was previously taken silently from settings — surfacing it
      // means the manuscript title page never gets a blank author unnoticed
      this.author = this.plugin.settings.authorName;
    }

    // Declared early so the dropdown onChange closure can reference it; assigned below.
    let previewEl: HTMLElement | null = null;

    // Edit mode: a live hint under the title says what saving will do to the
    // project folder (#391) — renamed to what, and why the name differs from
    // the title when it does. Empty (and hidden) while nothing would move.
    let folderHintEl: HTMLElement | null = null;

    new Setting(contentEl)
      .setName(t('projectModal.projectTitle'))
      .addText(tx => tx
        .setPlaceholder(t('projectModal.titlePlaceholder'))
        .setValue(this.title)
        .onChange(v => {
          this.title = v;
          if (folderHintEl && this.edit) this.updateFolderHint(folderHintEl, this.edit);
        }));

    if (this.edit) {
      const project = this.edit;
      folderHintEl = contentEl.createDiv('ws-project-folder-hint');
      this.updateFolderHint(folderHintEl, project);
      // Off means "change the title only" — for a writer whose folder name
      // is deliberately different from the title.
      new Setting(contentEl)
        .setName(t('projectModal.renameFolderLabel'))
        .setDesc(t('projectModal.renameFolderDesc'))
        .addToggle(tg => tg
          .setValue(this.renameFolder)
          .onChange(v => {
            this.renameFolder = v;
            if (folderHintEl) this.updateFolderHint(folderHintEl, project);
          }));
    }

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

    // The deadline sits right under the goal: together they give the daily
    // pace. A native date input — no date format to learn or type.
    new Setting(contentEl)
      .setName(t('projectModal.deadlineLabel'))
      .setDesc(t('projectModal.deadlineDesc'))
      .addText(tx => {
        tx.inputEl.type = 'date';
        tx.inputEl.addClass('ws-project-deadline');
        tx.setValue(this.deadline).onChange(v => { this.deadline = v; });
      });

    const daysSetting = new Setting(contentEl)
      .setName(t('projectModal.writingDaysLabel'))
      .setDesc(t('projectModal.writingDaysDesc'));
    const daysRow = daysSetting.controlEl.createDiv('ws-writing-days');
    // Shown Monday first; stored in getDay() numbering.
    for (const day of [1, 2, 3, 4, 5, 6, 0]) {
      const btn = daysRow.createEl('button', {
        cls: 'ws-writing-day',
        text: t(`projectModal.dayShort.${day}`),
        attr: { type: 'button', 'aria-label': t(`projectModal.dayName.${day}`), 'aria-pressed': String(this.writingDays.includes(day)) },
      });
      btn.toggleClass('is-active', this.writingDays.includes(day));
      btn.onclick = () => {
        const on = !this.writingDays.includes(day);
        this.writingDays = on
          ? [...this.writingDays, day].sort((a, b) => a - b)
          : this.writingDays.filter(d => d !== day);
        btn.toggleClass('is-active', on);
        btn.setAttribute('aria-pressed', String(on));
      };
    }

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

    // Keyboard flow (UX pass): the cursor starts in the title, and Enter in
    // any single-line field saves. Textareas, dropdowns, and the day
    // toggles keep their own Enter behavior.
    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || !(e.target instanceof HTMLInputElement)) return;
      e.preventDefault();
      submitBtn.click();
    });
    contentEl.querySelector('input')?.focus();
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
      if (this.applyGoals(project)) {
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

  // A changed title also renames the project folder (#391); the document
  // folder can be renamed here too. Both renames happen in the vault, so
  // links heal and the rename-event handler updates the project record and
  // binder exactly as for a manual rename. Order matters: the project folder
  // moves first so the document-folder rename resolves inside the new path.
  // Editing other fields never moves the folder, even when title and folder
  // are already out of step.
  private async saveEdit(project: WritingProject, submitBtn: HTMLButtonElement): Promise<void> {
    const newTitle = this.title.trim();
    const titleChanged = newTitle !== project.title;
    const folderPlan = planProjectFolderForTitle(newTitle, baseName(project.folderPath));
    let folderRenamed = false;
    if (this.renameFolder && titleChanged && folderPlan.renames) {
      folderRenamed = await this.renameProjectFolder(project, folderPlan.name);
      if (!folderRenamed) {
        submitBtn.disabled = false;
        return;
      }
    }
    const currentFolder = resolveDocumentFolder(project);
    if (this.documentFolder !== documentFolderDisplayName(currentFolder)) {
      const renamed = await this.renameDocumentFolder(project, currentFolder);
      if (!renamed) {
        submitBtn.disabled = false;
        return;
      }
    }
    try {
      project.title = newTitle;
      project.author = this.author.trim();
      project.description = this.description;
      this.applyGoals(project);
      await this.plugin.projectManager.saveProject(project);
      new Notice(folderRenamed
        ? t('projectModal.updatedFolderRenamed', { title: project.title, name: folderPlan.name })
        : t('projectModal.updated', { title: project.title }));
      this.close();
      this.onDone?.();
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
      submitBtn.disabled = false;
    }
  }

  // Writes the goal fields from the form onto the project. Empty means
  // absent — a cleared goal, deadline, or default writing days leave no key
  // behind in _project.json. Returns whether anything is set at all.
  private applyGoals(project: WritingProject): boolean {
    const goals = { ...project.goals };
    const goal = parseInt(this.goalRaw) || 0;
    if (goal > 0) goals.totalWordCount = goal; else delete goals.totalWordCount;
    if (isIsoDate(this.deadline)) goals.deadline = this.deadline; else delete goals.deadline;
    const days = normalizeWritingDays(this.writingDays);
    if (isDefaultWritingDays(days)) delete goals.writingDays; else goals.writingDays = days;
    project.goals = goals;
    return Object.keys(goals).length > 0;
  }

  private updateFolderHint(el: HTMLElement, project: WritingProject): void {
    el.empty();
    if (!this.renameFolder) return;
    const plan = planProjectFolderForTitle(this.title, baseName(project.folderPath));
    if (!plan.renames) return;
    el.createEl('p', { text: t('projectModal.folderWillRename', { name: plan.name }) });
    if (plan.substituted) {
      el.createEl('p', { text: t('projectModal.folderCharsReplaced') });
    }
  }

  // Renames the project folder to `targetName` (already derived from the
  // title, so legal by construction). False (with a notice shown) when the
  // name is empty, a different folder already has it, the source is missing,
  // or the vault rename fails — a failed rename never passes silently. On
  // success folderPath is repointed here as well as by the rename-event
  // handler, so the rest of the save never depends on event timing.
  private async renameProjectFolder(project: WritingProject, targetName: string): Promise<boolean> {
    const currentName = baseName(project.folderPath);
    const target = normalizePath(joinPath(parentPath(project.folderPath), targetName));
    const targetExists = this.app.vault.getAbstractFileByPath(target) !== null;
    const verdict = validateProjectFolderName(targetName, currentName, targetExists);
    if (!verdict.ok) {
      new Notice(t(PROJECT_FOLDER_REJECTION_KEYS[verdict.reason ?? 'empty'], { name: targetName }));
      return false;
    }
    const source = this.app.vault.getFolderByPath(normalizePath(project.folderPath));
    if (!source) {
      new Notice(t('projectModal.projectFolderMissing', { name: currentName }));
      return false;
    }
    try {
      await this.app.fileManager.renameFile(source, target);
      project.folderPath = target;
      return true;
    } catch (e) {
      new Notice(t('projectModal.projectFolderRenameFailed', { error: e instanceof Error ? e.message : String(e) }));
      return false;
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
