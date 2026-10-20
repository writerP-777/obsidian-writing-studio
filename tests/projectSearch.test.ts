import { findMatches, planUndo, replaceMatches } from '../src/projectSearch';

const q = (find: string, opts: Partial<{ matchCase: boolean; wholeWord: boolean }> = {}) =>
  ({ find, matchCase: opts.matchCase ?? false, wholeWord: opts.wholeWord ?? false });

describe('findMatches', () => {
  const text = '---\ntitle: Nineveh notes\n---\n\nThe walls of Nineveh stood.\n`Nineveh` in code.\n\nnineveh lower.\n';

  it('finds matches in the body, never in properties or code, case-insensitively by default', () => {
    const hits = findMatches(text, q('Nineveh'));
    expect(hits.map(h => h.hit)).toEqual(['Nineveh', 'nineveh']);
    expect(hits[0].line).toBe(4);
    expect(hits[0].before).toBe('The walls of ');
    expect(hits[0].after).toBe(' stood.');
    expect(text.slice(hits[0].start, hits[0].end)).toBe('Nineveh');
  });

  it('honors match case', () => {
    expect(findMatches(text, q('Nineveh', { matchCase: true })).map(h => h.hit)).toEqual(['Nineveh']);
  });

  it('honors whole word', () => {
    const t = 'cat catalog concat cat.';
    expect(findMatches(t, q('cat', { wholeWord: true })).map(h => h.start)).toEqual([0, 19]);
  });

  it('treats the query as literal text', () => {
    expect(findMatches('a.c abc', q('a.c')).map(h => h.start)).toEqual([0]);
  });

  it('shortens long context with an ellipsis', () => {
    const t = 'x'.repeat(60) + ' hit ' + 'y'.repeat(60);
    const [h] = findMatches(t, q('hit'));
    expect(h.before.startsWith('…')).toBe(true);
    expect(h.before.length).toBe(41);
    expect(h.after.endsWith('…')).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatches(text, q(''))).toEqual([]);
  });
});

describe('replaceMatches', () => {
  it('replaces only the chosen spans', () => {
    const t = 'one two one two';
    const all = findMatches(t, q('one'));
    expect(replaceMatches(t, [all[1]], 'ONE')).toBe('one two ONE two');
    expect(replaceMatches(t, all, 'ONE')).toBe('ONE two ONE two');
  });
});

describe('planUndo', () => {
  it('restores files that still hold the replaced text and skips the rest', () => {
    const records = [
      { path: 'a.md', before: 'A0', after: 'A1' },
      { path: 'b.md', before: 'B0', after: 'B1' },
      { path: 'c.md', before: 'C0', after: 'C1' },
    ];
    const now: Record<string, string | null> = { 'a.md': 'A1', 'b.md': 'B1 edited', 'c.md': null };
    expect(planUndo(records, p => now[p])).toEqual({
      restore: [{ path: 'a.md', content: 'A0' }],
      skipped: ['b.md', 'c.md'],
    });
  });
});
