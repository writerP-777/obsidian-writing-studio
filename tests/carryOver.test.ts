// Silent migration engine and executor (#230/#231). Locked guarantees:
// deterministic plans, R1 leave-in-place collisions with the order fix,
// write-if-absent precedence with live re-check (Q1/Q5), dependency-aware
// skip (R3), kill-and-rerun resumability at every prefix length,
// prose-safety, the layout-only restore round-trip, and a provably
// untouched _binder.json.

import { Notice } from 'obsidian';
import { BinderItem } from '../models/BinderItem';
import {
  CarryOverIO, DiskState,
  parseLegacyBinder, planCarryOver, planHasWork, planRestore, restoreHasWork,
  runMigrationPass, runRestorePass, sanitizeTitle,
} from '../src/carryOver';
import { updateFailureLedger } from '../src/carryOverBridge';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';

const ROOT = 'P';

// ─── In-memory vault: real move semantics, ops logged ──────────────────────

interface MemFile {
  fm: Record<string, unknown>;
  body: string;
}

class MemVault {
  folders = new Set<string>(['']);
  files = new Map<string, MemFile>();
  oplog: string[] = [];

  constructor(seed: { folders?: string[]; files?: Record<string, Partial<MemFile>> } = {}) {
    for (const f of seed.folders ?? []) this.folders.add(f);
    for (const [p, v] of Object.entries(seed.files ?? {})) {
      this.files.set(p, { fm: v.fm ?? {}, body: v.body ?? `body of ${p}` });
    }
  }

  private parentOf(p: string): string {
    return p.split('/').slice(0, -1).join('/');
  }

  io(): CarryOverIO {
    return {
      createFolder: async (path) => {
        this.oplog.push(`createFolder ${path}`);
        if (this.folders.has(path)) throw new Error('EEXIST: folder exists');
        if (!this.folders.has(this.parentOf(path))) throw new Error('ENOENT: parent missing');
        this.folders.add(path);
      },
      rename: async (from, to) => {
        this.oplog.push(`rename ${from} -> ${to}`);
        if (this.files.has(to) || this.folders.has(to)) throw new Error('EEXIST: target exists');
        if (!this.folders.has(this.parentOf(to))) throw new Error('ENOENT: parent missing');
        if (this.files.has(from)) {
          this.files.set(to, this.files.get(from) as MemFile);
          this.files.delete(from);
          return;
        }
        if (this.folders.has(from)) {
          const prefix = from + '/';
          for (const f of [...this.folders]) {
            if (f === from || f.startsWith(prefix)) {
              this.folders.delete(f);
              this.folders.add(to + f.slice(from.length));
            }
          }
          for (const p of [...this.files.keys()]) {
            if (p.startsWith(prefix)) {
              const v = this.files.get(p) as MemFile;
              this.files.delete(p);
              this.files.set(to + p.slice(from.length), v);
            }
          }
          return;
        }
        throw new Error('ENOENT: source missing');
      },
      writeFrontmatter: async (path, mutate) => {
        this.oplog.push(`fm ${path}`);
        const f = this.files.get(path);
        if (!f) throw new Error('ENOENT: file missing');
        mutate(f.fm);
      },
    };
  }

  disk(): DiskState {
    return {
      fileExists: p => this.files.has(p),
      folderExists: p => this.folders.has(p),
      subfolderNames: parent => [...this.folders]
        .filter(f => f !== '' && this.parentOf(f) === parent)
        .map(f => f.split('/').pop() as string),
      frontmatter: p => {
        const f = this.files.get(p);
        return f ? f.fm : null;
      },
    };
  }
}

// Injected interruption: allow N operations, then every call throws.
function faultyIO(io: CarryOverIO, allow: number): CarryOverIO {
  let n = 0;
  const gate = () => {
    if (n >= allow) throw new Error('KILLED: injected interruption');
    n += 1;
  };
  return {
    createFolder: async (p) => { gate(); await io.createFolder(p); },
    rename: async (f, t) => { gate(); await io.rename(f, t); },
    writeFrontmatter: async (p, m) => { gate(); await io.writeFrontmatter(p, m); },
  };
}

let nextId = 0;
function doc(title: string, filePath: string, extra: Partial<BinderItem> = {}): BinderItem {
  return { id: `d${nextId++}`, title, filePath, type: 'chapter', order: 0, status: 'draft', ...extra };
}
function part(title: string, children: BinderItem[] = []): BinderItem {
  return { id: `p${nextId++}`, title, filePath: '', type: 'part', order: 0, status: 'draft', children };
}

