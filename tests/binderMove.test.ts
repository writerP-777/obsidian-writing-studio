import {
  dropRegion,
  canStartDrag,
  evaluateDrop,
  planMove,
  DragSource,
  MoveEntry,
  BinderZone,
} from '../src/binderMove';

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const doc = (path: string, binderOrder: number | null = null): MoveEntry => {
  const name = basename(path);
  return {
    path,
    name,
    isFolder: false,
    extension: name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : undefined,
    binderOrder,
  };
};

const folder = (path: string): MoveEntry => ({
  path,
  name: basename(path),
  isFolder: true,
  binderOrder: null,
});

const src = (entry: MoveEntry, zone: BinderZone = 'manuscript'): DragSource => ({ ...entry, zone });

describe('dropRegion', () => {
  it('splits document rows in half — nesting under a document is never offered', () => {
    expect(dropRegion(false, 5, 40)).toBe('before');
    expect(dropRegion(false, 19, 40)).toBe('before');
    expect(dropRegion(false, 20, 40)).toBe('after');
    expect(dropRegion(false, 35, 40)).toBe('after');
  });

  it('gives folder rows a before / into / after split at 25% edges', () => {
    expect(dropRegion(true, 5, 40)).toBe('before');
    expect(dropRegion(true, 10, 40)).toBe('into');
    expect(dropRegion(true, 20, 40)).toBe('into');
    expect(dropRegion(true, 29, 40)).toBe('into');
    expect(dropRegion(true, 30, 40)).toBe('after');
    expect(dropRegion(true, 39, 40)).toBe('after');
  });
});

describe('canStartDrag', () => {
  it('allows markdown documents in the manuscript and in Research', () => {
    expect(canStartDrag(doc('P/Chapter.md'), 'manuscript')).toBe(true);
    expect(canStartDrag(doc('P/Research/Notes.md'), 'research')).toBe(true);
  });

  it('allows folders in the manuscript only — folders never cross zones', () => {
    expect(canStartDrag(folder('P/Part One'), 'manuscript')).toBe(true);
    expect(canStartDrag(folder('P/Research/Clips'), 'research')).toBe(false);
  });

  it('never lets a non-markdown file drag', () => {
    expect(canStartDrag(doc('P/map.png'), 'manuscript')).toBe(false);
    expect(canStartDrag(doc('P/Research/map.png'), 'research')).toBe(false);
  });

  it('lets nothing drag out of Exports (output-only)', () => {
    expect(canStartDrag(doc('P/Exports/Book.md'), 'exports')).toBe(false);
    expect(canStartDrag(folder('P/Exports/Old'), 'exports')).toBe(false);
  });
});

describe('evaluateDrop', () => {
  it('refuses every drop into Exports with the explanatory notice', () => {
    expect(evaluateDrop(src(doc('P/Chapter.md')), 'P/Exports', 'exports'))
      .toEqual({ kind: 'notice', messageKey: 'binder.fs.exportsDropBlocked' });
  });

  it('refuses a folder crossing zones with the explanatory notice', () => {
    expect(evaluateDrop(src(folder('P/Part One')), 'P/Research', 'research'))
      .toEqual({ kind: 'notice', messageKey: 'binder.fs.folderZoneBlocked' });
  });

  it('gives a folder dropped into itself no affordance', () => {
    expect(evaluateDrop(src(folder('P/Part One')), 'P/Part One', 'manuscript'))
      .toEqual({ kind: 'refuse' });
  });

  it('gives a folder dropped into its own descendant no affordance', () => {
    expect(evaluateDrop(src(folder('P/Part One')), 'P/Part One/Act Two', 'manuscript'))
      .toEqual({ kind: 'refuse' });
  });

  it('does not confuse a prefix-sharing sibling with a descendant', () => {
    expect(evaluateDrop(src(folder('P/Part One')), 'P/Part One-notes', 'manuscript'))
      .toEqual({ kind: 'accept' });
  });

  it('accepts markdown documents both ways between manuscript and Research', () => {
    expect(evaluateDrop(src(doc('P/Chapter.md'), 'manuscript'), 'P/Research', 'research'))
      .toEqual({ kind: 'accept' });
    expect(evaluateDrop(src(doc('P/Research/Notes.md'), 'research'), 'P', 'manuscript'))
      .toEqual({ kind: 'accept' });
  });

  it('accepts ordinary moves within the manuscript', () => {
    expect(evaluateDrop(src(folder('P/Part One')), 'P/Part Two', 'manuscript'))
      .toEqual({ kind: 'accept' });
  });
});

