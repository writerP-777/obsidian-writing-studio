// Binder view rendering from a half-migrated disk (#266). During a
// migration pass, folder marker renames fire vault 'rename' and frontmatter
// writes fire metadataCache 'changed'; each event lands the view's rebuild
// on a transient, half-migrated tree. These tests run a real migration over
// a live vault tree and rebuild the real view's model at every event and
// after every single operation, asserting the rebuild never crashes and the
// model converges to the final arrangement once the pass settles.

import { TFile, WorkspaceLeaf } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { FilesystemBinderView } from '../src/FilesystemBinderView';
import { BinderItem } from '../models/BinderItem';
import { CarryOverIO, DiskState, planCarryOver, planHasWork, runMigrationPass } from '../src/carryOver';
import { WritingProject } from '../models/Project';
import { FakeVaultApp } from './fakeVaultApp';

const ROOT = 'P';

let nextId = 0;
function legacyDoc(title: string, filePath: string, extra: Partial<BinderItem> = {}): BinderItem {
  return { id: `d${nextId++}`, title, filePath, type: 'chapter', order: 0, status: 'draft', ...extra };
}
function legacyPart(title: string, children: BinderItem[]): BinderItem {
  return { id: `p${nextId++}`, title, filePath: '', type: 'part', order: 0, status: 'draft', children };
}

function project(): WritingProject {
  return {
    id: 'p1', title: 'My Book', type: 'book', author: '',
    created: '2026-07-01', modified: '2026-07-01', description: '',
    folderPath: ROOT, goals: {},
  };
}

function diskState(fake: FakeVaultApp): DiskState {
  const app = fake.app();
  return {
    fileExists: p => app.vault.getAbstractFileByPath(p) instanceof TFile,
    folderExists: p => {
      const f = app.vault.getAbstractFileByPath(p);
      return f !== null && !(f instanceof TFile);
    },
    subfolderNames: p => {
      const f = app.vault.getAbstractFileByPath(p);
      if (f === null || f instanceof TFile) return [];
      return f.children.filter(c => !(c instanceof TFile)).map(c => c.name);
    },
    frontmatter: p => {
      const fm = fake.frontmatterAt(p);
      return fm === undefined ? null : fm;
    },
  };
}

function carryOverIO(fake: FakeVaultApp): CarryOverIO {
  const app = fake.app();
  return {
    createFolder: async (path) => {
      if (fake.byPath.has(path)) throw new Error(`EEXIST: folder exists at ${path}`);
      fake.folder(path);
    },
    rename: async (from, to) => {
      const file = fake.byPath.get(from);
      if (!file) throw new Error(`not found: ${from}`);
      await app.fileManager.renameFile(file, to);
    },
    writeFrontmatter: async (path, mutate) => {
      const file = fake.byPath.get(path);
      if (!(file instanceof TFile)) throw new Error(`not found: ${path}`);
      await app.fileManager.processFrontMatter(file, mutate);
    },
  };
}

// The canonical migration shape: a flat Chapters folder whose legacy binder
// nests two chapters under a part — migration creates the part folder, moves
// documents, and writes frontmatter, so the tree passes through several
// genuinely half-migrated states. Research and a hidden file ride along.
function makeWorld() {
  const fake = new FakeVaultApp();
  fake.file(`${ROOT}/_binder.json`, {});
  fake.file(`${ROOT}/Chapters/foreword.md`);
  fake.file(`${ROOT}/Chapters/chapter-1.md`);
  fake.file(`${ROOT}/Chapters/chapter-2.md`);
  fake.file(`${ROOT}/Research/notes.md`);
  const items = [
    legacyDoc('Foreword', `${ROOT}/Chapters/foreword.md`, { status: 'complete' }),
    legacyPart('Part One', [
      legacyDoc('Opening Night', `${ROOT}/Chapters/chapter-1.md`, { wordCountGoal: 2000 }),
      legacyDoc('The Long Walk', `${ROOT}/Chapters/chapter-2.md`, { includeInExport: false }),
    ]),
  ];
  const view = makeView(fake);
  return { fake, items, view };
}

function makeView(fake: FakeVaultApp): FilesystemBinderView {
  const leaf = { app: fake.app() } as unknown as WorkspaceLeaf;
  const view = new FilesystemBinderView(leaf, {} as unknown as WritingStudioPlugin);
  view['activeProject'] = project();
  return view;
}

function rebuild(view: FilesystemBinderView): string {
  const model = view['buildModel']();
  return view['modelSignature'](model);
}

async function migrateRebuildingEverywhere(
  fake: FakeVaultApp,
  items: BinderItem[],
  view: FilesystemBinderView,
): Promise<string[]> {
  const signatures: string[] = [];
  // The view's real triggers: every rename and every frontmatter write.
  fake.vaultEvents.on('rename', () => { signatures.push(rebuild(view)); });
  fake.metaEvents.on('changed', () => { signatures.push(rebuild(view)); });
  // Belt and braces: rebuild after every single operation too, so states no
  // event happens to expose (fresh folder creation) are still rendered.
  const io = carryOverIO(fake);
  const rebuilding: CarryOverIO = {
    createFolder: async (p) => { await io.createFolder(p); signatures.push(rebuild(view)); },
    rename: async (f, t) => { await io.rename(f, t); signatures.push(rebuild(view)); },
    writeFrontmatter: async (p, m) => { await io.writeFrontmatter(p, m); signatures.push(rebuild(view)); },
  };
  const result = await runMigrationPass(
    () => ({ plan: planCarryOver(items, ROOT, diskState(fake)), disk: diskState(fake) }),
    rebuilding,
  );
  expect(result.failures).toEqual([]);
  return signatures;
}

describe('binder view model over a half-migrated disk', () => {
  it('rebuilds crash-free at every mid-migration state and event', async () => {
    const { fake, items, view } = makeWorld();

    const signatures = await migrateRebuildingEverywhere(fake, items, view);

    // The pass really moved through distinct transient states — folder
    // creation, three document moves, frontmatter writes.
    expect(signatures.length).toBeGreaterThanOrEqual(6);
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(3);
  });

  it('converges: the settled model is the final arrangement, stable across rebuilds', async () => {
    const { fake, items, view } = makeWorld();

    await migrateRebuildingEverywhere(fake, items, view);
    expect(planHasWork(planCarryOver(items, ROOT, diskState(fake)))).toBe(false);

    const model = view['buildModel']();
    // Manuscript zone in binder order: the emptied Chapters folder first —
    // the legacy binder recorded documents inside it, so migration minted its
    // marker at earliest-doc − 5 (#263) — then foreword (order 10), then the
    // created part folder. Markers stripped in display.
    expect(model.manuscript.map(n => n.displayName)).toEqual(['Chapters', 'foreword', 'Part One']);
    expect(model.manuscript[0].name).toBe('005~ Chapters');
    expect(model.manuscript[1].status).toBe('complete');
    const partNode = model.manuscript[2];
    expect(partNode.name).toBe('020~ Part One');
    expect(partNode.children.map(n => n.displayName)).toEqual(['chapter-1', 'chapter-2']);
    expect(partNode.children[1].compileExcluded).toBe(true);
    expect(partNode.mdCount).toBe(2);
    // Research is a drawer zone, not manuscript; _binder.json is hidden.
    expect(model.manuscript.map(n => n.name)).not.toContain('_binder.json');
    expect(model.zones.research.fileCount).toBe(1);

    // Stable: an immediate rebuild and a fresh view over the same disk agree.
    const settled = view['modelSignature'](model);
    expect(rebuild(view)).toBe(settled);
    expect(rebuild(makeView(fake))).toBe(settled);
  });
});
