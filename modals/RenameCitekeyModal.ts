import { App, Modal, Notice } from 'obsidian';
import { isValidCitekey } from '../src/citekeyRename';
import { safeHandler } from '../src/safeHandler';
import { t } from '../src/i18n';

export interface KeyUsage {
  citations: number;
  sections: number;
  notes: number;
}

// Renames a source's citation key. The dialog shows the source, the current
// key, and where it is cited, validates the new key against the syntax and
// every key in use, and hands the confirmed key back for the rewrite.
export class RenameCitekeyModal extends Modal {
  private readonly sourceLabel: string;
  private readonly currentKey: string;
  private readonly taken: ReadonlySet<string>;
  private readonly usage: KeyUsage;
  private readonly onConfirm: (newKey: string) => Promise<void>;
  private submitted = false;

  constructor(
    app: App,
    sourceLabel: string,
    currentKey: string,
    taken: ReadonlySet<string>,
    usage: KeyUsage,
    onConfirm: (newKey: string) => Promise<void>,
  ) {
    super(app);
    this.sourceLabel = sourceLabel;
    this.currentKey = currentKey;
    this.taken = taken;
    this.usage = usage;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-rename-key-modal');
    this.titleEl.setText(t('citations.renameKeyTitle'));

    const grid = contentEl.createDiv('ws-rename-key-grid');
    grid.createDiv({ cls: 'ws-rename-key-label', text: t('citations.renameKeySource') });
    grid.createDiv({ cls: 'ws-rename-key-value', text: this.sourceLabel });
    grid.createDiv({ cls: 'ws-rename-key-label', text: t('citations.renameKeyCurrent') });
    grid.createDiv({ cls: 'ws-rename-key-value ws-rename-key-mono', text: this.currentKey });
    grid.createDiv({ cls: 'ws-rename-key-label', text: t('citations.renameKeyNew') });
    const input = grid.createEl('input', { type: 'text', cls: 'ws-rename-key-input', value: this.currentKey });
    input.setAttribute('aria-label', t('citations.renameKeyNew'));

    const u = this.usage;
    const usageText = u.citations === 0
      ? t('citations.renameKeyUnused')
      : t('citations.renameKeyUsage', {
        citations: t('citations.countCitations', { count: u.citations }),
        where: [
          u.sections > 0 ? t('citations.countSections', { count: u.sections }) : '',
          u.notes > 0 ? t('citations.countNotes', { count: u.notes }) : '',
        ].filter(s => s.length > 0).join(t('citations.countJoin')),
      });
    contentEl.createEl('p', { cls: 'ws-rename-key-usage', text: usageText });

    const submit = safeHandler(async () => {
      if (this.submitted) return;
      const next = input.value.trim();
      if (next === this.currentKey) {
        new Notice(t('citations.renameKeySame'));
        return;
      }
      if (!isValidCitekey(next)) {
        new Notice(t('citations.citekeyInvalid'));
        return;
      }
      if (this.taken.has(next)) {
        new Notice(t('citations.citekeyTaken', { key: next }));
        return;
      }
      this.submitted = true;
      this.close();
      await this.onConfirm(next);
    });

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const renameBtn = buttons.createEl('button', { cls: 'mod-cta', text: t('citations.renameKeyBtn') });
    renameBtn.onclick = () => { submit(); };
    const cancelBtn = buttons.createEl('button', { text: t('synopsis.cancel') });
    cancelBtn.onclick = () => this.close();

    input.focus();
    input.select();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
