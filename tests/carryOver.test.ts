// Carry-over plan engine and preview bridge (#230). The AC's locked
// guarantees: identical plans across repeated runs, deterministic collision
// suffixes by legacy order, pending/done/anomaly classification including
// mid-pass states, write-if-absent precedence (Q1), foreign-file-at-target
// anomalies (Q5), reserved Windows device names (Cowork addition 2), and a
// provably read-only pass — _binder.json is never written.

import { App, Notice, TFile, TFolder } from 'obsidian';
import { BinderItem } from '../models/BinderItem';
import {
  CarryOverPlan,
  DiskState,
  fmRowState,
  isReservedStem,
  parseLegacyBinder,
  planCarryOver,
  planHasWork,
  sanitizeTitle,
} from '../src/carryOver';
import { computeCarryOverPlan, openCarryOverPreview } from '../src/carryOverBridge';
import { WritingProject } from '../models/Project';
import type WritingStudioPlugin from '../main';

const ROOT = 'Projects/Novel';

function disk(state: {
  files?: string[];
  folders?: string[];
  fm?: Record<string, Record<string, unknown>>;
} = {}): DiskState {
  const files = new Set(state.files ?? []);
  const folders = new Set(state.folders ?? []);
  return {
    fileExists: p => files.has(p),
    folderExists: p => folders.has(p),
    subfolderNames: parent => [...folders]
      .filter(f => f.startsWith(parent + '/') && !f.slice(parent.length + 1).includes('/'))
      .map(f => f.slice(parent.length + 1)),
    frontmatter: p => state.fm?.[p] ?? null,
  };
}

let nextId = 0;
function doc(title: string, filePath: string, extra: Partial<BinderItem> = {}): BinderItem {
  return { id: `d${nextId++}`, title, filePath, type: 'chapter', order: 0, status: 'draft', ...extra };
}
function part(title: string, children: BinderItem[] = []): BinderItem {
  return { id: `p${nextId++}`, title, filePath: '', type: 'part', order: 0, status: 'draft', children };
}

