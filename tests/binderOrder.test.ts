import {
  parseFolderPrefix,
  parseBinderOrder,
  effectiveOrder,
  entryDisplayName,
  isHiddenName,
  naturalCompare,
  sortSiblings,
  canCarryOrder,
  folderNameWithPrefix,
  planReorder,
  ReorderWrite,
  SiblingEntry,
} from '../src/binderOrder';

const doc = (name: string, binderOrder: number | null = null): SiblingEntry => ({
  name,
  isFolder: false,
  extension: name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : undefined,
  binderOrder,
});

const folder = (name: string): SiblingEntry => ({
  name,
  isFolder: true,
  binderOrder: null,
});

const names = (entries: SiblingEntry[]) => sortSiblings(entries).map(e => e.name);

describe('parseFolderPrefix', () => {
  it('parses a numeric prefix and strips it from the display name', () => {
    expect(parseFolderPrefix('020 Part One')).toEqual({ order: 20, displayName: 'Part One' });
  });

  it('parses without leading zeros', () => {
    expect(parseFolderPrefix('5 Interlude')).toEqual({ order: 5, displayName: 'Interlude' });
  });

  it('treats a purely numeric name as a name, not a prefix', () => {
    expect(parseFolderPrefix('2026')).toEqual({ order: null, displayName: '2026' });
  });

  it('treats digits with no following text as no prefix', () => {
    expect(parseFolderPrefix('020 ')).toEqual({ order: null, displayName: '020 ' });
  });

  it('leaves names starting with words untouched', () => {
    expect(parseFolderPrefix('Part One')).toEqual({ order: null, displayName: 'Part One' });
  });

  it('does not treat digits inside the name as a prefix', () => {
    expect(parseFolderPrefix('Book 2 Notes')).toEqual({ order: null, displayName: 'Book 2 Notes' });
  });
});

describe('parseBinderOrder', () => {
  it('accepts finite numbers', () => {
    expect(parseBinderOrder(15)).toBe(15);
    expect(parseBinderOrder(0)).toBe(0);
    expect(parseBinderOrder(-3)).toBe(-3);
  });

  it('rejects anything that is not a finite number', () => {
    expect(parseBinderOrder('15')).toBeNull();
    expect(parseBinderOrder(undefined)).toBeNull();
    expect(parseBinderOrder(null)).toBeNull();
    expect(parseBinderOrder(NaN)).toBeNull();
    expect(parseBinderOrder(Infinity)).toBeNull();
    expect(parseBinderOrder([10])).toBeNull();
    expect(parseBinderOrder(true)).toBeNull();
  });
});

describe('effectiveOrder', () => {
  it('reads a folder order from its name prefix', () => {
    expect(effectiveOrder(folder('020 Part One'))).toBe(20);
    expect(effectiveOrder(folder('Part One'))).toBeNull();
  });

  it('reads a document order from binder-order', () => {
    expect(effectiveOrder(doc('Chapter.md', 15))).toBe(15);
    expect(effectiveOrder(doc('Chapter.md'))).toBeNull();
  });
});

describe('entryDisplayName', () => {
  it('strips the prefix from folders', () => {
    expect(entryDisplayName(folder('020 Part One'))).toBe('Part One');
  });

  it('strips .md from markdown files', () => {
    expect(entryDisplayName(doc('Chapter One.md'))).toBe('Chapter One');
  });

  it('keeps the full name of non-markdown files', () => {
    expect(entryDisplayName(doc('map.png'))).toBe('map.png');
  });
});

describe('isHiddenName', () => {
  it('hides plugin plumbing and dotfiles', () => {
    expect(isHiddenName('_project.json')).toBe(true);
    expect(isHiddenName('_binder.json')).toBe(true);
    expect(isHiddenName('.DS_Store')).toBe(true);
  });

  it('keeps ordinary names visible', () => {
    expect(isHiddenName('Chapter One.md')).toBe(false);
    expect(isHiddenName('map_of_realm.png')).toBe(false);
  });
});

describe('naturalCompare', () => {
  it('is numeric-aware', () => {
    expect(naturalCompare('Chapter 2', 'Chapter 10')).toBeLessThan(0);
  });

  it('is case-insensitive', () => {
    expect(naturalCompare('chapter one', 'Chapter One')).toBe(0);
  });
});

