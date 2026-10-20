// Renaming a citation key across a project. The key lives on the source
// note; every `@key` citation in the manuscript and research notes points
// at it. Wikilink citations name the file, not the key, so they are never
// touched. Pure: the caller supplies and writes the texts.

import { findCitations, Citation, replaceCitations } from './citations';

const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_:.#$%&\-+?<>~/]*$/;
// A key cannot end in punctuation — "@smith2020." is the key plus a period.
const TRAILING = /[.:,;?!#$%&\-+<>~/]+$/;

export function isValidCitekey(key: string): boolean {
  return KEY_RE.test(key) && !TRAILING.test(key);
}

const resolverFor = (key: string) => ({
  hasKey: (k: string) => k === key,
  keyForLink: () => null,
});

// How many citations of `key` the text holds (an item each, so `[@a; @b]`
// with both renamed counts twice).
export function countKeyUses(text: string, key: string): number {
  let n = 0;
  for (const c of findCitations(text, resolverFor(key))) {
    for (const i of c.items) if (i.key === key) n++;
  }
  return n;
}

export interface KeyRewrite {
  text: string;
  count: number;
}

// Rewrites `@oldKey` to `@newKey` inside each citation that carries it,
// bracketed or narrative, leaving prefixes, pages, and other keys as typed.
export function rewriteCitekey(text: string, oldKey: string, newKey: string): KeyRewrite {
  const citations = findCitations(text, resolverFor(oldKey))
    .filter(c => c.items.some(i => i.key === oldKey) && c.raw.includes('@'));
  let count = 0;
  const render = (c: Citation): string =>
    c.raw.replace(/(^|[^\w@])(-?)@([A-Za-z0-9_][A-Za-z0-9_:.#$%&\-+?<>~/]*)/g, (whole, lead: string, minus: string, run: string) => {
      const trimmed = run.replace(TRAILING, '');
      if (trimmed !== oldKey) return whole;
      count++;
      return `${lead}${minus}@${newKey}${run.slice(trimmed.length)}`;
    });
  return { text: replaceCitations(text, citations, render), count };
}