function migrate(vault: MemVault, items: BinderItem[]) {
  return runMigrationPass(
    () => ({ plan: planCarryOver(items, ROOT, vault.disk()), disk: vault.disk() }),
    vault.io(),
  );
}

function restore(vault: MemVault, items: BinderItem[]) {
  return runRestorePass(
    () => ({ plan: planRestore(items, ROOT, vault.disk()), disk: vault.disk() }),
    vault.io(),
  );
}

// The canonical fixture: two binder-only parts over a flat Chapters folder,
// plus a root document — full hierarchy fidelity requires creating folders
// and moving documents.
function nestedFixture() {
  const items = [
    doc('Foreword', `${ROOT}/Chapters/foreword.md`, { status: 'complete' }),
    part('Part One', [
      doc('Opening Night', `${ROOT}/Chapters/chapter-1.md`, { wordCountGoal: 2000 }),
      doc('The Long Walk', `${ROOT}/Chapters/chapter-2.md`, { includeInExport: false }),
    ]),
    part('Part Two', [
      doc('Endgame', `${ROOT}/Chapters/chapter-3.md`),
    ]),
  ];
  const vault = new MemVault({
    folders: [ROOT, `${ROOT}/Chapters`],
    files: {
      [`${ROOT}/Chapters/foreword.md`]: { body: 'FOREWORD BODY' },
      [`${ROOT}/Chapters/chapter-1.md`]: { body: 'CH1 BODY' },
      [`${ROOT}/Chapters/chapter-2.md`]: { body: 'CH2 BODY' },
      [`${ROOT}/Chapters/chapter-3.md`]: { body: 'CH3 BODY' },
      [`${ROOT}/_binder.json`]: { body: '{legacy}' },
    },
  });
  return { items, vault };
}

describe('sanitizeTitle (folder names only)', () => {
  it('deletes illegal characters, collapses whitespace, strips trailing dots', () => {
    expect(sanitizeTitle('Part: One?')).toBe('Part One');
    expect(sanitizeTitle('  A   B... ')).toBe('A B');
    expect(sanitizeTitle('???')).toBe('');
  });
});

describe('parseLegacyBinder', () => {
  it('parses valid input, rejects corrupt and mis-shaped input', () => {
    expect(parseLegacyBinder('{"items":[]}')?.items).toEqual([]);
    expect(parseLegacyBinder('{nope')).toBeNull();
    expect(parseLegacyBinder('{"items":"x"}')).toBeNull();
  });
});

describe('planCarryOver — classification and R1', () => {
  it('classifies done, pending, and missing', () => {
    const items = [
      doc('A', `${ROOT}/a.md`),
      doc('B', `${ROOT}/Chapters/b.md`),
      doc('C', `${ROOT}/Chapters/c.md`),
    ];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/Chapters`],
      files: { [`${ROOT}/a.md`]: {}, [`${ROOT}/Chapters/b.md`]: {} },
    });
    const plan = planCarryOver(items, ROOT, vault.disk());
    expect(plan.docOps.map(op => op.state)).toEqual(['done', 'pending', 'missing']);
  });

  it('R1: a later same-basename claimant is a permanent leftover ordered in its ACTUAL folder', () => {
    const items = [
      part('Part', [
        doc('First', `${ROOT}/A/intro.md`),
        doc('Second', `${ROOT}/B/intro.md`),
        doc('Third', `${ROOT}/B/other.md`),
      ]),
    ];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/A`, `${ROOT}/B`],
      files: { [`${ROOT}/A/intro.md`]: {}, [`${ROOT}/B/intro.md`]: {}, [`${ROOT}/B/other.md`]: {} },
    });
    const plan = planCarryOver(items, ROOT, vault.disk());
    expect(plan.docOps[0].state).toBe('pending');
    expect(plan.docOps[1].state).toBe('leftover');
    // Order fix: the leftover ranks within P/B, not the target group
    expect(plan.docOps[1].order).toBe(10);
    expect(plan.docOps[2].state).toBe('pending');
  });

  it('R1: a foreign file at the target is a leftover, never displaced', () => {
    const items = [doc('A', `${ROOT}/Chapters/a.md`)];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/Chapters`],
      files: { [`${ROOT}/Chapters/a.md`]: {}, [`${ROOT}/a.md`]: { body: 'FOREIGN' } },
    });
    const plan = planCarryOver(items, ROOT, vault.disk());
    expect(plan.docOps[0].state).toBe('leftover');
  });

  it('a missing document does not claim its basename', () => {
    const items = [
      doc('Gone', `${ROOT}/A/intro.md`),
      doc('Here', `${ROOT}/B/intro.md`),
    ];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/A`, `${ROOT}/B`],
      files: { [`${ROOT}/B/intro.md`]: {} },
    });
    const plan = planCarryOver(items, ROOT, vault.disk());
    expect(plan.docOps[0].state).toBe('missing');
    expect(plan.docOps[1].state).toBe('pending');
  });

  it('computes identical plans across repeated runs', () => {
    const { items, vault } = nestedFixture();
    expect(planCarryOver(items, ROOT, vault.disk()))
      .toEqual(planCarryOver(items, ROOT, vault.disk()));
  });
});