describe('sortSiblings', () => {
  it('interleaves documents and folders on one number line', () => {
    expect(names([
      folder('020 Part One'),
      doc('Prologue.md', 15),
      doc('Foreword.md', 5),
    ])).toEqual(['Foreword.md', 'Prologue.md', '020 Part One']);
  });

  it('places unordered items at end-of-group after every ordered sibling', () => {
    expect(names([
      doc('Zeta.md'),
      doc('Late.md', 900),
      doc('Alpha.md'),
      doc('Early.md', 10),
    ])).toEqual(['Early.md', 'Late.md', 'Alpha.md', 'Zeta.md']);
  });

  it('natural-sorts unordered items — an untouched folder is pure natural sort', () => {
    expect(names([
      doc('Chapter 10.md'),
      doc('Chapter 2.md'),
      doc('Chapter 1.md'),
    ])).toEqual(['Chapter 1.md', 'Chapter 2.md', 'Chapter 10.md']);
  });

  it('resolves duplicate order values by natural display-name compare', () => {
    expect(names([
      doc('Scene B.md', 10),
      doc('Scene A.md', 10),
    ])).toEqual(['Scene A.md', 'Scene B.md']);
  });

  it('resolves a full tie with documents before folders', () => {
    expect(names([
      folder('010 Alpha'),
      doc('Alpha.md', 10),
    ])).toEqual(['Alpha.md', '010 Alpha']);
  });

  it('resolves an unordered display-name tie with documents before folders', () => {
    expect(names([
      folder('Alpha'),
      doc('Alpha.md'),
    ])).toEqual(['Alpha.md', 'Alpha']);
  });

  it('sorts prefix-less folders as unordered, after ordered siblings', () => {
    expect(names([
      folder('Appendices'),
      folder('020 Part Two'),
      folder('010 Part One'),
    ])).toEqual(['010 Part One', '020 Part Two', 'Appendices']);
  });

  it('sorts external copies adjacent to their original (duplicate values are benign)', () => {
    expect(names([
      doc('Chapter One copy.md', 10),
      doc('Chapter Two.md', 20),
      doc('Chapter One.md', 10),
    ])).toEqual(['Chapter One.md', 'Chapter One copy.md', 'Chapter Two.md']);
  });

  it('treats non-markdown files as permanently unordered', () => {
    expect(names([
      doc('map.png'),
      doc('Chapter.md', 10),
      doc('Aardvark notes.md'),
    ])).toEqual(['Chapter.md', 'Aardvark notes.md', 'map.png']);
  });

  it('compares folders by stripped display name, not on-disk name', () => {
    // On-disk '030 Alpha' vs unprefixed 'Beta': prefix wins order; between
    // two unordered folders the stripped name is what compares.
    expect(names([
      folder('Zeta'),
      folder('Beta'),
    ])).toEqual(['Beta', 'Zeta']);
  });

  it('does not mutate its input', () => {
    const input = [doc('B.md'), doc('A.md')];
    const before = [...input];
    sortSiblings(input);
    expect(input).toEqual(before);
  });
});

describe('canCarryOrder', () => {
  it('allows folders and markdown, rejects everything else', () => {
    expect(canCarryOrder(folder('Part One'))).toBe(true);
    expect(canCarryOrder(doc('Chapter.md'))).toBe(true);
    expect(canCarryOrder(doc('map.png'))).toBe(false);
  });
});

describe('folderNameWithPrefix', () => {
  it('prepends a three-digit prefix to a prefix-less name', () => {
    expect(folderNameWithPrefix('Part One', 20)).toBe('020 Part One');
  });

  it('replaces an existing prefix, keeping the display name', () => {
    expect(folderNameWithPrefix('030 Part One', 20)).toBe('020 Part One');
  });

  it('does not pad beyond three digits', () => {
    expect(folderNameWithPrefix('Appendix', 1010)).toBe('1010 Appendix');
  });
});

