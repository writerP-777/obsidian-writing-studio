import { App, Modal, Setting } from 'obsidian';
import type WritingStudioPlugin from '../main';
import type { TFile } from 'obsidian';
import { t } from '../src/i18n';

export class AddToProjectModal extends Modal {
  private plugin: WritingStudioPlugin;
  private file: TFile;
  private selectedProjectId: string = '';
  private onConfirm: (projectId: string) => Promise<void>;

  constructor(app: App, plugin: WritingStudioPlugin, file: TFile, onConfirm: (projectId: string) => Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-add-to-project-modal');
    contentEl.createEl('h2', { text: t('addToProject.title') });

    const projects = this.plugin.projectManager.getProjects();

    if (projects.length === 0) {
      contentEl.createEl('p', { text: t('addToProject.noProjects'), cls: 'ws-empty-state' });
      const closeBtn = contentEl.createEl('button', { text: t('addToProject.close') });
      closeBtn.onclick = () => this.close();
      return;
    }

    this.selectedProjectId = projects[0].id;

    contentEl.createEl('p', { text: t('addToProject.file', { path: this.file.path }), cls: 'ws-add-to-project-path' });

    new Setting(contentEl)
      .setName(t('addToProject.projectName'))
      .setDesc(t('addToProject.projectDesc'))
      .addDropdown(d => {
        projects.forEach(p => { d.addOption(p.id, p.title); });
        d.setValue(this.selectedProjectId);
        d.onChange(v => { this.selectedProjectId = v; });
      });

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const addBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('addToProject.addBtn') });
    addBtn.onclick = () => {
      void this.onConfirm(this.selectedProjectId);
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: t('addToProject.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