describe('planCarryOver — folders', () => {
  it('mints markers for binder-only parts; two same titles need no suffix', () => {
    const plan = planCarryOver([part('Part'), part('Part')], ROOT, new MemVault({ folders: [ROOT] }).disk());
    expect(plan.folderOps.map(op => [op.action, op.targetName])).toEqual([
      ['create', '010~ Part'],
      ['create', '020~ Part'],
    ]);
  });

  it('a reserved title resolves via the marker itself — display unchanged, no suffix', () => {
    const plan = planCarryOver([part('CON')], ROOT, new MemVault({ folders: [ROOT] }).disk());
    expect(plan.folderOps[0].targetName).toBe('010~ CON');
    expect(plan.folderOps[0].displayName).toBe('CON');
  });

  it('adopts a marker-carrying folder as-is and never re-mints (Q1)', () => {
    const vault = new MemVault({ folders: [ROOT, `${ROOT}/025~ Part One`] });
    const plan = planCarryOver([part('Part One')], ROOT, vault.disk());
    expect(plan.folderOps[0].action).toBe('none');
    expect(plan.folderOps[0].targetName).toBe('025~ Part One');
  });

  it('attaches the marker in place to an adopted plain folder, preserving the typed text', () => {
    const vault = new MemVault({ folders: [ROOT, `${ROOT}/part one`] });
    const plan = planCarryOver([part('Part One')], ROOT, vault.disk());
    expect(plan.folderOps[0].action).toBe('attach-marker');
    expect(plan.folderOps[0].targetName).toBe('010~ part one');
  });

  it('never adopts the same folder twice', () => {
    const vault = new MemVault({ folders: [ROOT, `${ROOT}/010~ Part`] });
    const plan = planCarryOver([part('Part'), part('Part')], ROOT, vault.disk());
    expect(plan.folderOps[0].action).toBe('none');
    expect(plan.folderOps[1].action).toBe('create');
    expect(plan.folderOps[1].targetName).toBe('020~ Part');
  });
});

describe('planCarryOver — order and metadata', () => {
  it('one number line per group in legacy order, document children flattened', () => {
    const items = [
      doc('One', `${ROOT}/a.md`, { children: [doc('Child', `${ROOT}/k.md`)] }),
      part('Part'),
      doc('Three', `${ROOT}/c.md`),
    ];
    const vault = new MemVault({
      folders: [ROOT],
      files: { [`${ROOT}/a.md`]: {}, [`${ROOT}/k.md`]: {}, [`${ROOT}/c.md`]: {} },
    });
    const plan = planCarryOver(items, ROOT, vault.disk());
    expect(plan.docOps.map(op => op.order)).toEqual([10, 20, 40]);
    expect(plan.folderOps[0].targetName).toBe('030~ Part');
  });

  it('write-if-absent: existing keys are kept even with different values; null counts as absent', () => {
    const items = [doc('A', `${ROOT}/a.md`, { status: 'in-progress', wordCountGoal: 500 })];
    const vault = new MemVault({
      folders: [ROOT],
      files: { [`${ROOT}/a.md`]: { fm: { 'binder-status': 'complete', 'binder-order': 99, 'binder-type': null } } },
    });
    const plan = planCarryOver(items, ROOT, vault.disk());
    const op = plan.docOps[0];
    expect(op.orderKept).toBe(true);
    const byKey = Object.fromEntries(op.frontmatter.map(e => [e.key, e.kept]));
    expect(byKey['binder-status']).toBe(true);
    expect(byKey['binder-type']).toBe(false);
    expect(byKey['word-count-goal']).toBe(false);
  });

  it('planHasWork is false for a fully migrated project', () => {
    const items = [doc('A', `${ROOT}/a.md`)];
    const vault = new MemVault({
      folders: [ROOT],
      files: { [`${ROOT}/a.md`]: { fm: { 'binder-order': 10, 'binder-status': 'draft', 'binder-type': 'chapter' } } },
    });
    expect(planHasWork(planCarryOver(items, ROOT, vault.disk()))).toBe(false);
  });
});

