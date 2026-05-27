import { App, Modal, TFile } from 'obsidian';
import { t } from '../src/i18n';

export class ScanFolderModal extends Modal {
  private files: TFile[];
  private checked: Map<string, boolean>;
  private onConfirm: (files: TFile[]) => Promise<void>;

  constructor(app: App, files: TFile[], onConfirm: (files: TFile[]) => Promise<void>) {
    super(app);
    this.files = files;
    this.checked = new Map(files.map(f => [f.path, true]));
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-scan-folder-modal');
    contentEl.createEl('h2', { text: t('scanFolder.title') });
    contentEl.createEl('p', {
      text: t('scanFolder.desc'),
      cls: 'ws-scan-folder-desc',
    });

    const listEl = contentEl.createDiv('ws-scan-folder-list');
    for (const file of this.files) {
      const label = listEl.createEl('label', { cls: 'ws-scan-folder-row' });
      const checkbox = label.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        this.checked.set(file.path, checkbox.checked);
      });
      label.createSpan({ text: file.basename });
    }

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const addBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('scanFolder.addBtn') });
    addBtn.onclick = async () => {
      const selected = this.files.filter(f => this.checked.get(f.path));
      await this.onConfirm(selected);
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: t('scanFolder.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
