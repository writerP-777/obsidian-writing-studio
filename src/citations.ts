// Finds citations in a draft. Two spellings are citations: Pandoc's
// `[@key, p. 12]` / `@key` / `[-@key]`, and a wikilink to a source note,
// whose alias is the page (`[[Smith 2020|p. 12]]`). Code is skipped. A bare
// `@word` only counts when the key resolves, so handles and email addresses
// in prose are never touched; a bracketed `[@word]` always counts and is
// reported as unresolved when nothing matches, since brackets are deliberate.

import { codeRanges, inRanges } from './mdMask';

export interface CitationItem {
  key: string;
  // Text before the key inside the brackets ("see"), already trimmed.
  prefix: string;
  locator: Locator | null;
  // Trailing text that is not a locator ("for the full argument").
  suffix: string;
  suppressAuthor: boolean;
}

export interface Locator {
  // 'page' prints as a bare number in Chicago; anything else prints as typed.
  label: 'page' | 'other';
  value: string;
}

export interface Citation {
  items: CitationItem[];
  // `@key` outside brackets — the author is part of the sentence.
  narrative: boolean;
  start: number;
  end: number;
  raw: string;
}

export interface CitationResolver {
  hasKey(key: string): boolean;
  // The citekey of the source note a wikilink target resolves to, or null.
  keyForLink(target: string): string | null;
}

const KEY_CHARS = '[A-Za-z0-9_][A-Za-z0-9_:.#$%&\\-+?<>~/]*';
// A key cannot end in punctuation — "@smith2020." is the key plus a period.
const trimKey = (key: string): string => key.replace(/[.:,;?!#$%&\-+<>~/]+$/, '');

// "p. 12", "pp. 12–14", "page 7", "12", "12-14" are pages; everything else
// ("chap. 3", "sec. 4.2") prints as typed.
export function parseLocator(raw: string): Locator | null {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/^[,:]\s*/, '');
  if (!text) return null;
  const page = /^(?:p\.?|pp\.?|pages?)\s*(\d[\d,\s]*(?:[-–—]\s*\d+)?[a-z]?)$/i.exec(text)
    ?? /^(\d+(?:\s*[-–—]\s*\d+)?[a-z]?)$/.exec(text);
  if (page) {
    return { label: 'page', value: page[1].replace(/\s*[-–—]\s*/, '–').replace(/\s+/g, '') };
  }
  return { label: 'other', value: text };
}

// Pandoc's locator rule, narrowed: the text after the key is a locator when
// it looks like one, otherwise it is a suffix printed as typed.
function parseItem(text: string): CitationItem | null {
  const m = new RegExp(`^(.*?)(?:^|\\s)(-?)@(${KEY_CHARS})(.*)$`).exec(text.trim());
  if (!m) return null;
  const key = trimKey(m[3]);
  if (!key) return null;
  const rest = m[4].trim().replace(/^,\s*/, '');
  const locator = parseLocator(rest);
  return {
    key,
    prefix: m[1].trim(),
    locator,
    suffix: locator ? '' : rest,
    suppressAuthor: m[2] === '-',
  };
}

export function findCitations(text: string, resolver: CitationResolver): Citation[] {
  const skip = codeRanges(text);
  const found: Citation[] = [];
  const taken: { start: number; end: number }[] = [];
  const claim = (start: number, end: number): boolean => {
    if (inRanges(skip, start)) return false;
    for (const t of taken) if (start < t.end && end > t.start) return false;
    taken.push({ start, end });
    return true;
  };

  // Wikilinks to source notes. Embeds (![[...]]) are never citations.
  const wiki = /(?<!!)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wiki.exec(text)) !== null) {
    const key = resolver.keyForLink(m[1].trim());
    if (!key) continue;
    if (!claim(m.index, m.index + m[0].length)) continue;
    found.push({
      items: [{ key, prefix: '', locator: parseLocator(m[3] ?? ''), suffix: '', suppressAuthor: false }],
      narrative: false,
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }

  // Bracketed citations: every ;-separated part must carry exactly one key
  // whose @ starts the part or follows whitespace — "[a@b.com]" is not one.
  const bracket = /\[([^[\]]*@[^[\]]*)\]/g;
  while ((m = bracket.exec(text)) !== null) {
    if (text[m.index - 1] === '[' || text[m.index + m[0].length] === ']') continue;
    const items = m[1].split(';').map(parseItem);
    if (items.length === 0 || items.some(i => i === null)) continue;
    const parts = m[1].split(';');
    if (parts.some(p => !/(^|\s)-?@/.test(p.trim()))) continue;
    if (!claim(m.index, m.index + m[0].length)) continue;
    found.push({
      items: items as CitationItem[],
      narrative: false,
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }

  // Narrative citations: a bare @key that resolves. A following "[p. 12]"
  // carries the locator, as in Pandoc.
  const bare = new RegExp(`(?<![\\w@./[\\-])@(${KEY_CHARS})(?:\\s?\\[([^[\\]@]*)\\])?`, 'g');
  while ((m = bare.exec(text)) !== null) {
    const key = trimKey(m[1]);
    if (!key || !resolver.hasKey(key)) continue;
    // Punctuation trimmed from the key ends the citation there — a bracket
    // after "@key." is not its locator.
    const hasLocator = m[2] !== undefined && m[1].length === key.length;
    const end = hasLocator ? m.index + m[0].length : m.index + 1 + key.length;
    if (!claim(m.index, end)) continue;
    found.push({
      items: [{ key, prefix: '', locator: parseLocator(hasLocator ? m[2] : ''), suffix: '', suppressAuthor: false }],
      narrative: true,
      start: m.index,
      end,
      raw: text.slice(m.index, end),
    });
  }

  return found.sort((a, b) => a.start - b.start);
}

// Rebuilds the text with each citation replaced by what render returns.
export function replaceCitations(text: string, citations: Citation[], render: (c: Citation) => string): string {
  let out = '';
  let pos = 0;
  for (const c of citations) {
    out += text.slice(pos, c.start) + render(c);
    pos = c.end;
  }
  return out + text.slice(pos);
}

// "p. 12", "pp. 12–14", or the locator as typed — Pandoc's spelling, also
// what the citation picker inserts.
export function locatorToPandoc(loc: Locator): string {
  if (loc.label !== 'page') return loc.value;
  return `${loc.value.includes('–') ? 'pp.' : 'p.'} ${loc.value}`;
}

// Pandoc's own spelling of a citation, used when the export hands citation
// rendering to citeproc: wikilink citations become bracket citations and
// bracket citations are re-emitted normalized.
export function toPandocCitation(c: Citation): string {
  const item = (i: CitationItem): string => {
    const loc = i.locator ? `, ${locatorToPandoc(i.locator)}` : (i.suffix ? `, ${i.suffix}` : '');
    return `${i.prefix ? `${i.prefix} ` : ''}${i.suppressAuthor ? '-' : ''}@${i.key}${loc}`;
  };
  if (c.narrative && c.items.length === 1 && !c.items[0].prefix) {
    const i = c.items[0];
    return `@${i.key}${i.locator ? ` [${locatorToPandoc(i.locator)}]` : ''}`;
  }
  return `[${c.items.map(item).join('; ')}]`;
}
