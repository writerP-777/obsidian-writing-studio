import { ManuscriptNode } from '../src/manuscriptTree';
import {
  buildOutlineRows, visibleRows, filterRowsByStatus, outlineTotals, outlineToMarkdown, progressPercent,
} from '../src/outlineModel';
import { normalizeSynopsis, parseSynopsis, parseWordCountGoal } from '../src/binderMenu';
import type { DocumentStatus } from '../models/BinderItem';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const doc = (
  title: string,
  opts: { synopsis?: string | null; status?: DocumentStatus | null; goal?: number | null; excluded?: boolean } = {},
): ManuscriptNode => ({
  kind: 'doc',
  path: `Book/${title}.md`,
  title,
  compileExcluded: opts.excluded ?? false,
  synopsis: opts.synopsis ?? null,
  status: opts.status ?? null,
  goal: opts.goal ?? null,
});

const folder = (title: string, children: ManuscriptNode[]): ManuscriptNode =>
  ({ kind: 'folder', path: `Book/${title}`, title, children });

// A two-part nonfiction book: one part drafted, one not yet started.
const tree: ManuscriptNode[] = [
  folder('Part One', [
    doc('Introduction', { synopsis: 'Sets up the central question.', status: 'in-progress', goal: 2000 }),
    doc('Chapter 1', { synopsis: 'Argues the status quo is not neutral.', status: 'complete', goal: 3000 }),
    doc('Chapter 2', { status: 'draft', goal: 3000 }),
  ]),
  folder('Part Two', [
    doc('Chapter 3', { status: 'draft' }),
  ]),
  doc('Afterword', { excluded: true }),
];

const words: Record<string, number> = {
  'Book/Introduction.md': 1840,
  'Book/Chapter 1.md': 3210,
  'Book/Chapter 2.md': 1070,
  'Book/Chapter 3.md': 0,
  'Book/Afterword.md': 400,
};
const wordsFor = (path: string): number => words[path] ?? 0;

// ─── Parsers ─────────────────────────────────────────────────────────────────

describe('synopsis parsing', () => {
  it('normalizes a typed synopsis to one paragraph', () => {
    expect(normalizeSynopsis('  Sets up\nthe   question.\r\n ')).toBe('Sets up the question.');
  });

  it('reads a non-empty string and nothing else', () => {
    expect(parseSynopsis('A claim.')).toBe('A claim.');
    expect(parseSynopsis('   ')).toBeNull();
    expect(parseSynopsis('')).toBeNull();
    expect(parseSynopsis(undefined)).toBeNull();
    expect(parseSynopsis(null)).toBeNull();
    expect(parseSynopsis(42)).toBeNull();
    expect(parseSynopsis({ text: 'no' })).toBeNull();
  });

  it('keeps quotes, colons, and non-Latin text intact', () => {
    const text = 'Why "reform" fails: 制度は学ばない — and what to do.';
    expect(parseSynopsis(text)).toBe(text);
  });
});

describe('parseWordCountGoal', () => {
  it('accepts positive whole numbers, as numbers or numeric strings', () => {
    expect(parseWordCountGoal(3000)).toBe(3000);
    expect(parseWordCountGoal('2500')).toBe(2500);
    expect(parseWordCountGoal(1999.7)).toBe(1999);
  });

  it('treats zero, negatives, and junk as no goal', () => {
    expect(parseWordCountGoal(0)).toBeNull();
    expect(parseWordCountGoal(-5)).toBeNull();
    expect(parseWordCountGoal('lots')).toBeNull();
    expect(parseWordCountGoal(undefined)).toBeNull();
  });
});

// ─── buildOutlineRows ────────────────────────────────────────────────────────

