import { App, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { ProjectType } from '../models/Project';

export class ProjectModal extends Modal {
  private plugin: WritingStudioPlugin;
  private onDone: () => void;
  private title = '';
  private type: ProjectType = 'blank';
  private description = '';

  constructor(app: App, plugin: WritingStudioPlugin, onDone: () => void) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-project-modal');
    contentEl.createEl('h2', { text: 'New Writing Project' });

    // Declared early so the dropdown onChange closure can reference it; assigned below.
    let previewEl!: HTMLElement;

    new Setting(contentEl)
      .setName('Project title')
      .addText(t => t
        .setPlaceholder('My Novel')
        .onChange(v => { this.title = v; }));

    new Setting(contentEl)
      .setName('Template')
      .setDesc('Choose a pre-configured project structure.')
      .addDropdown(d => d
        .addOption('blank', 'Blank (custom structure)')
        .addOption('book', 'Book (Parts → Chapters → Scenes)')
        .addOption('series', 'Article Series (Series → Articles)')
        .addOption('blog', 'Blog Collection (Posts by date/category)')
        .addOption('journal-article', 'Journal Article — Academic or professional journal submission')
        .addOption('magazine-article', 'Magazine Article — Feature, long-form, or narrative nonfiction')
        .setValue(this.type)
        .onChange(v => {
          this.type = v as ProjectType;
          this.updateTemplatePreview(previewEl, this.type);
        }));

    new Setting(contentEl)
      .setName('Description (optional)')
      .addTextArea(t => t
        .setPlaceholder('Brief description of this project…')
        .onChange(v => { this.description = v; }));

    previewEl = contentEl.createDiv('ws-template-preview');
    this.updateTemplatePreview(previewEl, this.type);

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const createBtn = btnRow.createEl('button', { cls: 'mod-cta', text: 'Create Project' });
    createBtn.onclick = async () => {
      if (!this.title.trim()) {
        new Notice('Please enter a project title.');
        return;
      }
      createBtn.disabled = true;
      createBtn.textContent = 'Creating…';
      try {
        const project = await this.plugin.projectManager.createProject(
          this.title.trim(),
          this.type,
          this.plugin.settings.authorName,
          this.description
        );
        await this.plugin.projectManager.setActiveProject(project.id);
        new Notice(`Project "${project.title}" created!`);
        this.close();
        this.onDone();
      } catch (e) {
        new Notice(`Failed to create project: ${e instanceof Error ? e.message : String(e)}`);
        createBtn.disabled = false;
        createBtn.textContent = 'Create Project';
      }
    };

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
  }

  private updateTemplatePreview(el: HTMLElement, type: ProjectType): void {
    el.empty();
    const previews: Record<ProjectType, string> = {
      blank: 'Empty project — build your own structure.',
      book: 'Creates: Front Matter, Part 1 / Chapter 1, Back Matter placeholder.',
      series: 'Creates: Series folder, Article 1 placeholder, series metadata.',
      blog: 'Creates: date-organized folder, first post placeholder.',
      'journal-article': 'Creates: Title Page, Abstract, Keywords, Introduction, Literature Review, Methodology, Findings / Analysis, Discussion, Conclusion, References, Appendices.',
      'magazine-article': 'Creates: Pitch / Query Notes, Headline & Deck, Lede, Nut Graf, Body, Quotes & Sources, Kicker, Fact-Check Notes, Author Bio. Notes documents excluded from export by default.',
    };
    el.createEl('p', { text: previews[type], cls: 'ws-template-desc' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
