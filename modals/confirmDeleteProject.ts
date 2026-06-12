import { App, Notice } from 'obsidian';
import type WritingStudioPlugin from '../main';
import type { WritingProject } from '../models/Project';
import { ConfirmModal } from './ConfirmModal';
import { t } from '../src/i18n';

// Shared by the launcher and binder delete entry points. Deletion is
// registry-only — the modal copy promises the files stay in the vault.
export function confirmDeleteProject(app: App, plugin: WritingStudioPlugin, project: WritingProject): void {
  new ConfirmModal(
    app,
    t('projectModal.deleteTitle'),
    t('projectModal.deleteMessage', { title: project.title }),
    t('projectModal.deleteBtn'),
    t('projectModal.cancel'),
    async () => {
      await plugin.projectManager.deleteProject(project.id);
      new Notice(t('projectModal.deleted', { title: project.title }));
    }
  ).open();
}
