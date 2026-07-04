import {
  parseFolderPrefix,
  parseBinderOrder,
  effectiveOrder,
  entryDisplayName,
  naturalCompare,
  sortSiblings,
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
