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
    // No goal by default — the daily word goal made an odd target for one sprint
    this.wordGoal = 0;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-sprint-modal');
    contentEl.createEl('h2', { text: t('sprintModal.setupTitle') });

    // One control for one value — the minutes input shows only when the
    // dropdown is on "Custom…" (both inputs visible meant last-edit-wins)
    const presets = [10, 15, 25, 30, 45, 60];
    const isPreset = presets.includes(this.duration);
    let customSetting: Setting;
    let customValue = isPreset ? '' : String(this.duration);

    new Setting(contentEl)
      .setName(t('sprintModal.durationName'))
      .setDesc(t('sprintModal.durationDesc'))
      .addDropdown(d => {
        presets.forEach(m => { d.addOption(String(m), `${m} min`); });
        d.addOption('custom', t('sprintModal.durationCustom'));
        d.setValue(isPreset ? String(this.duration) : 'custom');
        d.onChange(v => {
          const custom = v === 'custom';
          customSetting.settingEl.toggleClass('ws-hidden', !custom);
          // On custom, the typed value (possibly still empty) is the duration
          this.duration = custom ? parseInt(customValue) || 0 : parseInt(v);
        });
      });

    customSetting = new Setting(contentEl)
      .setName(t('sprintModal.durationCustom'))
      .addText(tx => tx
        .setPlaceholder(t('sprintModal.durationCustomPlaceholder'))
        .setValue(customValue)
        .onChange(v => {
          customValue = v;
          this.duration = parseInt(v) || 0;
        }));
    customSetting.settingEl.toggleClass('ws-hidden', isPreset);

    new Setting(contentEl)
      .setName(t('sprintModal.wordGoalName'))
      .setDesc(t('sprintModal.wordGoalDesc'))
      .addText(tx => tx
        .setPlaceholder(t('sprintModal.wordGoalPlaceholder'))
        .setValue(this.wordGoal ? String(this.wordGoal) : '')
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
      this.plugin.sprintTimer.setup(this.duration, this.wordGoal || undefined, this.sprintScope);
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: t('sprintModal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