describe('buildOutlineRows', () => {
  const rows = buildOutlineRows(tree, wordsFor);

  it('flattens depth-first in binder order with depths and parents', () => {
    expect(rows.map(r => `${r.depth}:${r.kind}:${r.title}`)).toEqual([
      '0:folder:Part One', '1:doc:Introduction', '1:doc:Chapter 1', '1:doc:Chapter 2',
      '0:folder:Part Two', '1:doc:Chapter 3',
      '0:doc:Afterword',
    ]);
    expect(rows[1].parentPath).toBe('Book/Part One');
    expect(rows[0].parentPath).toBeNull();
    expect(rows[6].parentPath).toBeNull();
  });

  it('carries each document\'s own synopsis, status, goal, words, and compile flag', () => {
    const intro = rows[1];
    expect(intro.synopsis).toBe('Sets up the central question.');
    expect(intro.status).toBe('in-progress');
    expect(intro.goal).toBe(2000);
    expect(intro.words).toBe(1840);
    expect(rows[6].compileExcluded).toBe(true);
  });

  it('sums folder words and goals over the subtree; a folder with no goals has none', () => {
    expect(rows[0].words).toBe(1840 + 3210 + 1070);
    expect(rows[0].goal).toBe(8000);
    expect(rows[4].words).toBe(0);
    expect(rows[4].goal).toBeNull();
    expect(rows[0].hasChildren).toBe(true);
  });

  it('nested folders roll up through every level', () => {
    const nested = [folder('Part', [folder('Section', [doc('Deep', { goal: 100 })])])];
    const r = buildOutlineRows(nested, () => 40);
    expect(r.map(x => [x.title, x.words, x.goal])).toEqual([
      ['Part', 40, 100], ['Section', 40, 100], ['Deep', 40, 100],
    ]);
  });
});

// ─── visibleRows ─────────────────────────────────────────────────────────────

describe('visibleRows', () => {
  const rows = buildOutlineRows(tree, wordsFor);

  it('hides everything under a collapsed folder but keeps the folder row', () => {
    const shown = visibleRows(rows, new Set(['Book/Part One']));
    expect(shown.map(r => r.title)).toEqual(['Part One', 'Part Two', 'Chapter 3', 'Afterword']);
  });

  it('hides nested descendants when an ancestor is collapsed', () => {
    const nested = [folder('Part', [folder('Section', [doc('Deep')])]), doc('Loose')];
    const r = buildOutlineRows(nested, () => 0);
    expect(visibleRows(r, new Set(['Book/Part'])).map(x => x.title)).toEqual(['Part', 'Loose']);
  });
});

// ─── filterRowsByStatus ──────────────────────────────────────────────────────

describe('filterRowsByStatus', () => {
  const rows = buildOutlineRows(tree, wordsFor);

  it('"all" returns every row untouched', () => {
    expect(filterRowsByStatus(rows, 'all')).toBe(rows);
  });

  it('keeps matching documents and the folders above them', () => {
    expect(filterRowsByStatus(rows, 'draft').map(r => r.title))
      .toEqual(['Part One', 'Chapter 2', 'Part Two', 'Chapter 3']);
    expect(filterRowsByStatus(rows, 'complete').map(r => r.title)).toEqual(['Part One', 'Chapter 1']);
  });

  it('drops folders with no matching descendant and documents without a status', () => {
    expect(filterRowsByStatus(rows, 'published')).toEqual([]);
  });
});

// ─── outlineTotals ───────────────────────────────────────────────────────────

describe('outlineTotals', () => {
  it('counts documents, words, goals, progress, and missing synopses', () => {
    const totals = outlineTotals(buildOutlineRows(tree, wordsFor));
    expect(totals.docCount).toBe(5);
    expect(totals.words).toBe(1840 + 3210 + 1070 + 0 + 400);
    expect(totals.goal).toBe(8000);
    expect(totals.pct).toBe(82);
    expect(totals.missingSynopsis).toBe(3);
  });

  it('reports no goal and no percent when nothing has a goal', () => {
    const totals = outlineTotals(buildOutlineRows([doc('A'), doc('B')], () => 10));
    expect(totals.goal).toBeNull();
    expect(totals.pct).toBeNull();
  });

  it('never counts folders as documents', () => {
    const totals = outlineTotals(buildOutlineRows([folder('Empty', [])], () => 0));
    expect(totals.docCount).toBe(0);
    expect(totals.missingSynopsis).toBe(0);
  });
});

describe('progressPercent', () => {
  it('rounds and caps at 100', () => {
    expect(progressPercent(1840, 2000)).toBe(92);
    expect(progressPercent(3210, 3000)).toBe(100);
    expect(progressPercent(0, 3000)).toBe(0);
    expect(progressPercent(10, 0)).toBe(0);
  });
});

// ─── outlineToMarkdown ───────────────────────────────────────────────────────

describe('outlineToMarkdown', () => {
  it('nests titles by folder and appends synopses where they exist', () => {
    expect(outlineToMarkdown(tree)).toBe([
      '- Part One',
      '  - Introduction — Sets up the central question.',
      '  - Chapter 1 — Argues the status quo is not neutral.',
      '  - Chapter 2',
      '- Part Two',
      '  - Chapter 3',
      '- Afterword',
    ].join('\n'));
  });

  it('is empty for an empty project', () => {
    expect(outlineToMarkdown([])).toBe('');
  });
});
