// Composed-seam tests from the pre-3.0.0 audit (item 2, ruling on #233).
// The engine suite proves the passes in isolation; these tests exercise the
// two seams that produced every shipped defect in this family:
//
// 1. The vault rename route: main.ts routes TFolder renames to
//    ProjectManager.handleFolderRename, so migration's own attach-marker
//    rename mutates _project.json MID-PASS. The record must follow the
//    physical folder (or the next created document would mint a plain twin
//    beside the marked folder), the pass must still converge, and restore's
//    strip must heal the record back.
// 2. The real engine through the real bridge (carryOverBridge.test.ts mocks
//    the engine): migrate → re-migrate → restore → flag → skip, as one
//    sequence over one vault.

import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { BinderItem } from '../models/BinderItem';
import {
  CarryOverIO, planCarryOver, planHasWork, planRestore,
  runMigrationPass, runRestorePass,
} from '../src/carryOver';
import { runSilentMigration, runRestoreLayout, FailureLedgerEntry } from '../src/carryOverBridge';
import { BinderUpdateModal } from '../modals/BinderUpdateModal';
import { ProjectManager } from '../src/ProjectManager';
import { WritingProject } from '../models/Project';
import type WritingStudioPlugin from '../main';
import { MemVault } from './memVault';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

const ROOT = 'P';

function parentOf(p: string): string {
  return p.split('/').slice(0, -1).join('/');
}

// ─── Seam 1: migration with the main.ts rename route subscribed ────────────

