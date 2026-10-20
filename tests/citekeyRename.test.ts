import { countKeyUses, isValidCitekey, rewriteCitekey } from '../src/citekeyRename';

describe('isValidCitekey', () => {
  it('accepts the key syntax and rejects trailing punctuation and leading symbols', () => {
    expect(isValidCitekey('smith2020')).toBe(true);
    expect(isValidCitekey('smith2020long')).toBe(true);
    expect(isValidCitekey('smith:2020.a')).toBe(true);
    expect(isValidCitekey('')).toBe(false);
    expect(isValidCitekey('-smith')).toBe(false);
    expect(isValidCitekey('smith2020.')).toBe(false);
    expect(isValidCitekey('smith 2020')).toBe(false);
  });
});

describe('rewriteCitekey', () => {
  const text = [
    'As @smith2020 argues [@smith2020, p. 12], and see [see @lee2018; -@smith2020].',
    'A wikilink [[Smith 2020|p. 3]] and an email a@smith2020.com stay.',
    'Narrative with a period: @smith2020. Done.',
    '`[@smith2020]` in code stays.',
  ].join('\n');

  it('renames bracketed, narrative, suppressed, and multi-item citations, leaving everything else', () => {
    const r = rewriteCitekey(text, 'smith2020', 'smith2020long');
    expect(r.count).toBe(4);
    expect(r.text).toBe([
      'As @smith2020long argues [@smith2020long, p. 12], and see [see @lee2018; -@smith2020long].',
      'A wikilink [[Smith 2020|p. 3]] and an email a@smith2020.com stay.',
      'Narrative with a period: @smith2020long. Done.',
      '`[@smith2020]` in code stays.',
    ].join('\n'));
  });

  it('does not touch a key that merely starts with the old one', () => {
    const r = rewriteCitekey('[@smith2020a] and [@smith2020]', 'smith2020', 'x');
    expect(r.count).toBe(1);
    expect(r.text).toBe('[@smith2020a] and [@x]');
  });

  it('counts uses the same way', () => {
    expect(countKeyUses(text, 'smith2020')).toBe(4);
    expect(countKeyUses(text, 'lee2018')).toBe(1);
    expect(countKeyUses(text, 'nobody')).toBe(0);
  });
});
