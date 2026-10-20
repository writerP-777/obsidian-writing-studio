import { App, Modal, Setting } from 'obsidian';
import { safeHandler } from '../src/safeHandler';
import { t } from '../src/i18n';

// Confirms a merge of two neighbouring sections: says what the result is
// named, offers to keep the second title as a heading at the join, and
// states plainly that the second file goes to the trash (never deleted
// outright), so the writer knows the way back before clicking.
export class MergeSectionsModal extends Modal {
  private readonly first: string;
  private readonly second: string;
  private readonly onConfirm: (addHeading: boolean) => Promise<void>;
  private addHeading = false;
  private submitted = false;

  constructor(app: App, firstTitle: string, secondTitle: string, onConfirm: (addHeading: boolean) => Promise<void>) {
    super(app);
    this.first = firstTitle;
    this.second = secondTitle;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-merge-modal');
    this.titleEl.setText(t('sections.mergeTitle'));
    contentEl.createEl('p', { text: t('sections.mergeMessage', { first: this.first, second: this.second }) });

    new Setting(contentEl)
      .setName(t('sections.mergeHeadingToggle', { second: this.second }))
      .addToggle(tg => {
        tg.setValue(this.addHeading);
        tg.onChange(v => { this.addHeading = v; });
      });

    contentEl.createEl('p', { cls: 'ws-merge-hint', text: t('sections.mergeTrashHint') });

    const submit = safeHandler(async () => {
      if (this.submitted) return;
      this.submitted = true;
      this.close();
      await this.onConfirm(this.addHeading);
    });

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const mergeBtn = buttons.createEl('button', { cls: 'mod-cta', text: t('sections.mergeBtn') });
    mergeBtn.onclick = () => { submit(); };
    const cancelBtn = buttons.createEl('button', { text: t('synopsis.cancel') });
    cancelBtn.onclick = () => this.close();

    this.scope.register([], 'Enter', (e) => {
      e.preventDefault();
      submit();
      return false;
    });
    mergeBtn.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