function makePmPlugin() {
  return {
    app: {},
    settings: { defaultProjectFolder: 'Projects', authorName: '', removedProjectIds: [] as string[] },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function makeProject(over: Partial<WritingProject> = {}): WritingProject {
  return {
    id: 'p1',
    title: 'My Book',
    type: 'book',
    author: '',
    created: '2026-07-01',
    modified: '2026-07-01',
    description: '',
    folderPath: ROOT,
    goals: {},
    ...over,
  };
}

let nextId = 0;
function doc(title: string, filePath: string, extra: Partial<BinderItem> = {}): BinderItem {
  return { id: `d${nextId++}`, title, filePath, type: 'chapter', order: 0, status: 'draft', ...extra };
}

// Mirrors main.ts's vault 'rename' registration: only TFolder renames reach
// handleFolderRename, and the event fires as part of the rename itself.
function withRenameRoute(vault: MemVault, pm: ProjectManager): CarryOverIO {
  const io = vault.io();
  return {
    ...io,
    rename: async (from, to) => {
      const wasFolder = vault.folders.has(from);
      await io.rename(from, to);
      if (wasFolder) await pm.handleFolderRename(from, to);
    },
  };
}

// The #263 attach-marker case on the document folder itself: a flat legacy
// binder recorded its documents inside Chapters, the files now live at the
// project root ('done'), and the plain Chapters folder is still there — so
// migration's only folder op is renaming the document folder to its marked
// form while the rename route is live.
async function migratedFixture() {
  const legacyBody = '{"items":[]}'; // content irrelevant here; must stay untouched
  const vault = new MemVault({
    folders: [ROOT, `${ROOT}/Chapters`],
    files: {
      [`${ROOT}/foreword.md`]: { body: 'FOREWORD BODY' },
      [`${ROOT}/one.md`]: { body: 'ONE BODY' },
      [`${ROOT}/two.md`]: { body: 'TWO BODY' },
      [`${ROOT}/_binder.json`]: { body: legacyBody },
    },
  });
  const items = [
    doc('Foreword', `${ROOT}/Chapters/foreword.md`),
    doc('One', `${ROOT}/Chapters/one.md`),
    doc('Two', `${ROOT}/Chapters/two.md`),
  ];
  const files = new InMemoryVaultFiles();
  files.folders.add(ROOT);
  const pm = new ProjectManager(makePmPlugin(), files);
  const project = makeProject({ documentFolder: 'Chapters' });
  await pm.saveProject(project);
  const io = withRenameRoute(vault, pm);

  const result = await runMigrationPass(
    () => ({ plan: planCarryOver(items, ROOT, vault.disk()), disk: vault.disk() }),
    io,
  );
  return { vault, items, files, pm, project, io, result, legacyBody };
}

describe('composed: migration with the vault rename route subscribed', () => {
  it('the attach-marker rename repoints documentFolder to the marked folder mid-pass', async () => {
    const { vault, files, project, result, legacyBody } = await migratedFixture();

    expect(result.failures).toEqual([]);
    // The physical folder carries the marker...
    expect(vault.folders.has(`${ROOT}/005~ Chapters`)).toBe(true);
    expect(vault.folders.has(`${ROOT}/Chapters`)).toBe(false);
    // ...and the record followed it, in memory and on disk. A stale
    // 'Chapters' here would make the next created document mint a plain twin
    // folder beside the marked one.
    expect(project.documentFolder).toBe('005~ Chapters');
    const saved = JSON.parse(files.files.get(`${ROOT}/_project.json`) as string) as WritingProject;
    expect(saved.documentFolder).toBe('005~ Chapters');
    // The project folder itself was never renamed, so folderPath is untouched
    expect(project.folderPath).toBe(ROOT);
    // Documents were ordered as usual; the event did not disturb the pass
    expect(vault.files.get(`${ROOT}/foreword.md`)?.fm['binder-order']).toBe(10);
    expect(vault.files.get(`${ROOT}/two.md`)?.fm['binder-order']).toBe(30);
    // The legacy file is immutable through the composed path too
    expect(vault.files.get(`${ROOT}/_binder.json`)?.body).toBe(legacyBody);
  });

  it('the pass converges: a second run over the mutated record plans no work', async () => {
    const { vault, items, io } = await migratedFixture();
    const opsAfterFirst = vault.oplog.length;

    expect(planHasWork(planCarryOver(items, ROOT, vault.disk()))).toBe(false);
    await runMigrationPass(
      () => ({ plan: planCarryOver(items, ROOT, vault.disk()), disk: vault.disk() }),
      io,
    );

    expect(vault.oplog.length).toBe(opsAfterFirst);
  });

  it('restore with the rename route heals documentFolder back to the plain name', async () => {
    const { vault, items, files, project, io } = await migratedFixture();

    const result = await runRestorePass(
      () => ({ plan: planRestore(items, ROOT, vault.disk()), disk: vault.disk() }),
      io,
    );

    expect(result.failures).toEqual([]);
    // Marker stripped, documents back inside the recorded folder
    expect(vault.folders.has(`${ROOT}/Chapters`)).toBe(true);
    expect(vault.folders.has(`${ROOT}/005~ Chapters`)).toBe(false);
    expect(vault.files.has(`${ROOT}/Chapters/foreword.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/foreword.md`)).toBe(false);
    // The strip's rename event healed the record back
    expect(project.documentFolder).toBe('Chapters');
    const saved = JSON.parse(files.files.get(`${ROOT}/_project.json`) as string) as WritingProject;
    expect(saved.documentFolder).toBe('Chapters');
    // Layout-only: migrated frontmatter persists through restore
    expect(vault.files.get(`${ROOT}/Chapters/foreword.md`)?.fm['binder-order']).toBe(10);
  });
});

// ─── Seam 2: the real engine through the real bridge ───────────────────────

// An app facade over MemVault carrying exactly the surface carryOverBridge
// touches: getAbstractFileByPath, createFolder, cachedRead, renameFile,
// processFrontMatter, and the frontmatter cache.
function appOver(vault: MemVault) {
  const io = vault.io();
  const at = (path: string): TFile | TFolder | null => {
    const p = normalizePath(path);
    if (vault.files.has(p)) return new TFile(p, p.split('.').pop() ?? 'md');
    if (vault.folders.has(p)) {
      const folder = new TFolder(p);
      folder.children = [...vault.folders]
        .filter(f => f !== '' && parentOf(f) === p)
        .map(f => new TFolder(f));
      return folder;
    }
    return null;
  };
  return {
    vault: {
      getAbstractFileByPath: at,
      createFolder: (p: string) => io.createFolder(p),
      cachedRead: async (f: TFile) => vault.files.get(f.path)?.body ?? '',
    },
    fileManager: {
      renameFile: (f: TFile | TFolder, to: string) => io.rename(f.path, to),
      processFrontMatter: (f: TFile, mutate: (fm: Record<string, unknown>) => void) =>
        io.writeFrontmatter(f.path, mutate),
    },
    metadataCache: {
      getFileCache: (f: TFile) => {
        const file = vault.files.get(f.path);
        return file ? { frontmatter: file.fm } : null;
      },
    },
  };
}

const LEGACY = JSON.stringify({
  version: '2.0',
  projectId: 'p1',
  items: [
    { id: 'd1', title: 'Foreword', filePath: 'P/Chapters/foreword.md', type: 'chapter', order: 1, status: 'complete' },
    {
      id: 'g1', title: 'Part One', filePath: '', type: 'part', order: 2, status: 'draft',
      children: [
        { id: 'd2', title: 'Opening Night', filePath: 'P/Chapters/chapter-1.md', type: 'chapter', order: 1, status: 'draft', wordCountGoal: 2000 },
        { id: 'd3', title: 'The Long Walk', filePath: 'P/Chapters/chapter-2.md', type: 'chapter', order: 2, status: 'draft', includeInExport: false },
      ],
    },
  ],
});

function makeBridgeWorld() {
  const vault = new MemVault({
    folders: [ROOT, `${ROOT}/Chapters`],
    files: {
      [`${ROOT}/Chapters/foreword.md`]: { body: 'FOREWORD BODY' },
      [`${ROOT}/Chapters/chapter-1.md`]: { body: 'CH1 BODY' },
      [`${ROOT}/Chapters/chapter-2.md`]: { body: 'CH2 BODY' },
      [`${ROOT}/_binder.json`]: { body: LEGACY },
    },
  });
  const project = makeProject();
  const saveProject = jest.fn().mockResolvedValue(undefined);
  const plugin = {
    app: appOver(vault),
    settings: {
      binderUpdateNoticeSeen: false,
      carryOverFailures: {} as Record<string, FailureLedgerEntry>,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    projectManager: { getActiveProject: () => project, saveProject },
  };
  return { vault, project, saveProject, plugin: plugin as unknown as WritingStudioPlugin };
}

describe('composed: real engine through the real bridge', () => {
  beforeEach(() => {
    Notice.messages = [];
    jest.restoreAllMocks();
  });

  it('migrate → re-migrate → restore → flag → skip, as one sequence', async () => {
    const open = jest.spyOn(BinderUpdateModal.prototype, 'open');
    const { vault, project, saveProject, plugin } = makeBridgeWorld();

    // Migrate: real plan, real pass, real ledger, real notice decision
    await runSilentMigration(plugin);

    expect(vault.files.has(`${ROOT}/foreword.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/020~ Part One/chapter-1.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/020~ Part One/chapter-2.md`)).toBe(true);
    expect(vault.files.get(`${ROOT}/foreword.md`)?.fm).toMatchObject({
      'binder-order': 10, 'binder-status': 'complete',
    });
    expect(vault.files.get(`${ROOT}/020~ Part One/chapter-1.md`)?.fm['word-count-goal']).toBe(2000);
    expect(vault.files.get(`${ROOT}/020~ Part One/chapter-2.md`)?.fm['binder-compile']).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect((plugin.settings as { binderUpdateNoticeSeen: boolean }).binderUpdateNoticeSeen).toBe(true);
    expect((plugin.settings as { carryOverFailures: Record<string, FailureLedgerEntry> }).carryOverFailures).toEqual({});

    // Re-migrate: steady state — no operations, no second notice
    const opsAfterMigration = vault.oplog.length;
    await runSilentMigration(plugin);
    expect(vault.oplog.length).toBe(opsAfterMigration);
    expect(open).toHaveBeenCalledTimes(1);

    // Restore: files back, markers stripped, flag written before the notice
    await runRestoreLayout(plugin);

    expect(vault.files.has(`${ROOT}/Chapters/foreword.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/Chapters/chapter-1.md`)).toBe(true);
    expect(vault.folders.has(`${ROOT}/020~ Part One`)).toBe(false);
    expect(vault.folders.has(`${ROOT}/Part One`)).toBe(true); // created folders remain, marker stripped
    expect(project.binderLayoutRestored).toBe(true);
    expect(saveProject).toHaveBeenCalledWith(project);
    // Layout-only: the migrated frontmatter persists
    expect(vault.files.get(`${ROOT}/Chapters/foreword.md`)?.fm['binder-order']).toBe(10);

    // Skip: the restored project never auto-migrates again
    const opsAfterRestore = vault.oplog.length;
    await runSilentMigration(plugin);
    expect(vault.oplog.length).toBe(opsAfterRestore);
    expect(vault.files.has(`${ROOT}/Chapters/foreword.md`)).toBe(true);

    // The legacy file is byte-identical through the whole sequence
    expect(vault.files.get(`${ROOT}/_binder.json`)?.body).toBe(LEGACY);
  });
});
