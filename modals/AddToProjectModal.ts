import { App, Modal, Setting } from 'obsidian';
import type WritingStudioPlugin from '../main';
import type { TFile } from 'obsidian';

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
    contentEl.createEl('h2', { text: 'Add to writing project' });

    const projects = this.plugin.projectManager.getProjects();

    if (projects.length === 0) {
      contentEl.createEl('p', { text: 'No writing projects found. Create a project first.', cls: 'ws-empty-state' });
      const closeBtn = contentEl.createEl('button', { text: 'Close' });
      closeBtn.onclick = () => this.close();
      return;
    }

    this.selectedProjectId = projects[0].id;

    contentEl.createEl('p', { text: `File: ${this.file.path}`, cls: 'ws-add-to-project-path' });

    new Setting(contentEl)
      .setName('Writing project')
      .setDesc('What writing project do you wish to add this file to?')
      .addDropdown(d => {
        projects.forEach(p => { d.addOption(p.id, p.title); });
        d.setValue(this.selectedProjectId);
        d.onChange(v => { this.selectedProjectId = v; });
      });

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const addBtn = btnRow.createEl('button', { cls: 'mod-cta', text: 'Add to project' });
    addBtn.onclick = () => {
      void this.onConfirm(this.selectedProjectId);
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