describe('planReorder', () => {
  // Applies planned writes, then verifies sortSiblings reproduces the
  // dropped sequence — the reload/external-move integration criterion:
  // order is derived from persisted values alone.
  const applyAndSort = (sequence: SiblingEntry[], writes: ReorderWrite[]): SiblingEntry[] => {
    const applied = sequence.map(e => ({ ...e }));
    for (const w of writes) {
      const entry = applied[w.index];
      if (entry.isFolder) entry.name = folderNameWithPrefix(entry.name, w.order);
      else entry.binderOrder = w.order;
    }
    return sortSiblings(applied);
  };

  it('writes exactly one midpoint value when a gap exists', () => {
    const seq = [doc('A.md', 10), doc('C.md'), doc('B.md', 30)];
    const writes = planReorder(seq, 1);
    expect(writes).toEqual([{ index: 1, order: 20 }]);
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['A.md', 'C.md', 'B.md']);
  });

  it('writes next − 10 at the start of the group, even below zero', () => {
    const seq = [doc('C.md'), doc('A.md', 5), doc('B.md', 15)];
    const writes = planReorder(seq, 0);
    expect(writes).toEqual([{ index: 0, order: -5 }]);
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['C.md', 'A.md', 'B.md']);
  });

  it('writes prev + 10 at the end of the group', () => {
    const seq = [doc('A.md', 10), doc('B.md', 20), doc('C.md', 12)];
    const writes = planReorder(seq, 2);
    expect(writes).toEqual([{ index: 2, order: 30 }]);
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['A.md', 'B.md', 'C.md']);
  });

  it('writes prev + 10 when dropped before the unordered tail', () => {
    const seq = [doc('A.md', 10), doc('C.md'), doc('Beta.md', null), doc('map.png')];
    const writes = planReorder(seq, 1);
    expect(writes).toEqual([{ index: 1, order: 20 }]);
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['A.md', 'C.md', 'Beta.md', 'map.png']);
  });

  it('renumbers only the group when the gap is exhausted, skipping values already in place', () => {
    const seq = [doc('A.md', 10), doc('C.md'), doc('B.md', 11)];
    const writes = planReorder(seq, 1);
    // A already sits at its 10 target — renumbering writes only C and B
    expect(writes).toEqual([
      { index: 1, order: 20 },
      { index: 2, order: 30 },
    ]);
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['A.md', 'C.md', 'B.md']);
  });

  it('renumbers on duplicate neighbor values', () => {
    const seq = [doc('A.md', 10), doc('C.md'), doc('B.md', 10)];
    const writes = planReorder(seq, 1);
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['A.md', 'C.md', 'B.md']);
  });

  it('materializes a never-ordered group as 10/20/30 on first reorder', () => {
    const seq = [doc('B.md'), doc('A.md'), folder('Part One')];
    const writes = planReorder(seq, 1);
    expect(writes).toEqual([
      { index: 0, order: 10 },
      { index: 1, order: 20 },
      { index: 2, order: 30 },
    ]);
    const sorted = applyAndSort(seq, writes);
    expect(sorted.map(e => entryDisplayName(e))).toEqual(['B', 'A', 'Part One']);
    expect(sorted[2].name).toBe('030 Part One');
  });

  it('never writes to non-markdown files during materialization', () => {
    const seq = [doc('B.md'), doc('map.png'), doc('A.md')];
    const writes = planReorder(seq, 2);
    expect(writes).toEqual([
      { index: 0, order: 10 },
      { index: 2, order: 20 },
    ]);
    // The non-md file stays permanently unordered — it sorts to the tail
    expect(applyAndSort(seq, writes).map(e => e.name)).toEqual(['B.md', 'A.md', 'map.png']);
  });

  it('renumbers across mixed docs and folders, skipping values already in place', () => {
    // B dropped between C(20) and the folder at 21 — gap exhausted
    const moved = [doc('A.md', 10), doc('C.md', 20), doc('B.md', 31), folder('021 Part')];
    const writes = planReorder(moved, 2);
    // Targets 10/20/30/40: A and C already sit at theirs
    expect(writes).toEqual([
      { index: 2, order: 30 },
      { index: 3, order: 40 },
    ]);
    const sorted = applyAndSort(moved, writes);
    expect(sorted.map(e => entryDisplayName(e))).toEqual(['A', 'C', 'B', 'Part']);
    expect(sorted[3].name).toBe('040 Part');
  });

  it('places a document between ordered siblings via midpoint even next to a folder', () => {
    const moved = [doc('A.md', 10), doc('C.md', 20), doc('B.md', 31), folder('030 Part')];
    expect(planReorder(moved, 2)).toEqual([{ index: 2, order: 25 }]);
  });

  it('assigns 10 to a lone item', () => {
    expect(planReorder([doc('Only.md')], 0)).toEqual([{ index: 0, order: 10 }]);
  });

  it('returns no writes when the moved item cannot carry order', () => {
    expect(planReorder([doc('A.md', 10), doc('map.png')], 1)).toEqual([]);
  });

  it('returns no writes when the position already holds', () => {
    const seq = [doc('A.md', 10), doc('B.md', 20), doc('C.md', 30)];
    expect(planReorder(seq, 1)).toEqual([]);
  });
});