describe('planMove', () => {
  it('plans a same-parent reorder as order writes only — no rename (#227 parity)', () => {
    const ops = planMove(
      src(doc('P/C.md')), 'P',
      [doc('P/A.md', 10), doc('P/B.md', 30)],
      1, true,
    );
    expect(ops).toEqual([{ kind: 'set-order', path: 'P/C.md', order: 20 }]);
  });

  it('plans nothing when the position already holds', () => {
    const ops = planMove(
      src(doc('P/B.md', 20)), 'P',
      [doc('P/A.md', 10), doc('P/C.md', 30)],
      1, true,
    );
    expect(ops).toEqual([]);
  });

  it('moves a document cross-parent and writes its order at the new path', () => {
    const ops = planMove(
      src(doc('P/C.md')), 'P/010~ Part',
      [doc('P/010~ Part/A.md', 10), doc('P/010~ Part/B.md', 30)],
      1, true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/C.md', newPath: 'P/010~ Part/C.md' },
      { kind: 'set-order', path: 'P/010~ Part/C.md', order: 20 },
    ]);
  });

  it('places a drop-into at end-of-group with a single prev + 10 write', () => {
    const ops = planMove(
      src(doc('P/C.md')), 'P/010~ Part',
      [doc('P/010~ Part/A.md', 10)],
      'end', true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/C.md', newPath: 'P/010~ Part/C.md' },
      { kind: 'set-order', path: 'P/010~ Part/C.md', order: 20 },
    ]);
  });

  it('folds a folder move and its new marker into one atomic rename', () => {
    const ops = planMove(
      src(folder('P/005~ Part')), 'P/Book',
      [doc('P/Book/X.md', 10)],
      'end', true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/005~ Part', newPath: 'P/Book/020~ Part' },
    ]);
  });

  it('moves a folder without touching its name when its order already fits', () => {
    const ops = planMove(
      src(folder('P/020~ Part')), 'P/Book',
      [doc('P/Book/A.md', 10), doc('P/Book/B.md', 30)],
      1, true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/020~ Part', newPath: 'P/Book/020~ Part' },
    ]);
  });

  it('mints in front of a typed numeric folder name — typed text intact (#239 bug case)', () => {
    const ops = planMove(
      src(folder('P/2023 files')), 'P/Book',
      [doc('P/Book/X.md', 10)],
      'end', true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/2023 files', newPath: 'P/Book/020~ 2023 files' },
    ]);
  });

  it('never writes order on a Research drop — the bare rename only', () => {
    const ops = planMove(
      src(doc('P/Chapter.md', 50)), 'P/Research',
      [doc('P/Research/Zed.md'), doc('P/Research/Alpha.md')],
      'end', false,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/Chapter.md', newPath: 'P/Research/Chapter.md' },
    ]);
  });

  it('plans nothing when a zone drop lands where the file already lives', () => {
    const ops = planMove(
      src(doc('P/Research/Notes.md'), 'research'), 'P/Research',
      [doc('P/Research/Other.md')],
      'end', false,
    );
    expect(ops).toEqual([]);
  });

  it('materializes an unordered destination group, source ops first', () => {
    const ops = planMove(
      src(doc('P/C.md')), 'P/Book',
      [doc('P/Book/A.md'), doc('P/Book/Z.md')],
      'end', true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/C.md', newPath: 'P/Book/C.md' },
      { kind: 'set-order', path: 'P/Book/C.md', order: 30 },
      { kind: 'set-order', path: 'P/Book/A.md', order: 10 },
      { kind: 'set-order', path: 'P/Book/Z.md', order: 20 },
    ]);
  });

  it('renames a sibling folder in place during materialization', () => {
    const ops = planMove(
      src(doc('P/D.md')), 'P/Book',
      [doc('P/Book/A.md'), folder('P/Book/Part')],
      'end', true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/D.md', newPath: 'P/Book/D.md' },
      { kind: 'set-order', path: 'P/Book/D.md', order: 30 },
      { kind: 'set-order', path: 'P/Book/A.md', order: 10 },
      { kind: 'rename', path: 'P/Book/Part', newPath: 'P/Book/020~ Part' },
    ]);
  });

  it('never writes to a non-markdown sibling during materialization', () => {
    const ops = planMove(
      src(doc('P/D.md')), 'P/Book',
      [doc('P/Book/A.md'), doc('P/Book/map.png')],
      'end', true,
    );
    expect(ops.some(op => op.path.endsWith('map.png'))).toBe(false);
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/D.md', newPath: 'P/Book/D.md' },
      { kind: 'set-order', path: 'P/Book/D.md', order: 20 },
      { kind: 'set-order', path: 'P/Book/A.md', order: 10 },
    ]);
  });

  it('promotes a nested document to the project root', () => {
    const ops = planMove(
      src(doc('P/010~ Part/C.md')), 'P',
      [doc('P/A.md', 10)],
      'end', true,
    );
    expect(ops).toEqual([
      { kind: 'rename', path: 'P/010~ Part/C.md', newPath: 'P/C.md' },
      { kind: 'set-order', path: 'P/C.md', order: 20 },
    ]);
  });
});
