import { FrontmatterManager } from '../src/FrontmatterManager';

const mockPlugin = {
  app: {},
  settings: { frontmatterAutoUpdate: false, defaultProjectFolder: 'Writing' },
} as never;

describe('FrontmatterManager.countWords', () => {
  let fm: FrontmatterManager;
  beforeEach(() => { fm = new FrontmatterManager(mockPlugin); });

  it('counts words in plain content', () => {
    expect(fm.countWords('hello world')).toBe(2);
  });

  it('strips frontmatter before counting', () => {
    const content = '---\ntitle: My Post\n---\nhello world';
    expect(fm.countWords(content)).toBe(2);
  });

  it('strips fenced code blocks', () => {
    const content = '```\nconst x = 1;\nconst y = 2;\n```\nhello world';
    expect(fm.countWords(content)).toBe(2);
  });

  it('strips inline code', () => {
    expect(fm.countWords('run `npm test` now')).toBe(2);
  });

  it('strips markdown headings', () => {
    expect(fm.countWords('## Chapter One\nSome text here')).toBe(5);
  });

  it('returns 0 for empty content', () => {
    expect(fm.countWords('')).toBe(0);
  });

  it('returns 0 for frontmatter-only content', () => {
    expect(fm.countWords('---\ntitle: Test\n---\n')).toBe(0);
  });
});

import { TFile } from 'obsidian';

describe('FrontmatterManager.isWritingProjectFile folder scoping', () => {
  const fm = new FrontmatterManager(mockPlugin);
  const check = (path: string) =>
    (fm as unknown as { isWritingProjectFile(f: TFile): boolean })
      .isWritingProjectFile(Object.assign(new TFile(), { path, extension: 'md' }));

  it('accepts files inside the project folder', () => {
    expect(check('Writing/My Book/Chapters/ch1.md')).toBe(true);
  });

  it('rejects files in a sibling folder sharing the prefix', () => {
    expect(check('Writing Archive/old-note.md')).toBe(false);
  });

  it('rejects a file named like the folder prefix', () => {
    expect(check('Writingnotes.md')).toBe(false);
  });

  it('rejects files outside the project folder', () => {
    expect(check('Daily/2026-06-11.md')).toBe(false);
  });
});