describe('sanitizeTitle', () => {
  it('deletes each illegal character class', () => {
    expect(sanitizeTitle('a\\b/c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });
  it('collapses whitespace runs to one space', () => {
    expect(sanitizeTitle('The   Long\t Walk')).toBe('The Long Walk');
  });
  it('trims and strips trailing dots and spaces', () => {
    expect(sanitizeTitle('  Chapter One... ')).toBe('Chapter One');
  });
  it('returns empty when nothing legal remains', () => {
    expect(sanitizeTitle('???')).toBe('');
    expect(sanitizeTitle(' . . ')).toBe('');
  });
});

describe('isReservedStem', () => {
  it.each(['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9', 'lpt5'])(
    'reserves %s', (stem) => expect(isReservedStem(stem)).toBe(true));
  it.each(['CON1', 'COM0', 'COM10', 'LPT0', 'CONSOLE', 'Bond'])(
    'does not reserve %s', (stem) => expect(isReservedStem(stem)).toBe(false));
});

describe('parseLegacyBinder', () => {
  it('parses a valid binder', () => {
    const data = parseLegacyBinder(JSON.stringify({ version: '2.0', projectId: 'x', items: [] }));
    expect(data?.items).toEqual([]);
  });
  it('returns null for corrupt JSON and wrong shapes', () => {
    expect(parseLegacyBinder('{nope')).toBeNull();
    expect(parseLegacyBinder('{"items": "not-a-list"}')).toBeNull();
    expect(parseLegacyBinder('null')).toBeNull();
  });
});

describe('planCarryOver — classification', () => {
  it('classifies pending, done, and missing anomalies', () => {
    const items = [
      doc('Opening Night', `${ROOT}/Chapters/chapter-1.md`),
      doc('The Long Walk', `${ROOT}/Chapters/chapter-2.md`),
      doc('Ghost', `${ROOT}/Chapters/chapter-4.md`),
    ];
    const plan = planCarryOver(items, ROOT, disk({
      files: [`${ROOT}/Opening Night.md`, `${ROOT}/Chapters/chapter-2.md`],
    }));
    expect(plan.docOps.map(op => op.state)).toEqual(['done', 'pending', 'anomaly']);
    expect(plan.docOps[2].anomaly).toBe('missing');
    expect(plan.docOps[2].frontmatter).toEqual([]);
  });

  it('a file already at its final path with matching original is done', () => {
    const items = [doc('Opening Night', `${ROOT}/Opening Night.md`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/Opening Night.md`] }));
    expect(plan.docOps[0].state).toBe('done');
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/Opening Night.md`);
  });

  it('a foreign file at a pending target is an anomaly, never a suffix (Q5)', () => {
    const items = [doc('Opening Night', `${ROOT}/Chapters/chapter-1.md`)];
    const plan = planCarryOver(items, ROOT, disk({
      files: [`${ROOT}/Chapters/chapter-1.md`, `${ROOT}/Opening Night.md`],
    }));
    expect(plan.docOps[0].state).toBe('anomaly');
    expect(plan.docOps[0].anomaly).toBe('target-occupied');
    expect(plan.docOps[0].suffixed).toBe(false);
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/Opening Night.md`);
  });
});

describe('planCarryOver — determinism and collisions', () => {
  it('computes identical plans across repeated runs', () => {
    const items = [
      part('Part One', [doc('Duplicate', `${ROOT}/Chapters/a.md`)]),
      doc('Duplicate', `${ROOT}/Chapters/b.md`),
      doc('Duplicate', `${ROOT}/Chapters/c.md`),
    ];
    const state = disk({ files: [`${ROOT}/Chapters/a.md`, `${ROOT}/Chapters/b.md`] });
    expect(planCarryOver(items, ROOT, state)).toEqual(planCarryOver(items, ROOT, state));
  });

  it('suffixes plan-internal collisions by legacy order, case-insensitively', () => {
    const items = [
      doc('The Long Walk', `${ROOT}/Chapters/b.md`),
      doc('the long walk', `${ROOT}/Chapters/c.md`),
    ];
    const plan = planCarryOver(items, ROOT, disk({
      files: [`${ROOT}/Chapters/b.md`, `${ROOT}/Chapters/c.md`],
    }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/The Long Walk.md`);
    expect(plan.docOps[0].suffixed).toBe(false);
    expect(plan.docOps[1].finalPath).toBe(`${ROOT}/the long walk 2.md`);
    expect(plan.docOps[1].suffixed).toBe(true);
  });

  it('siblings in different folders do not collide', () => {
    const items = [
      part('Part One', [doc('Intro', `${ROOT}/a.md`)]),
      part('Part Two', [doc('Intro', `${ROOT}/b.md`)]),
    ];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/a.md`, `${ROOT}/b.md`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/010~ Part One/Intro.md`);
    expect(plan.docOps[1].finalPath).toBe(`${ROOT}/020~ Part Two/Intro.md`);
  });
});

describe('planCarryOver — reserved Windows device names', () => {
  it('routes a reserved document title through the suffix series', () => {
    const items = [doc('CON', `${ROOT}/Chapters/con-notes.md`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/Chapters/con-notes.md`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/CON 2.md`);
    expect(plan.docOps[0].reserved).toBe(true);
  });

  it('covers the extension case — CON.md is as illegal as CON', () => {
    const items = [doc('con', `${ROOT}/x.md`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/x.md`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/con 2.md`);
  });

  it('covers folders — a reserved part name is suffixed before minting', () => {
    const items = [part('NUL')];
    const plan = planCarryOver(items, ROOT, disk());
    expect(plan.folderOps[0].targetName).toBe('010~ NUL 2');
    expect(plan.folderOps[0].reserved).toBe(true);
  });

  it.each(['COM3', 'LPT9'])('covers the numbered class %s', (name) => {
    const items = [doc(name, `${ROOT}/x.md`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/x.md`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/${name} 2.md`);
  });

  it('leaves near-misses like CON1 alone', () => {
    const items = [doc('CON1', `${ROOT}/x.md`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/x.md`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/CON1.md`);
    expect(plan.docOps[0].reserved).toBe(false);
  });
});

describe('planCarryOver — titles and names', () => {
  it('an unusable title keeps the original basename', () => {
    const items = [doc('???', `${ROOT}/Chapters/chapter-7.md`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/Chapters/chapter-7.md`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/chapter-7.md`);
    expect(plan.docOps[0].titleUnusable).toBe(true);
  });

  it('preserves a non-md extension from the legacy path', () => {
    const items = [doc('Notes', `${ROOT}/notes.txt`)];
    const plan = planCarryOver(items, ROOT, disk({ files: [`${ROOT}/notes.txt`] }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/Notes.txt`);
  });
});

describe('planCarryOver — order minting (one number line per group)', () => {
  it('assigns 10/20/30 across documents and folders in legacy order', () => {
    const items = [
      doc('One', `${ROOT}/a.md`),
      part('Part', [doc('Nested', `${ROOT}/n.md`)]),
      doc('Three', `${ROOT}/c.md`),
    ];
    const plan = planCarryOver(items, ROOT, disk({
      files: [`${ROOT}/a.md`, `${ROOT}/c.md`, `${ROOT}/n.md`],
    }));
    const orderOf = (i: number) => plan.docOps[i].frontmatter.find(e => e.key === 'binder-order')?.value;
    expect(orderOf(0)).toBe(10);
    expect(plan.folderOps[0].targetName).toBe('020~ Part');
    expect(orderOf(1)).toBe(10); // nested doc starts its own group
    expect(orderOf(2)).toBe(30);
  });

  it("flattens a document's children into its own sibling group after it", () => {
    const items = [
      doc('Parent', `${ROOT}/p.md`, { children: [doc('Child', `${ROOT}/k.md`)] }),
      doc('Next', `${ROOT}/n.md`),
    ];
    const plan = planCarryOver(items, ROOT, disk({
      files: [`${ROOT}/p.md`, `${ROOT}/k.md`, `${ROOT}/n.md`],
    }));
    expect(plan.docOps.map(op => op.originalPath)).toEqual(
      [`${ROOT}/p.md`, `${ROOT}/k.md`, `${ROOT}/n.md`]);
    const orders = plan.docOps.map(op => op.frontmatter.find(e => e.key === 'binder-order')?.value);
    expect(orders).toEqual([10, 20, 30]);
  });
});

describe('planCarryOver — folder adoption (Q1 for folders)', () => {
  it('adopts an existing marked folder without re-minting its marker', () => {
    const items = [part('Part One')];
    const plan = planCarryOver(items, ROOT, disk({ folders: [`${ROOT}/025~ Part One`] }));
    expect(plan.folderOps[0].state).toBe('done');
    expect(plan.folderOps[0].targetName).toBe('025~ Part One');
  });

  it('adopts a plain folder whose name matches the display name', () => {
    const items = [part('Part One')];
    const plan = planCarryOver(items, ROOT, disk({ folders: [`${ROOT}/Part One`] }));
    expect(plan.folderOps[0].state).toBe('done');
    expect(plan.folderOps[0].targetName).toBe('Part One');
  });

  it('never adopts the same folder twice — the duplicate suffixes and mints', () => {
    const items = [part('Part'), part('Part')];
    const plan = planCarryOver(items, ROOT, disk({ folders: [`${ROOT}/010~ Part`] }));
    expect(plan.folderOps[0].state).toBe('done');
    expect(plan.folderOps[0].targetName).toBe('010~ Part');
    expect(plan.folderOps[1].state).toBe('pending');
    expect(plan.folderOps[1].targetName).toBe('020~ Part 2');
  });

  it('nests children of an adopted folder under its on-disk name', () => {
    const items = [part('Part One', [doc('Intro', `${ROOT}/i.md`)])];
    const plan = planCarryOver(items, ROOT, disk({
      folders: [`${ROOT}/025~ Part One`],
      files: [`${ROOT}/i.md`],
    }));
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/025~ Part One/Intro.md`);
  });
});

describe('planCarryOver — frontmatter precedence (Q1: write-if-absent)', () => {
  const items = () => [doc('One', `${ROOT}/a.md`, {
    status: 'in-progress',
    wordCountGoal: 2000,
    includeInExport: false,
  })];

  it('writes every key when none is set', () => {
    const plan = planCarryOver(items(), ROOT, disk({ files: [`${ROOT}/a.md`] }));
    const fm = plan.docOps[0].frontmatter;
    expect(fm.map(e => [e.key, e.value, e.kept])).toEqual([
      ['binder-order', 10, false],
      ['binder-status', 'in-progress', false],
      ['binder-type', 'chapter', false],
      ['word-count-goal', 2000, false],
      ['binder-compile', false, false],
    ]);
  });

  it('keeps every key the user already set — even with a different value', () => {
    const plan = planCarryOver(items(), ROOT, disk({
      files: [`${ROOT}/a.md`],
      fm: { [`${ROOT}/a.md`]: {
        'binder-order': 55, 'binder-status': 'complete', 'binder-type': 'note',
        'word-count-goal': 1, 'binder-compile': false,
      } },
    }));
    expect(plan.docOps[0].frontmatter.every(e => e.kept)).toBe(true);
    expect(fmRowState(plan.docOps[0])).toBe('done');
  });

  it('treats a null value as absent', () => {
    const plan = planCarryOver(items(), ROOT, disk({
      files: [`${ROOT}/a.md`],
      fm: { [`${ROOT}/a.md`]: { 'binder-status': null } },
    }));
    const status = plan.docOps[0].frontmatter.find(e => e.key === 'binder-status');
    expect(status?.kept).toBe(false);
  });

  it('reads the file where it currently is — pending at original, done at final', () => {
    const two = [
      doc('Pending', `${ROOT}/Chapters/p.md`),
      doc('Done', `${ROOT}/Chapters/d.md`),
    ];
    const plan = planCarryOver(two, ROOT, disk({
      files: [`${ROOT}/Chapters/p.md`, `${ROOT}/Done.md`],
      fm: {
        [`${ROOT}/Chapters/p.md`]: { 'binder-status': 'complete' },
        [`${ROOT}/Done.md`]: { 'binder-status': 'complete' },
      },
    }));
    expect(plan.docOps[0].frontmatter.find(e => e.key === 'binder-status')?.kept).toBe(true);
    expect(plan.docOps[1].frontmatter.find(e => e.key === 'binder-status')?.kept).toBe(true);
  });

  it('expresses inclusion by absence — includeInExport true or unset writes nothing', () => {
    const included = [doc('A', `${ROOT}/a.md`, { includeInExport: true }), doc('B', `${ROOT}/b.md`)];
    const plan = planCarryOver(included, ROOT, disk({ files: [`${ROOT}/a.md`, `${ROOT}/b.md`] }));
    for (const op of plan.docOps) {
      expect(op.frontmatter.find(e => e.key === 'binder-compile')).toBeUndefined();
    }
  });
});

describe('planCarryOver — counts and planHasWork', () => {
  it('reproduces the approved mock scenario: 9 operations, 2 done, 6 pending, 1 anomaly', () => {
    // Two folders (one existing), five documents (one done, three pending
    // incl. a suffix and a reserved name, one missing), two frontmatter rows
    // (the pending docs carry no metadata worth writing beyond order — so
    // the fm rows come from the done doc and the first pending doc).
    const items = [
      part('Part One', [
        doc('Opening Night', `${ROOT}/Chapters/chapter-1.md`, { status: 'in-progress' }),
        doc('The Long Walk', `${ROOT}/Chapters/chapter-2.md`, { wordCountGoal: 2000 }),
      ]),
      part('Part Two', [
        doc('The Long Walk', `${ROOT}/Chapters/chapter-3.md`),
        doc('CON', `${ROOT}/Chapters/con-notes.md`),
        doc('Ghost', `${ROOT}/Chapters/chapter-4.md`),
      ]),
    ];
    const state = disk({
      folders: [`${ROOT}/010~ Part One`],
      files: [
        `${ROOT}/010~ Part One/Opening Night.md`,
        `${ROOT}/Chapters/chapter-2.md`,
        `${ROOT}/Chapters/chapter-3.md`,
        `${ROOT}/Chapters/con-notes.md`,
      ],
      fm: { [`${ROOT}/010~ Part One/Opening Night.md`]: { 'binder-status': 'complete' } },
    });
    const plan = planCarryOver(items, ROOT, state);
    // Part Two group: The Long Walk claims first, CON suffixes, Ghost missing
    expect(plan.docOps[2].finalPath).toBe(`${ROOT}/020~ Part Two/The Long Walk.md`);
    expect(plan.docOps[3].finalPath).toBe(`${ROOT}/020~ Part Two/CON 2.md`);
    expect(plan.docOps[4].state).toBe('anomaly');
    // Every non-anomaly doc has a frontmatter row (binder-order at minimum),
    // so: 2 folders + 5 docs + 4 fm rows = 11 total
    expect(plan.counts).toEqual({ total: 11, done: 2, pending: 8, anomalies: 1 });
    expect(planHasWork(plan)).toBe(true);
  });

  it('a fully carried project has no work', () => {
    const items = [doc('One', `${ROOT}/One.md`)];
    const plan = planCarryOver(items, ROOT, disk({
      files: [`${ROOT}/One.md`],
      fm: { [`${ROOT}/One.md`]: { 'binder-order': 10, 'binder-status': 'draft', 'binder-type': 'chapter' } },
    }));
    expect(planHasWork(plan)).toBe(false);
    expect(plan.counts.pending).toBe(0);
  });

  it('an empty legacy binder plans nothing', () => {
    const plan = planCarryOver([], ROOT, disk());
    expect(plan.counts.total).toBe(0);
    expect(planHasWork(plan)).toBe(false);
  });
});

// ─── Bridge: read-only guarantee ────────────────────────────────────────────

function fakeApp(
  files: Record<string, string>,
  folders: string[] = [],
  fm: Record<string, Record<string, unknown>> = {},
): { app: App; writes: string[] } {
  const writes: string[] = [];
  const tfiles = new Map(Object.entries(files).map(([p]) => {
    const ext = p.includes('.') ? p.split('.').pop() ?? '' : '';
    return [p, new TFile(p, ext)];
  }));
  const tfolders = new Map(folders.map(p => [p, new TFolder(p)]));
  for (const [p, f] of tfolders) {
    const parent = p.split('/').slice(0, -1).join('/');
    tfolders.get(parent)?.children.push(f);
  }
  const recordWrite = (name: string) => () => {
    writes.push(name);
    throw new Error(`write attempted: ${name}`);
  };
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => tfiles.get(p) ?? tfolders.get(p) ?? null,
      cachedRead: (f: TFile) => Promise.resolve(files[f.path]),
      create: recordWrite('create'),
      createFolder: recordWrite('createFolder'),
      modify: recordWrite('modify'),
      delete: recordWrite('delete'),
      adapter: { write: recordWrite('adapter.write') },
    },
    metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: fm[f.path] }) },
  };
  return { app: app as unknown as App, writes };
}

const project = { id: 'proj-1', title: 'Novel', folderPath: ROOT } as WritingProject;

describe('carryOverBridge', () => {
  it('computes a plan from the live vault without writing anything', async () => {
    const legacy = JSON.stringify({
      version: '2.0', projectId: 'proj-1',
      items: [{ id: '1', title: 'One', filePath: `${ROOT}/Chapters/a.md`, type: 'chapter', order: 0, status: 'draft' }],
    });
    const { app, writes } = fakeApp(
      { [`${ROOT}/_binder.json`]: legacy, [`${ROOT}/Chapters/a.md`]: '' },
      [ROOT, `${ROOT}/Chapters`],
    );
    const result = await computeCarryOverPlan(app, project);
    expect(result.kind).toBe('plan');
    const plan = (result as { kind: 'plan'; plan: CarryOverPlan }).plan;
    expect(plan.docOps[0].state).toBe('pending');
    expect(plan.docOps[0].finalPath).toBe(`${ROOT}/One.md`);
    expect(writes).toEqual([]);
  });

  it('reports a missing legacy binder', async () => {
    const { app, writes } = fakeApp({}, [ROOT]);
    expect((await computeCarryOverPlan(app, project)).kind).toBe('missing');
    expect(writes).toEqual([]);
  });

  it('reports a corrupt legacy binder WITHOUT the runtime loader backup write', async () => {
    const { app, writes } = fakeApp({ [`${ROOT}/_binder.json`]: '{corrupt' }, [ROOT]);
    expect((await computeCarryOverPlan(app, project)).kind).toBe('corrupt');
    // loadBinder would have written _binder.json.bak here — the dry run must not
    expect(writes).toEqual([]);
  });

  it('openCarryOverPreview surfaces missing and corrupt states as notices', async () => {
    Notice.messages.length = 0;
    const missing = fakeApp({}, [ROOT]);
    await openCarryOverPreview({ app: missing.app } as unknown as WritingStudioPlugin, project);
    expect(Notice.messages).toContain('No legacy binder found for this project.');

    Notice.messages.length = 0;
    const corrupt = fakeApp({ [`${ROOT}/_binder.json`]: '{corrupt' }, [ROOT]);
    await openCarryOverPreview({ app: corrupt.app } as unknown as WritingStudioPlugin, project);
    expect(Notice.messages).toContain('The legacy binder file could not be read.');
    expect(corrupt.writes).toEqual([]);
  });
});
