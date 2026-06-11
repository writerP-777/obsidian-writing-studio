import { computeSprintWords } from '../src/SprintTimer';

const m = (entries: [string, number][]) => new Map(entries);

describe('computeSprintWords — file scope', () => {
  it('counts only the primary file', () => {
    const baselines = m([['a.md', 100], ['b.md', 500]]);
    const currents = m([['a.md', 150], ['b.md', 900]]);
    expect(computeSprintWords('file', 'a.md', baselines, currents, null)).toBe(50);
  });

  it('switching to a longer document does not inflate the count', () => {
    // User starts in a.md (100 words), switches to a 5000-word chapter and types nothing
    const baselines = m([['a.md', 100], ['big.md', 5000]]);
    const currents = m([['a.md', 100], ['big.md', 5000]]);
    expect(computeSprintWords('file', 'a.md', baselines, currents, null)).toBe(0);
  });

  it('switching to a shorter document does not clamp real progress', () => {
    // 80 words written in the primary file before switching away
    const baselines = m([['a.md', 100], ['short.md', 20]]);
    const currents = m([['a.md', 180], ['short.md', 20]]);
    expect(computeSprintWords('file', 'a.md', baselines, currents, null)).toBe(80);
  });

  it('returns 0 with no primary file', () => {
    expect(computeSprintWords('file', null, m([]), m([]), null)).toBe(0);
  });

  it('deletions clamp to zero, not negative', () => {
    const baselines = m([['a.md', 100]]);
    const currents = m([['a.md', 60]]);
    expect(computeSprintWords('file', 'a.md', baselines, currents, null)).toBe(0);
  });
});

describe('computeSprintWords — project scope', () => {
  it('sums words written across all tracked files', () => {
    const baselines = m([['p/a.md', 100], ['p/b.md', 200]]);
    const currents = m([['p/a.md', 150], ['p/b.md', 230]]);
    expect(computeSprintWords('project', 'p/a.md', baselines, currents, null)).toBe(80);
  });

  it('limits counting to the project folder when a prefix is given', () => {
    const baselines = m([['Projects/Book/ch1.md', 100], ['Notes/scratch.md', 10]]);
    const currents = m([['Projects/Book/ch1.md', 160], ['Notes/scratch.md', 110]]);
    expect(
      computeSprintWords('project', null, baselines, currents, 'Projects/Book/')
    ).toBe(60);
  });

  it('a file with deletions does not subtract from other files', () => {
    const baselines = m([['p/a.md', 100], ['p/b.md', 200]]);
    const currents = m([['p/a.md', 50], ['p/b.md', 260]]);
    expect(computeSprintWords('project', null, baselines, currents, null)).toBe(60);
  });
});
