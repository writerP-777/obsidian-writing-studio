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

describe('FrontmatterManager.buildFrontmatter', () => {
  let fm: FrontmatterManager;
  beforeEach(() => { fm = new FrontmatterManager(mockPlugin); });

  it('wraps output in --- delimiters', () => {
    const result = fm.buildFrontmatter({ title: 'Hello' });
    expect(result.startsWith('---')).toBe(true);
    expect(result.endsWith('---')).toBe(true);
  });

  it('includes string and number fields', () => {
    const result = fm.buildFrontmatter({ title: 'My Post', order: 1 });
    expect(result).toContain('title: My Post');
    expect(result).toContain('order: 1');
  });

  it('quotes values that contain a colon', () => {
    const result = fm.buildFrontmatter({ title: 'Chapter: One' });
    expect(result).toContain('title: "Chapter: One"');
  });

  it('quotes values that contain a hash', () => {
    const result = fm.buildFrontmatter({ title: '#1 Story' });
    expect(result).toContain('title: "#1 Story"');
  });

  it('formats arrays with bracket notation', () => {
    const result = fm.buildFrontmatter({ tags: ['writing', 'studio'] });
    expect(result).toContain('tags: [writing, studio]');
  });
});

describe('FrontmatterManager.parseFrontmatter', () => {
  let fm: FrontmatterManager;
  beforeEach(() => { fm = new FrontmatterManager(mockPlugin); });

  it('returns null for content without frontmatter', () => {
    expect(fm.parseFrontmatter('Just some text')).toBeNull();
  });

  it('parses string and numeric fields', () => {
    const content = '---\ntitle: Hello\norder: 3\n---\nBody text';
    const result = fm.parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!['title']).toBe('Hello');
    expect(result!['order']).toBe(3);
  });

  it('parses array fields', () => {
    const content = '---\ntags: [writing, studio]\n---';
    const result = fm.parseFrontmatter(content);
    expect(result!['tags']).toEqual(['writing', 'studio']);
  });

  it('strips surrounding quotes from quoted values', () => {
    const content = '---\ntitle: "Chapter: One"\n---';
    const result = fm.parseFrontmatter(content);
    expect(result!['title']).toBe('Chapter: One');
  });

  it('round-trips buildFrontmatter output', () => {
    const fields = { title: 'My Note', order: 5, status: 'draft' };
    const built = fm.buildFrontmatter(fields);
    const parsed = fm.parseFrontmatter(built);
    expect(parsed!['title']).toBe('My Note');
    expect(parsed!['order']).toBe(5);
    expect(parsed!['status']).toBe('draft');
  });
});

describe('FrontmatterManager.setFrontmatterField', () => {
  let fm: FrontmatterManager;
  beforeEach(() => { fm = new FrontmatterManager(mockPlugin); });

  it('updates an existing field in the frontmatter', () => {
    const content = '---\nword-count: 0\nstatus: draft\n---\nBody';
    const result = fm.setFrontmatterField(content, 'word-count', 42);
    expect(result).toContain('word-count: 42');
    expect(result).not.toContain('word-count: 0');
  });

  it('adds a new field when it does not exist', () => {
    const content = '---\ntitle: Hello\n---\nBody';
    const result = fm.setFrontmatterField(content, 'word-count', 10);
    expect(result).toContain('word-count: 10');
  });

  it('preserves body content after the frontmatter', () => {
    const content = '---\ntitle: Hello\n---\nBody text here';
    const result = fm.setFrontmatterField(content, 'title', 'Updated');
    expect(result).toContain('Body text here');
  });
});
