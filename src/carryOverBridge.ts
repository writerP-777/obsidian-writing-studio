// Vault-facing glue for the carry-over preview (#230): builds the pure
// engine's DiskState from the live vault, reads the legacy binder without
// touching the runtime loader (loadBinder caches and writes a .bak on
// corrupt input — a dry run must be provably read-only), and owns the
// one-time per-project notice. Execution lives in #231.

import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';
import { CarryOverPlan, DiskState, parseLegacyBinder, planCarryOver, planHasWork } from './carryOver';
import { CarryOverPreviewModal } from '../modals/CarryOverPreviewModal';
import { t } from './i18n';

export function buildDiskState(app: App): DiskState {
  const at = (path: string) => app.vault.getAbstractFileByPath(normalizePath(path));
  return {
    fileExists: (path) => at(path) instanceof TFile,
    folderExists: (path) => at(path) instanceof TFolder,
    subfolderNames: (parentPath) => {
      const folder = at(parentPath);
      if (!(folder instanceof TFolder)) return [];
      return folder.children.filter((c): c is TFolder => c instanceof TFolder).map(c => c.name);
    },
    // The metadata cache can be cold right after vault open; a key it has
    // not indexed yet merely previews as "will write" — execution (#231)
    // re-checks at write time, so nothing user-set is ever overwritten.
    frontmatter: (path) => {
      const file = at(path);
      if (!(file instanceof TFile)) return null;
      return app.metadataCache.getFileCache(file)?.frontmatter ?? null;
    },
  };
}

export type CarryOverPlanResult =
  | { kind: 'plan'; plan: CarryOverPlan }
  | { kind: 'missing' }
  | { kind: 'corrupt' };

export async function computeCarryOverPlan(
  app: App,
  project: WritingProject,
): Promise<CarryOverPlanResult> {
  const file = app.vault.getAbstractFileByPath(normalizePath(`${project.folderPath}/_binder.json`));
  if (!(file instanceof TFile)) return { kind: 'missing' };
  const legacy = parseLegacyBinder(await app.vault.cachedRead(file));
  if (!legacy) return { kind: 'corrupt' };
  return { kind: 'plan', plan: planCarryOver(legacy.items, project.folderPath, buildDiskState(app)) };
}

export async function openCarryOverPreview(
  plugin: WritingStudioPlugin,
  project: WritingProject,
): Promise<void> {
  const result = await computeCarryOverPlan(plugin.app, project);
  if (result.kind === 'missing') {
    new Notice(t('binder.carryOver.nothingToPreview'));
    return;
  }
  if (result.kind === 'corrupt') {
    new Notice(t('binder.carryOver.readFailed'));
    return;
  }
  new CarryOverPreviewModal(plugin.app, project.title, project.folderPath, result.plan).open();
}

// The one-time per-project offer (#230 Q3): fires on project activation only
// when the experimental binder is on, a legacy binder exists, and its plan
// still has work. Shown once — the seen flag persists in data.json (a view
// preference, never in the vault); the command and the binder's project-row
// button re-offer it any time.
export async function maybeOfferCarryOver(plugin: WritingStudioPlugin): Promise<void> {
  if (!plugin.settings.filesystemBinder) return;
  const project = plugin.projectManager.getActiveProject();
  if (!project || plugin.settings.carryOverNoticeSeen[project.id]) return;
  const result = await computeCarryOverPlan(plugin.app, project);
  if (result.kind !== 'plan' || !planHasWork(result.plan)) return;

  plugin.settings.carryOverNoticeSeen[project.id] = true;
  await plugin.saveSettings();

  const plan = result.plan;
  const notice = new Notice(createFragment((frag) => {
    const box = frag.createDiv('ws-co-notice');
    box.createDiv({ cls: 'ws-co-notice-name', text: 'Writing Studio' });
    box.createDiv({ text: t('binder.carryOver.noticeBody', { project: project.title }) });
    const buttons = box.createDiv('ws-co-notice-buttons');
    const previewBtn = buttons.createEl('button', { text: t('binder.carryOver.noticePreview') });
    previewBtn.onclick = () => {
      notice.hide();
      new CarryOverPreviewModal(plugin.app, project.title, project.folderPath, plan).open();
    };
    const notNowBtn = buttons.createEl('button', { text: t('binder.carryOver.noticeNotNow') });
    notNowBtn.onclick = () => notice.hide();
  }), 0);
}