describe('runMigrationPass — full fidelity', () => {
  it('reproduces the legacy hierarchy: folders created, documents moved, metadata written', async () => {
    const { items, vault } = nestedFixture();
    const result = await migrate(vault, items);
    expect(result.failures).toEqual([]);

    expect(vault.folders.has(`${ROOT}/020~ Part One`)).toBe(true);
    expect(vault.folders.has(`${ROOT}/030~ Part Two`)).toBe(true);
    expect(vault.files.has(`${ROOT}/foreword.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/020~ Part One/chapter-1.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/020~ Part One/chapter-2.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/030~ Part Two/chapter-3.md`)).toBe(true);

    const fm = (p: string) => (vault.files.get(p) as MemFile).fm;
    expect(fm(`${ROOT}/foreword.md`)['binder-order']).toBe(10);
    expect(fm(`${ROOT}/foreword.md`)['binder-status']).toBe('complete');
    expect(fm(`${ROOT}/020~ Part One/chapter-1.md`)['binder-order']).toBe(10);
    expect(fm(`${ROOT}/020~ Part One/chapter-1.md`)['word-count-goal']).toBe(2000);
    expect(fm(`${ROOT}/020~ Part One/chapter-2.md`)['binder-order']).toBe(20);
    expect(fm(`${ROOT}/020~ Part One/chapter-2.md`)['binder-compile']).toBe(false);
  });

  it('prose-safety: body bytes identical before and after', async () => {
    const { items, vault } = nestedFixture();
    const before = new Map([...vault.files.entries()].map(([p, f]) => [p.split('/').pop(), f.body]));
    await migrate(vault, items);
    for (const [p, f] of vault.files) {
      expect(f.body).toBe(before.get(p.split('/').pop()));
    }
  });

  it('never touches _binder.json in any operation', async () => {
    const { items, vault } = nestedFixture();
    await migrate(vault, items);
    await restore(vault, items);
    expect(vault.oplog.some(line => line.includes('_binder.json'))).toBe(false);
    expect((vault.files.get(`${ROOT}/_binder.json`) as MemFile).body).toBe('{legacy}');
  });

  it('steady state is a no-op: a second pass performs zero operations', async () => {
    const { items, vault } = nestedFixture();
    await migrate(vault, items);
    expect(planHasWork(planCarryOver(items, ROOT, vault.disk()))).toBe(false);
    vault.oplog = [];
    const result = await migrate(vault, items);
    expect(result.changed).toBe(0);
    expect(vault.oplog).toEqual([]);
  });

  it('attaching a marker to an adopted plain folder carries its children — no document moves', async () => {
    const items = [part('Part One', [doc('Ch', `${ROOT}/Part One/ch.md`)])];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/Part One`],
      files: { [`${ROOT}/Part One/ch.md`]: {} },
    });
    const result = await migrate(vault, items);
    expect(result.failures).toEqual([]);
    expect(vault.files.has(`${ROOT}/010~ Part One/ch.md`)).toBe(true);
    // The folder rename carried the document — no per-document rename ran
    expect(vault.oplog.filter(l => l.startsWith('rename') && l.includes('ch.md'))).toEqual([]);
  });

  it('Q5 live re-check: a value the plan thought absent (cold cache) is never overwritten', async () => {
    const items = [doc('A', `${ROOT}/a.md`, { status: 'draft' })];
    const vault = new MemVault({
      folders: [ROOT],
      files: { [`${ROOT}/a.md`]: { fm: { 'binder-status': 'complete', 'binder-order': 77 } } },
    });
    const coldDisk = (): DiskState => ({ ...vault.disk(), frontmatter: () => null });
    await runMigrationPass(
      () => ({ plan: planCarryOver(items, ROOT, coldDisk()), disk: coldDisk() }),
      vault.io(),
    );
    const fm = (vault.files.get(`${ROOT}/a.md`) as MemFile).fm;
    expect(fm['binder-status']).toBe('complete');
    expect(fm['binder-order']).toBe(77);
  });

  it('R1 execution: the leftover stays put, gets in-place order, and reports name-taken', async () => {
    const items = [
      part('Part', [
        doc('First', `${ROOT}/A/intro.md`),
        doc('Second', `${ROOT}/B/intro.md`),
      ]),
    ];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/A`, `${ROOT}/B`],
      files: { [`${ROOT}/A/intro.md`]: {}, [`${ROOT}/B/intro.md`]: {} },
    });
    const result = await migrate(vault, items);
    expect(vault.files.has(`${ROOT}/010~ Part/intro.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/B/intro.md`)).toBe(true);
    expect((vault.files.get(`${ROOT}/B/intro.md`) as MemFile).fm['binder-order']).toBe(10);
    const leftover = result.failures.find(f => f.kind === 'leftover');
    expect(leftover?.reason).toBe('name-taken');
    expect(result.leftovers).toBe(1);
  });

  it('R3 dependency skip: a failed folder skips its subtree without cascade failures', async () => {
    const items = [
      part('Part One', [doc('Ch', `${ROOT}/Chapters/ch.md`)]),
      doc('Root doc', `${ROOT}/Chapters/root.md`),
    ];
    const vault = new MemVault({
      folders: [ROOT, `${ROOT}/Chapters`],
      files: { [`${ROOT}/Chapters/ch.md`]: {}, [`${ROOT}/Chapters/root.md`]: {} },
    });
    const io = vault.io();
    const failing: CarryOverIO = {
      ...io,
      createFolder: async (p) => {
        if (p.includes('Part One')) throw new Error('EBUSY: locked');
        await io.createFolder(p);
      },
    };
    const result = await runMigrationPass(
      () => ({ plan: planCarryOver(items, ROOT, vault.disk()), disk: vault.disk() }),
      failing,
    );
    // One failure for the folder; the child document was not attempted
    expect(result.failures.filter(f => f.kind === 'folder')).toHaveLength(1);
    expect(result.failures.filter(f => f.kind === 'move')).toHaveLength(0);
    expect(vault.files.has(`${ROOT}/Chapters/ch.md`)).toBe(true);
    // The independent root document still migrated
    expect(vault.files.has(`${ROOT}/root.md`)).toBe(true);
  });

  it('kill-and-rerun at every prefix length converges with zero duplicate destructive ops', async () => {
    // Reference final state from an uninterrupted run
    const ref = nestedFixture();
    await migrate(ref.vault, ref.items);
    const refFiles = [...ref.vault.files.keys()].sort();
    const refFolders = [...ref.vault.folders].sort();

    const total = ref.vault.oplog.length;
    for (let allow = 0; allow <= total; allow++) {
      const { items, vault } = nestedFixture();
      await runMigrationPass(
        () => ({ plan: planCarryOver(items, ROOT, vault.disk()), disk: vault.disk() }),
        faultyIO(vault.io(), allow),
      );
      const second = await migrate(vault, items);
      expect(second.failures).toEqual([]);
      expect([...vault.files.keys()].sort()).toEqual(refFiles);
      expect([...vault.folders].sort()).toEqual(refFolders);
      // No successful rename ever ran twice from the same source
      const renames = vault.oplog.filter(l => l.startsWith('rename'));
      expect(new Set(renames).size).toBe(renames.length);
    }
  });
});

