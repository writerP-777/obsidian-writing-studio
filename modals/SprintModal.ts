import { App, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';

export class SprintModal extends Modal {
  private plugin: WritingStudioPlugin;
  private duration: number;
  private wordGoal: number;
  private sprintScope: 'file' | 'project' = 'file';

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app);
    this.plugin = plugin;
    this.duration = plugin.settings.defaultSprintDuration;
    this.wordGoal = plugin.settings.defaultDailyWordGoal;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-sprint-modal');
    contentEl.createEl('h2', { text: 'Start writing sprint' });

    new Setting(contentEl)
      .setName('Duration (minutes)')
      .setDesc('Preset: 10, 15, 25, 30, 45, 60')
      .addDropdown(d => {
        [10, 15, 25, 30, 45, 60].forEach(m => d.addOption(String(m), `${m} min`));
        d.addOption('custom', 'Custom…');
        d.setValue(String(this.duration));
        d.onChange(v => {
          if (v === 'custom') return;
          this.duration = parseInt(v);
        });
      })
      .addText(t => t
        .setPlaceholder('Custom minutes')
        .onChange(v => { this.duration = parseInt(v) || this.duration; }));

    new Setting(contentEl)
      .setName('Word count goal (optional)')
      .setDesc('Leave 0 for no goal.')
      .addText(t => t
        .setPlaceholder('0')
        .setValue(String(this.wordGoal || ''))
        .onChange(v => { this.wordGoal = parseInt(v) || 0; }));

    new Setting(contentEl)
      .setName('Scope')
      .addDropdown(d => d
        .addOption('file', 'Current file')
        .addOption('project', 'Entire project')
        .setValue(this.sprintScope)
        .onChange(v => { this.sprintScope = v as any; }));

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const startBtn = btnRow.createEl('button', {
      cls: 'mod-cta',
      text: 'Start sprint',
    });
    startBtn.onclick = () => {
      if (!this.duration || this.duration <= 0) {
        new Notice('Please set a valid duration.');
        return;
      }
      this.plugin.sprintTimer.start(this.duration, this.wordGoal || undefined, this.sprintScope);
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
