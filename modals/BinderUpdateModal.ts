import { Modal } from 'obsidian';
import { t } from '../src/i18n';

// The one-time "binder and folders now stay in sync" notice (#233): shown
// once per vault, immediately after the first migration that actually
// performs work. Informational, not a consent gate — the migration has
// already run; the modal explains what happened and carries the visible
// affordance for "Restore previous binder layout". A user with nothing to
// migrate never sees it.
export class BinderUpdateModal extends Modal {
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-binder-update-modal');
    contentEl.createEl('h2', { text: t('binderUpdate.title') });
    contentEl.createEl('p', { text: t('binderUpdate.body1') });
    contentEl.createEl('p', { text: t('binderUpdate.body2') });
    contentEl.createEl('p', { text: t('binderUpdate.body3') });

    const btnRow = contentEl.createDiv('ws-modal-btn-row');
    btnRow.createEl('button', { cls: 'mod-cta', text: t('binderUpdate.gotIt') }).onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