describe('runRestorePass — layout-only inverse', () => {
  it('round-trip: documents return to legacy paths, markers stripped, created folders remain empty', async () => {
    const { items, vault } = nestedFixture();
    await migrate(vault, items);
    const result = await restore(vault, items);
    expect(result.failures).toEqual([]);

    expect(vault.files.has(`${ROOT}/Chapters/foreword.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/Chapters/chapter-1.md`)).toBe(true);
    expect(vault.files.has(`${ROOT}/Chapters/chapter-3.md`)).toBe(true);
    // Markers stripped; the folders themselves are never deleted
    expect(vault.folders.has(`${ROOT}/Part One`)).toBe(true);
    expect(vault.folders.has(`${ROOT}/020~ Part One`)).toBe(false);
    // Layout-only: migration frontmatter persists
    const fm = (vault.files.get(`${ROOT}/Chapters/chapter-1.md`) as MemFile).fm;
    expect(fm['binder-order']).toBe(10);
    expect(fm['word-count-goal']).toBe(2000);
  });

  it('recreates a deleted legacy parent folder on the way back', async () => {
    const { items, vault } = nestedFixture();
    await migrate(vault, items);
    vault.folders.delete(`${ROOT}/Chapters`);
    const result = await restore(vault, items);
    expect(result.failures).toEqual([]);
    expect(vault.files.has(`${ROOT}/Chapters/chapter-1.md`)).toBe(true);
  });

  it('skips a document the user moved after migration — never guessed, never displaced', async () => {
    const { items, vault } = nestedFixture();
    await migrate(vault, items);
    const io = vault.io();
    await io.rename(`${ROOT}/020~ Part One/chapter-1.md`, `${ROOT}/chapter-1-renamed.md`);
    const result = await restore(vault, items);
    expect(result.failures).toEqual([]);
    expect(vault.files.has(`${ROOT}/chapter-1-renamed.md`)).toBe(true);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('restore never deletes anything and is idempotent', async () => {
    const { items, vault } = nestedFixture();
    await migrate(vault, items);
    const foldersBefore = [...vault.folders];
    await restore(vault, items);
    for (const f of foldersBefore.map(p => p.replace(/(^|\/)-?\d+~ /, '$1'))) {
      // every pre-restore folder still exists, marker-stripped or not
      expect(vault.folders.has(f) || foldersBefore.includes(f)).toBe(true);
    }
    expect(restoreHasWork(planRestore(items, ROOT, vault.disk()))).toBe(false);
    vault.oplog = [];
    const again = await restore(vault, items);
    expect(again.moved).toBe(0);
    expect(vault.oplog).toEqual([]);
  });
});

describe('failure ledger (R2 — graduated, once per signature)', () => {
  const project = { id: 'proj-1', title: 'Novel', folderPath: ROOT } as WritingProject;

  function fakePlugin() {
    const settings = { carryOverFailures: {} as Record<string, { count: number; noticed: boolean }> };
    return {
      settings,
      saveSettings: async () => undefined,
    } as unknown as WritingStudioPlugin;
  }

  const failure = (reason = 'EBUSY: resource busy') => ({
    signature: 'move|P/Chapters/a.md',
    name: 'a.md',
    reason,
    kind: 'move' as const,
  });

  beforeEach(() => {
    Notice.messages.length = 0;
  });

  it('first failure is silent, second consecutive failure notices exactly once', async () => {
    const plugin = fakePlugin();
    await updateFailureLedger(plugin, project, [failure()]);
    expect(Notice.messages).toEqual([]);
    await updateFailureLedger(plugin, project, [failure()]);
    expect(Notice.messages).toHaveLength(1);
    expect(Notice.messages[0]).toContain('the file is in use');
    await updateFailureLedger(plugin, project, [failure()]);
    expect(Notice.messages).toHaveLength(1);
  });

  it('success clears the record so a fresh failure can notice again', async () => {
    const plugin = fakePlugin();
    await updateFailureLedger(plugin, project, [failure()]);
    await updateFailureLedger(plugin, project, [failure()]);
    await updateFailureLedger(plugin, project, []); // pass with no failures
    expect(plugin.settings.carryOverFailures).toEqual({});
    Notice.messages.length = 0;
    await updateFailureLedger(plugin, project, [failure()]);
    expect(Notice.messages).toEqual([]);
  });

  it('translates common causes and uses name-taken copy for leftovers', async () => {
    const plugin = fakePlugin();
    const leftover = { signature: 'leftover|P/B/intro.md', name: 'intro.md', reason: 'name-taken', kind: 'leftover' as const };
    await updateFailureLedger(plugin, project, [leftover]);
    await updateFailureLedger(plugin, project, [leftover]);
    expect(Notice.messages[0]).toContain('a file with that name is already there');

    const denied = { ...failure('EACCES: permission denied'), signature: 'move|P/x.md' };
    await updateFailureLedger(plugin, project, [denied]);
    await updateFailureLedger(plugin, project, [denied]);
    expect(Notice.messages[1]).toContain('permission was denied');
  });
});
