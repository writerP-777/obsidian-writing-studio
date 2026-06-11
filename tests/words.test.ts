import { countWords } from '../src/words';

describe('countWords', () => {
  it('counts plain words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('returns 0 for empty content', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
  });

  it('excludes LF frontmatter', () => {
    expect(countWords('---\ntitle: Test\nword-count: 9\n---\nbody words here')).toBe(3);
  });

  it('excludes CRLF frontmatter', () => {
    expect(countWords('---\r\ntitle: Test\r\n---\r\nbody words here')).toBe(3);
  });

  it('excludes code blocks and inline code', () => {
    expect(countWords('before\n```\ncode words ignored\n```\nafter `inline` end')).toBe(3);
  });

  it('excludes markdown links entirely', () => {
    expect(countWords('see [the docs](https://example.com/a-very-long-url) now')).toBe(2);
  });

  it('ignores images', () => {
    expect(countWords('![alt text](img.png) one')).toBe(1);
  });

  it('strips heading markers but counts heading text', () => {
    expect(countWords('# Chapter One\n\nbody')).toBe(3);
  });
});
