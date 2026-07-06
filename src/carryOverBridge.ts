// Vault-facing glue for silent migration and the layout restore (#231).
// Builds the pure engine's DiskState from the live vault, reads the legacy
// binder without touching the runtime loader (loadBinder caches and writes a
// .bak on corrupt input — migration must be provably read-only toward
// _binder.json), runs the passes, and owns the graduated failure ledger
// (R2): first failure silent + logged, second consecutive run's failure
// notices once per signature, success clears the record.

import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';
import { BinderData } from '../models/BinderItem';
import {
  CarryOverIO, DiskState, PassFailure,
  parseLegacyBinder, planCarryOver, planHasWork, planRestore, restoreHasWork,
  runMigrationPass, runRestorePass,
} from './carryOver';
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
    // not indexed yet merely plans as "will write" — the processFrontMatter
    // callback re-checks live, so nothing user-set is ever overwritten.
    frontmatter: (path) => {
      const file = at(path);
      if (!(file instanceof TFile)) return null;
      return app.metadataCache.getFileCache(file)?.frontmatter ?? null;
    },
  };
}

function obsidianIO(app: App): CarryOverIO {
  return {
    createFolder: async (path) => {
      await app.vault.createFolder(normalizePath(path));
    },
    rename: async (fromPath, toPath) => {
      const file = app.vault.getAbstractFileByPath(normalizePath(fromPath));
      if (!file) throw new Error(`not found: ${fromPath}`);
      await app.fileManager.renameFile(file, normalizePath(toPath));
    },
    writeFrontmatter: async (path, mutate) => {
      const file = app.vault.getAbstractFileByPath(normalizePath(path));
      if (!(file instanceof TFile)) throw new Error(`not found: ${path}`);
      await app.fileManager.processFrontMatter(file, mutate);
    },
  };
}

async function readLegacyBinder(app: App, project: WritingProject): Promise<BinderData | null> {
  const file = app.vault.getAbstractFileByPath(normalizePath(`${project.folderPath}/_binder.json`));
  if (!(file instanceof TFile)) return null;
  return parseLegacyBinder(await app.vault.cachedRead(file));
}

// Common failure causes in plain language (R2); the raw message is the
// fallback, not the default.
function describeReason(reason: string): string {
  if (reason === 'name-taken') return t('binder.migration.reasonNameTaken');
  if (/EBUSY|ETXTBSY|locked|being used|in use/i.test(reason)) return t('binder.migration.reasonInUse');
  if (/EACCES|EPERM|permission/i.test(reason)) return t('binder.migration.reasonPermission');
  return reason;
}

function failureNoticeKey(kind: PassFailure['kind']): string {
  if (kind === 'folder') return 'binder.migration.couldntRename';
  if (kind === 'frontmatter') return 'binder.migration.couldntUpdate';
  return 'binder.migration.couldntMove'; // move + leftover
}

// R2 ledger, persisted in data.json: signature → consecutive-fail count and
// whether its one notice has fired. Success clears the entry, so a fresh
// failure of the same item can notice again.
export interface FailureLedgerEntry {
  count: number;
  noticed: boolean;
}

export async function updateFailureLedger(
  plugin: WritingStudioPlugin,
  project: WritingProject,
  failures: PassFailure[],
): Promise<void> {
  const ledger = plugin.settings.carryOverFailures;
  const prefix = `${project.id}|`;
  const seen = new Set<string>();
  let changed = false;

  for (const f of failures) {
    const sig = prefix + f.signature;
    seen.add(sig);
    const entry = ledger[sig] ?? { count: 0, noticed: false };
    entry.count += 1;
    console.warn(`Writing Studio migration: ${f.kind} failed for ${f.name} — ${f.reason}`);
    if (entry.count >= 2 && !entry.noticed) {
      new Notice(t(failureNoticeKey(f.kind), { name: f.name, reason: describeReason(f.reason) }));
      entry.noticed = true;
    }
    ledger[sig] = entry;
    changed = true;
  }
  // Success clears: any of this project's signatures not failing this run
  for (const sig of Object.keys(ledger)) {
    if (sig.startsWith(prefix) && !seen.has(sig)) {
      delete ledger[sig];
      changed = true;
    }
  }
  if (changed) await plugin.saveSettings();
}

// One run at a time per project — activation and startup can overlap.
const inFlight = new Set<string>();

// Silent migration (#231): no notice, no consent, no user action. Gated on
// the experimental toggle until the #233 cutover. Steady state is a no-op:
// a migrated project's plan has no work and nothing is touched.
export async function runSilentMigration(plugin: WritingStudioPlugin): Promise<void> {
  if (!plugin.settings.filesystemBinder) return;
  const project = plugin.projectManager.getActiveProject();
  if (!project || inFlight.has(project.id)) return;

  const legacy = await readLegacyBinder(plugin.app, project);
  if (!legacy) return; // absent, or corrupt (logged path is 2.x's concern)

  const compute = () => {
    const disk = buildDiskState(plugin.app);
    return { plan: planCarryOver(legacy.items, project.folderPath, disk), disk };
  };
  if (!planHasWork(compute().plan)) return;

  inFlight.add(project.id);
  try {
    const result = await runMigrationPass(compute, obsidianIO(plugin.app));
    await updateFailureLedger(plugin, project, result.failures);
  } finally {
    inFlight.delete(project.id);
  }
}

// "Restore previous binder layout" (#231 inverse pass) — user-invoked, so
// it reports directly rather than through the graduated ledger. Layout-only
// by ruling: frontmatter is untouched and nothing is ever deleted.
export async function runRestoreLayout(plugin: WritingStudioPlugin): Promise<void> {
  const project = plugin.projectManager.getActiveProject();
  if (!plugin.settings.filesystemBinder || !project) {
    new Notice(t('binder.migration.restoreUnavailable'));
    return;
  }
  if (inFlight.has(project.id)) return;
  const legacy = await readLegacyBinder(plugin.app, project);
  if (!legacy) {
    new Notice(t('binder.migration.restoreNothing'));
    return;
  }

  const compute = () => {
    const disk = buildDiskState(plugin.app);
    return { plan: planRestore(legacy.items, project.folderPath, disk), disk };
  };
  if (!restoreHasWork(compute().plan)) {
    new Notice(t('binder.migration.restoreNothing'));
    return;
  }

  inFlight.add(project.id);
  try {
    const result = await runRestorePass(compute, obsidianIO(plugin.app));
    for (const f of result.failures) {
      console.warn(`Writing Studio restore: failed for ${f.name} — ${f.reason}`);
    }
    const leftBehind = result.skipped + result.failures.length;
    new Notice(leftBehind > 0
      ? t('binder.migration.restorePartial', { count: leftBehind })
      : t('binder.migration.restoreDone'));
  } finally {
    inFlight.delete(project.id);
  }
}
