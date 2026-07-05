import {
  menuActionsFor,
  parseBinderStatus,
  parseBinderType,
  renamePrefill,
  renameTargetName,
  validateItemName,
} from '../src/binderMenu';
import { SiblingEntry } from '../src/binderOrder';

const doc = (name: string): SiblingEntry => ({ name, isFolder: false, extension: 'md', binderOrder: null });
const folder = (name: string): SiblingEntry => ({ name, isFolder: true, binderOrder: null });
const pdf = (name: string): SiblingEntry => ({ name, isFolder: false, extension: 'pdf', binderOrder: null });

describe('menuActionsFor — zone and kind rulings (#229)', () => {
  it('manuscript documents get the full mutation surface', () => {
    expect(menuActionsFor(doc('Ch 1.md'), 'manuscript')).toEqual(
      ['rename', 'status', 'goal', 'type', 'compile', 'newDoc', 'newFolder', 'delete']);
  });

  it('manuscript folders get rename, creation, and delete — no document metadata', () => {
    expect(menuActionsFor(folder('020~ Part One'), 'manuscript')).toEqual(
      ['rename', 'newDoc', 'newFolder', 'delete']);
  });

  it('non-markdown files are rename and delete only', () => {
    expect(menuActionsFor(pdf('map.pdf'), 'manuscript')).toEqual(['rename', 'delete']);
  });

  it('research rows never get the manuscript metadata actions', () => {
    expect(menuActionsFor(doc('Notes.md'), 'research')).toEqual(
      ['rename', 'newDoc', 'newFolder', 'delete']);
    expect(menuActionsFor(folder('Interviews'), 'research')).toEqual(
      ['rename', 'newDoc', 'newFolder', 'delete']);
    expect(menuActionsFor(pdf('scan.pdf'), 'research')).toEqual(['rename', 'delete']);
  });

  it('exports rows are delete-only — the zone is output-only', () => {
    expect(menuActionsFor(doc('Book.md'), 'exports')).toEqual(['delete']);
    expect(menuActionsFor(folder('2026'), 'exports')).toEqual(['delete']);
    expect(menuActionsFor(pdf('Book.pdf'), 'exports')).toEqual(['delete']);
  });
});

describe('renamePrefill', () => {
  it('markdown documents show the basename', () => {
    expect(renamePrefill(doc('Ch 1.md'))).toBe('Ch 1');
  });

  it('folders show the display name with the order marker stripped', () => {
    expect(renamePrefill(folder('020~ Part One'))).toBe('Part One');
  });

  it('unmarked folders show the full typed name', () => {
    expect(renamePrefill(folder('2023 files'))).toBe('2023 files');
  });

  it('non-markdown files show the name with the extension stripped', () => {
    expect(renamePrefill(pdf('map.pdf'))).toBe('map');
  });
});

describe('renameTargetName', () => {
  it('re-attaches the markdown extension', () => {
    expect(renameTargetName(doc('Ch 1.md'), 'Chapter One')).toBe('Chapter One.md');
  });

  it('does not double an extension the user typed back', () => {
    expect(renameTargetName(doc('Ch 1.md'), 'Chapter One.md')).toBe('Chapter One.md');
  });

  it('re-attaches the original non-markdown extension — the extension is not editable', () => {
    expect(renameTargetName(pdf('map.pdf'), 'atlas')).toBe('atlas.pdf');
  });

  it('re-attaches the existing folder marker so order survives the rename', () => {
    expect(renameTargetName(folder('020~ Part One'), 'Part Uno')).toBe('020~ Part Uno');
  });

  it('re-attaches a negative marker with padded magnitude', () => {
    expect(renameTargetName(folder('-010~ Recall'), 'Recalled')).toBe('-010~ Recalled');
  });

  it('leaves unmarked folders unmarked', () => {
    expect(renameTargetName(folder('2023 files'), '2024 files')).toBe('2024 files');
  });

  it('keeps deliberately typed marker syntax byte-for-byte (#239 residual ruling)', () => {
    expect(renameTargetName(folder('020~ Part One'), '007~ Bond')).toBe('007~ Bond');
  });
});

describe('validateItemName — one test per reject rule (#229)', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(validateItemName('', '', [])).toEqual({ ok: false, reason: 'empty' });
    expect(validateItemName('   ', '   ', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects every forbidden character', () => {
    for (const c of '\\/:*?"<>|') {
      expect(validateItemName(`a${c}b`, `a${c}b.md`, [])).toEqual({ ok: false, reason: 'invalid-chars' });
    }
  });

  it('rejects trailing spaces and periods', () => {
    expect(validateItemName('name ', 'name .md', [])).toEqual({ ok: false, reason: 'trailing' });
    expect(validateItemName('name.', 'name..md', [])).toEqual({ ok: false, reason: 'trailing' });
  });

  it('rejects a case-insensitive collision with an existing sibling', () => {
    expect(validateItemName('ch 2', 'ch 2.md', ['Ch 2.md', 'Ch 3.md']))
      .toEqual({ ok: false, reason: 'exists' });
  });

  it('accepts a clean name', () => {
    expect(validateItemName('Ch 4', 'Ch 4.md', ['Ch 2.md', 'Ch 3.md'])).toEqual({ ok: true });
  });

  it('accepts a case-only self-rename — the caller excludes the entry itself', () => {
    expect(validateItemName('chapter one', 'chapter one.md', ['Ch 2.md'])).toEqual({ ok: true });
  });
});

describe('frontmatter metadata parsing', () => {
  it('parseBinderType accepts only the four document types', () => {
    expect(parseBinderType('chapter')).toBe('chapter');
    expect(parseBinderType('note')).toBe('note');
    expect(parseBinderType('group')).toBeNull();
    expect(parseBinderType('part')).toBeNull();
    expect(parseBinderType(5)).toBeNull();
    expect(parseBinderType(undefined)).toBeNull();
  });

  it('parseBinderStatus accepts only known statuses', () => {
    expect(parseBinderStatus('draft')).toBe('draft');
    expect(parseBinderStatus('in-progress')).toBe('in-progress');
    expect(parseBinderStatus('finished')).toBeNull();
    expect(parseBinderStatus(true)).toBeNull();
  });
});
