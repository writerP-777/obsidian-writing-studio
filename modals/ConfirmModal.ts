import { App, Modal } from 'obsidian';
import { safeHandler } from '../src/safeHandler';

export class ConfirmModal extends Modal {
  private heading: string;
  private message: string;
  private ctaText: string;
  private cancelText: string;
  private onConfirm: () => Promise<void>;

  constructor(
    app: App,
    heading: string,
    message: string,
    ctaText: string,
    cancelText: string,
    onConfirm: () => Promise<void>
  ) {
    super(app);
    this.heading = heading;
    this.message = message;
    this.ctaText = ctaText;
    this.cancelText = cancelText;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.contentEl.createEl('p', { text: this.message });

    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const confirmBtn = buttons.createEl('button', { cls: 'mod-warning', text: this.ctaText });
    confirmBtn.onclick = safeHandler(async () => {
      this.close();
      await this.onConfirm();
    });
    const cancelBtn = buttons.createEl('button', { text: this.cancelText });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
