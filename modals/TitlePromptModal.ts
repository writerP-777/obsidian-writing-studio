import { App, Modal } from 'obsidian';
import { safeHandler } from '../src/safeHandler';

// Minimal single-field prompt for naming things at creation time. The initial
// value is prefilled and selected, so Enter-through keeps the fast path to one
// keystroke. Escape or closing the modal cancels without calling onSubmit.
export class TitlePromptModal extends Modal {
  private heading: string;
  private initialValue: string;
  private ctaText: string;
  private cancelText: string;
  private onSubmit: (value: string) => Promise<void>;
  private submitted = false;

  constructor(
    app: App,
    heading: string,
    initialValue: string,
    ctaText: string,
    cancelText: string,
    onSubmit: (value: string) => Promise<void>
  ) {
    super(app);
    this.heading = heading;
    this.initialValue = initialValue;
    this.ctaText = ctaText;
    this.cancelText = cancelText;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);

    const input = this.contentEl.createEl('input', {
      cls: 'ws-title-prompt-input',
      type: 'text',
      value: this.initialValue,
    });
    input.select();

    const submit = safeHandler(async () => {
      if (this.submitted) return;
      this.submitted = true;
      // An emptied field falls back to the suggestion rather than creating
      // a document with an empty name
      const value = input.value.trim() || this.initialValue;
      this.close();
      await this.onSubmit(value);
    });

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };

    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const ctaBtn = buttons.createEl('button', { cls: 'mod-cta', text: this.ctaText });
    ctaBtn.onclick = () => { submit(); };
    const cancelBtn = buttons.createEl('button', { text: this.cancelText });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
