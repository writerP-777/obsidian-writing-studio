// The built-in citation formatter: Chicago author-date and Chicago notes,
// for the export paths that do not go through Pandoc (HTML, Manuscript,
// EPUB, Markdown, and the compile preview). Output is inline markdown —
// `*Title*` for italics — so each path converts it with the converter it
// already uses. The compact CSL in chicagoNotesCsl.ts mirrors these rules
// for Pandoc, so a writer switching formats sees the same notes.

import type { Source, SourceName } from './sources';
import type { CitationItem, Locator } from './citations';

export type CitationStyle = 'author-date' | 'notes';

// ─── Names ───────────────────────────────────────────────────────────────────

const familyOf = (n: SourceName): string => n.literal ?? n.family;
const naturalOf = (n: SourceName): string => n.literal ?? (n.given ? `${n.given} ${n.family}` : n.family);
const invertedOf = (n: SourceName): string => n.literal ?? (n.given ? `${n.family}, ${n.given}` : n.family);

// "Smith", "Smith and Doe", "Smith, Doe, and Lee", "Smith et al."
export function namesInText(names: SourceName[]): string {
  const f = names.map(familyOf);
  if (f.length === 0) return '';
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  if (f.length === 3) return `${f[0]}, ${f[1]}, and ${f[2]}`;
  return `${f[0]} et al.`;
}

// Natural order for notes: "Jane Smith and John Doe", four or more "et al."
function namesInNote(names: SourceName[]): string {
  const f = names.map(naturalOf);
  if (f.length === 0) return '';
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  if (f.length === 3) return `${f[0]}, ${f[1]}, and ${f[2]}`;
  return `${f[0]} et al.`;
}

// Bibliography: first name inverted, the rest natural.
function namesInBibliography(names: SourceName[]): string {
  if (names.length === 0) return '';
  const first = invertedOf(names[0]);
  if (names.length === 1) return first;
  const rest = names.slice(1).map(naturalOf);
  if (names.length === 2) return `${first}, and ${rest[0]}`;
  return `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

const quoted = (title: string): string => `“${title}”`;
const italic = (title: string): string => `*${title}*`;

const ITALIC_TITLE_TYPES = new Set(['book', 'report']);
const titleOf = (s: Source): string => ITALIC_TITLE_TYPES.has(s.type) ? italic(s.title) : quoted(s.title);

// "2" → "2nd ed."; "Revised edition" stays as typed.
function editionOf(s: Source): string | null {
  if (!s.edition) return null;
  const n = Number(s.edition);
  if (!Number.isInteger(n) || n < 1) return s.edition;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix} ed.`;
}

