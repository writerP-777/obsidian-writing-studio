import { App, Modal, Setting, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { t } from '../src/i18n';

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
    contentEl.createEl('h2', { text: t('sprintModal.title') });

    new Setting(contentEl)
      .setName(t('sprintModal.durationName'))
      .setDesc(t('sprintModal.durationDesc'))
      .addDropdown(d => {
        [10, 15, 25, 30, 45, 60].forEach(m => { d.addOption(String(m), `${m} min`); });
        d.addOption('custom', t('sprintModal.durationCustom'));
        d.setValue(String(this.duration));
        d.onChange(v => {
          if (v === 'custom') return;
          this.duration = parseInt(v);
        });
      })
      .addText(tx => tx
        .setPlaceholder(t('sprintModal.durationCustomPlaceholder'))
        .onChange(v => { this.duration = parseInt(v) || this.duration; }));

    new Setting(contentEl)
      .setName(t('sprintModal.wordGoalName'))
      .setDesc(t('sprintModal.wordGoalDesc'))
      .addText(tx => tx
        .setPlaceholder('0')
        .setValue(String(this.wordGoal || ''))
        .onChange(v => { this.wordGoal = parseInt(v) || 0; }));

    new Setting(contentEl)
      .setName(t('sprintModal.scopeName'))
      .addDropdown(d => d
        .addOption('file', t('sprintModal.scopeFile'))
        .addOption('project', t('sprintModal.scopeProject'))
        .setValue(this.sprintScope)
        .onChange(v => { this.sprintScope = v as 'file' | 'project'; }));

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const startBtn = btnRow.createEl('button', {
      cls: 'mod-cta',
      text: t('sprintModal.startBtn'),
    });
    startBtn.onclick = () => {
      if (!this.duration || this.duration <= 0) {
        new Notice(t('sprintModal.errorDuration'));
        return;
      }
      this.plugin.sprintTimer.start(this.duration, this.wordGoal || undefined, this.sprintScope);
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: t('sprintModal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
