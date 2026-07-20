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

  // #297 — Han and kana count one word per character; Hangul and everything
  // else stay whitespace-split; full-width CJK punctuation counts zero.
  describe('CJK text (#297)', () => {
    it('counts each Han character as one word', () => {
      expect(countWords('你好')).toBe(2);
      expect(countWords('你好世界')).toBe(4);
    });

    it('counts mixed Latin and Han text', () => {
      expect(countWords('hello 你好世界 world')).toBe(6);
    });

    it('treats Han characters as boundaries inside a Latin run', () => {
      expect(countWords('abc你好def')).toBe(4);
    });

    it('counts full-width punctuation as zero', () => {
      expect(countWords('你好。')).toBe(2);
      expect(countWords('你好。世界')).toBe(4);
      expect(countWords('こんにちは、世界！')).toBe(7);
    });

    it('counts each kana character as one word', () => {
      expect(countWords('こんにちは')).toBe(5);
      expect(countWords('カタカナ')).toBe(4);
      expect(countWords('日本語です。')).toBe(5);
    });

    it('keeps Hangul whitespace-split', () => {
      expect(countWords('안녕하세요')).toBe(1);
      expect(countWords('안녕 하세요')).toBe(2);
    });

    it('strips markdown before counting CJK text', () => {
      expect(countWords('# 你好')).toBe(2);
    });
  });
});
