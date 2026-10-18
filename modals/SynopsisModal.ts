import { App, Modal } from 'obsidian';
import { normalizeSynopsis } from '../src/binderMenu';
import { safeHandler } from '../src/safeHandler';
import { t } from '../src/i18n';

// Edits one document's synopsis — the one-paragraph statement of what the
// section argues or covers. The box is multi-line for comfort; the saved
// value is one paragraph (normalizeSynopsis). Ctrl+Enter saves, Escape
// cancels, and an emptied box means "remove the synopsis".
export class SynopsisModal extends Modal {
  private docTitle: string;
  private initialValue: string;
  private onSubmit: (value: string) => Promise<void>;
  private submitted = false;

  constructor(app: App, docTitle: string, initialValue: string, onSubmit: (value: string) => Promise<void>) {
    super(app);
    this.docTitle = docTitle;
    this.initialValue = initialValue;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.titleEl.setText(t('synopsis.title', { name: this.docTitle }));
    this.contentEl.addClass('ws-synopsis-modal');

    const box = this.contentEl.createEl('textarea', {
      cls: 'ws-synopsis-input',
      attr: { rows: '4', placeholder: t('synopsis.placeholder') },
    });
    box.value = this.initialValue;
    this.contentEl.createDiv({ cls: 'ws-synopsis-hint', text: t('synopsis.hint') });

    const submit = safeHandler(async () => {
      if (this.submitted) return;
      this.submitted = true;
      const value = normalizeSynopsis(box.value);
      this.close();
      await this.onSubmit(value);
    });

    box.onkeydown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    };

    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const saveBtn = buttons.createEl('button', { cls: 'mod-cta', text: t('synopsis.save') });
    saveBtn.onclick = () => { submit(); };
    const cancelBtn = buttons.createEl('button', { text: t('synopsis.cancel') });
    cancelBtn.onclick = () => this.close();

    // Cursor at the end of an existing synopsis, ready to extend it
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