const linkOf = (s: Source): string | null => {
  if (s.doi) return `https://doi.org/${s.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
  return s.url;
};

const yearOf = (s: Source): string => s.year ?? 'n.d.';

// Chicago sets commas and periods inside a closing quotation mark.
const insideQuotes = (text: string): string => text.replace(/”,/g, ',”').replace(/”\./g, '.”');

// Sentences end once: a piece that already ends in terminal punctuation is
// not given a second period. Empty pieces vanish.
function sentence(pieces: (string | null)[]): string {
  return insideQuotes(pieces
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map(p => p.trim())
    .map(p => /[.!?]$/.test(p) || /[.!?][”*]$/.test(p) ? p : `${p}.`)
    .join(' '));
}

// "Place: Publisher", either half alone, or nothing.
function imprint(s: Source): string | null {
  if (s.place && s.publisher) return `${s.place}: ${s.publisher}`;
  return s.publisher ?? s.place;
}

function pageLocator(loc: Locator | null): string | null {
  if (!loc) return null;
  return loc.value;
}

// "The Long Argument: Why Reform Fails" → "Long Argument": subtitle dropped,
// initial article dropped, at most four words (CMOS 14.33).
export function shortTitle(title: string): string {
  let t = title.split(/:\s/)[0].trim();
  t = t.replace(/^(the|a|an)\s+/i, '');
  const words = t.split(/\s+/);
  return words.length > 4 ? words.slice(0, 4).join(' ') : t;
}

// ─── Author-date ─────────────────────────────────────────────────────────────

// The year with its disambiguating letter — 2020a, 2020b — when two cited
// sources share an author string and year.
export type YearSuffixes = ReadonlyMap<string, string>;

export function authorDateInText(
  items: CitationItem[],
  lookup: (key: string) => Source | null,
  suffixes: YearSuffixes,
  narrative: boolean,
): string {
  const parts = items.map(item => {
    const s = lookup(item.key);
    if (!s) return `[@${item.key}?]`;
    const year = `${yearOf(s)}${suffixes.get(s.citekey) ?? ''}`;
    const who = s.authors.length ? namesInText(s.authors) : (s.editors.length ? namesInText(s.editors) : shortTitle(s.title));
    const loc = pageLocator(item.locator);
    const tail = `${year}${loc ? `, ${loc}` : ''}${item.suffix ? `, ${item.suffix}` : ''}`;
    const prefix = item.prefix ? `${item.prefix} ` : '';
    if (narrative && items.length === 1) return `${who} (${tail})`;
    return `${prefix}${item.suppressAuthor ? '' : `${who} `}${tail}`;
  });
  if (narrative && items.length === 1 && lookup(items[0].key)) return parts[0];
  return `(${parts.join('; ')})`;
}

export function authorDateEntry(s: Source, suffix = ''): string {
  const year = `${yearOf(s)}${suffix}`;
  const who = s.authors.length
    ? namesInBibliography(s.authors)
    : (s.editors.length ? `${namesInBibliography(s.editors)}, ${s.editors.length > 1 ? 'eds.' : 'ed.'}` : null);
  const head = who ? [who, year] : [titleOf(s), year];
  const body = who ? [titleOf(s)] : [];
  switch (s.type) {
    case 'chapter':
      return sentence([...head, ...body,
        `In ${s.containerTitle ? italic(s.containerTitle) : ''}${s.editors.length && s.authors.length ? `, edited by ${namesInNote(s.editors)}` : ''}${s.pages ? `, ${s.pages}` : ''}`.replace(/^In $/, ''),
        imprint(s), linkOf(s)]);
    case 'article-journal':
      return sentence([...head, ...body,
        `${s.containerTitle ? italic(s.containerTitle) : ''}${s.volume ? ` ${s.volume}` : ''}${s.issue ? ` (${s.issue})` : ''}${s.pages ? `: ${s.pages}` : ''}`,
        linkOf(s)]);
    case 'article-magazine':
    case 'article-newspaper':
      return sentence([...head, ...body,
        `${s.containerTitle ? italic(s.containerTitle) : ''}${s.pages ? `, ${s.pages}` : ''}`,
        linkOf(s)]);
    case 'webpage':
      return sentence([...head, ...body, s.containerTitle,
        s.accessed ? `Accessed ${s.accessed}` : null, linkOf(s)]);
    case 'thesis':
      return sentence([...head, ...body, `Thesis${s.publisher ? `, ${s.publisher}` : ''}`, linkOf(s)]);
    case 'report':
    case 'book':
    default:
      return sentence([...head, ...body, editionOf(s),
        s.editors.length && s.authors.length ? `Edited by ${namesInNote(s.editors)}` : null,
        imprint(s), linkOf(s)]);
  }
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function fullNote(s: Source, locator: Locator | null): string {
  return insideQuotes(fullNoteRaw(s, locator));
}

function fullNoteRaw(s: Source, locator: Locator | null): string {
  const who = s.authors.length ? namesInNote(s.authors) : (s.editors.length ? `${namesInNote(s.editors)}, ${s.editors.length > 1 ? 'eds.' : 'ed.'}` : null);
  const loc = pageLocator(locator);
  const lead = who ? `${who}, ` : '';
  const facts = (inner: string | null): string => inner ? ` (${inner})` : '';
  const yearIn = (inner: string | null): string => [inner, yearOf(s)].filter(Boolean).join(', ');
  switch (s.type) {
    case 'chapter': {
      const inBook = s.containerTitle ? `, in ${italic(s.containerTitle)}` : '';
      const eds = s.editors.length && s.authors.length ? `, ed. ${namesInNote(s.editors)}` : '';
      return `${lead}${quoted(s.title)}${inBook}${eds}${facts(yearIn(imprint(s)))}${loc ? `, ${loc}` : (s.pages ? `, ${s.pages}` : '')}.`;
    }
    case 'article-journal': {
      const vol = `${s.volume ? ` ${s.volume}` : ''}${s.issue ? `, no. ${s.issue}` : ''}`;
      const pages = loc ?? s.pages;
      return `${lead}${quoted(s.title)}${s.containerTitle ? `, ${italic(s.containerTitle)}${vol}` : ''} (${yearOf(s)})${pages ? `: ${pages}` : ''}.`;
    }
    case 'article-magazine':
    case 'article-newspaper':
      return `${lead}${quoted(s.title)}${s.containerTitle ? `, ${italic(s.containerTitle)}` : ''}, ${yearOf(s)}${loc ? `, ${loc}` : ''}.`;
    case 'webpage': {
      const link = linkOf(s);
      return `${lead}${quoted(s.title)}${s.containerTitle ? `, ${s.containerTitle}` : ''}, ${yearOf(s)}${link ? `, ${link}` : ''}.`;
    }
    case 'thesis':
      return `${lead}${quoted(s.title)}${facts(yearIn(`thesis${s.publisher ? `, ${s.publisher}` : ''}`))}${loc ? `, ${loc}` : ''}.`;
    case 'report':
    case 'book':
    default: {
      const ed = editionOf(s);
      const eds = s.editors.length && s.authors.length ? `, ed. ${namesInNote(s.editors)}` : '';
      return `${lead}${italic(s.title)}${ed ? `, ${ed}` : ''}${eds}${facts(yearIn(imprint(s)))}${loc ? `, ${loc}` : ''}.`;
    }
  }
}

export function shortNote(s: Source, locator: Locator | null): string {
  const who = s.authors.length ? namesInText(s.authors) : (s.editors.length ? namesInText(s.editors) : null);
  const loc = pageLocator(locator);
  const title = ITALIC_TITLE_TYPES.has(s.type) ? italic(shortTitle(s.title)) : quoted(shortTitle(s.title));
  return insideQuotes(`${who ? `${who}, ` : ''}${title}${loc ? `, ${loc}` : ''}.`);
}

export function notesEntry(s: Source): string {
  const who = s.authors.length
    ? namesInBibliography(s.authors)
    : (s.editors.length ? `${namesInBibliography(s.editors)}, ${s.editors.length > 1 ? 'eds.' : 'ed.'}` : null);
  const head = who ? [who, titleOf(s)] : [titleOf(s)];
  const withYear = (inner: string | null): string => [inner, yearOf(s)].filter(Boolean).join(', ');
  switch (s.type) {
    case 'chapter':
      return sentence([...head,
        `In ${s.containerTitle ? italic(s.containerTitle) : ''}${s.editors.length && s.authors.length ? `, edited by ${namesInNote(s.editors)}` : ''}${s.pages ? `, ${s.pages}` : ''}`.replace(/^In $/, ''),
        withYear(imprint(s)), linkOf(s)]);
    case 'article-journal':
      return sentence([...head,
        `${s.containerTitle ? italic(s.containerTitle) : ''}${s.volume ? ` ${s.volume}` : ''}${s.issue ? `, no. ${s.issue}` : ''} (${yearOf(s)})${s.pages ? `: ${s.pages}` : ''}`,
        linkOf(s)]);
    case 'article-magazine':
    case 'article-newspaper':
      return sentence([...head,
        withYear(s.containerTitle ? italic(s.containerTitle) : null),
        linkOf(s)]);
    case 'webpage':
      return sentence([...head, withYear(s.containerTitle),
        s.accessed ? `Accessed ${s.accessed}` : null, linkOf(s)]);
    case 'thesis':
      return sentence([...head, withYear(`Thesis${s.publisher ? `, ${s.publisher}` : ''}`), linkOf(s)]);
    case 'report':
    case 'book':
    default:
      return sentence([...head, editionOf(s),
        s.editors.length && s.authors.length ? `Edited by ${namesInNote(s.editors)}` : null,
        withYear(imprint(s)), linkOf(s)]);
  }
}

// ─── Ordering ────────────────────────────────────────────────────────────────

const sortKey = (s: Source): string => {
  const who = s.authors[0] ?? s.editors[0];
  const lead = who ? familyOf(who) : s.title.replace(/^(the|a|an)\s+/i, '');
  return `${lead}\u0000${s.year ?? '9999'}\u0000${s.title}`.toLowerCase();
};

export function sortSources(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

// Author-date needs 2020a/2020b when the in-text form would otherwise be
// identical; letters follow bibliography order.
export function yearSuffixes(sources: Source[]): YearSuffixes {
  const groups = new Map<string, Source[]>();
  for (const s of sortSources(sources)) {
    const who = s.authors.length ? namesInText(s.authors) : (s.editors.length ? namesInText(s.editors) : shortTitle(s.title));
    const key = `${who}|${yearOf(s)}`.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.forEach((s, i) => out.set(s.citekey, String.fromCharCode(97 + i)));
  }
  return out;
}
