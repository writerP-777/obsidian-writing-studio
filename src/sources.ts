// A source is any note whose frontmatter carries a `citekey`. This module is
// the pure half of citation support: it reads a note's properties into a
// Source, tolerating the field names that Zotero Integration, the Citations
// plugin, and hand-written notes produce; generates citekeys for the Add
// source form; and converts a Source into the CSL-JSON item Pandoc's
// citeproc consumes. No vault access here — the index that scans the vault
// lives in sourceIndex.ts.

import { shortTitle } from './chicago';

export const CITEKEY_KEY = 'citekey';

export type SourceType =
  | 'book' | 'chapter' | 'article-journal' | 'article-magazine'
  | 'article-newspaper' | 'webpage' | 'thesis' | 'report';

export const SOURCE_TYPES: readonly SourceType[] = [
  'book', 'chapter', 'article-journal', 'article-magazine',
  'article-newspaper', 'webpage', 'thesis', 'report',
];

// A personal name split for sorting and inversion, or an organization that
// is cited by its whole name.
export interface SourceName {
  family: string;
  given: string;
  literal?: string;
}

export interface Source {
  citekey: string;
  path: string;
  type: SourceType;
  title: string;
  authors: SourceName[];
  editors: SourceName[];
  year: string | null;
  containerTitle: string | null;
  publisher: string | null;
  place: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  edition: string | null;
  doi: string | null;
  url: string | null;
  accessed: string | null;
}

// Spellings seen in the wild for each CSL type: CSL itself, Zotero item
// types, and plain words a writer would type. Anything unknown is a book —
// the most common nonfiction source and the most forgiving template.
const TYPE_ALIASES: Record<string, SourceType> = {
  book: 'book',
  monograph: 'book',
  chapter: 'chapter',
  booksection: 'chapter',
  bookchapter: 'chapter',
  incollection: 'chapter',
  articlejournal: 'article-journal',
  journalarticle: 'article-journal',
  journal: 'article-journal',
  article: 'article-journal',
  articlemagazine: 'article-magazine',
  magazinearticle: 'article-magazine',
  magazine: 'article-magazine',
  articlenewspaper: 'article-newspaper',
  newspaperarticle: 'article-newspaper',
  newspaper: 'article-newspaper',
  webpage: 'webpage',
  website: 'webpage',
  web: 'webpage',
  blogpost: 'webpage',
  post: 'webpage',
  online: 'webpage',
  thesis: 'thesis',
  dissertation: 'thesis',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  report: 'report',
  techreport: 'report',
};

export function parseSourceType(value: unknown): SourceType {
  if (typeof value !== 'string') return 'book';
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  return TYPE_ALIASES[key] ?? 'book';
}

const str = (value: unknown): string | null => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
};

// The first field present wins, so a note carrying both `journal` and
// `container-title` (Zotero exports often do) reads the CSL one.
const pick = (fm: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = str(fm[key]);
    if (value !== null) return value;
  }
  return null;
};

// Four digits anywhere in the value — a bare year, an ISO date, a Date
// object's string form, or Zotero's "2020-03-01T00:00:00Z" all yield 2020.
export function parseYear(value: unknown): string | null {
  if (value instanceof Date) return String(value.getFullYear());
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  const m = /(?<!\d)(\d{4})(?!\d)/.exec(text);
  return m ? m[1] : null;
}

// Words that mark a name as an organization rather than a person, so "Pew
// Research Center" is cited whole instead of as "Center, Pew Research".
const ORG_WORDS = new Set([
  'academy', 'agency', 'alliance', 'association', 'authority', 'bank', 'board', 'bureau',
  'center', 'centre', 'coalition', 'college', 'commission', 'committee', 'company', 'corporation',
  'council', 'department', 'federation', 'forum', 'foundation', 'fund', 'government', 'group',
  'initiative', 'institute', 'institution', 'laboratory', 'library', 'ministry', 'museum',
  'network', 'news', 'office', 'organisation', 'organization', 'partnership', 'press', 'program',
  'programme', 'project', 'research', 'review', 'school', 'service', 'services', 'society',
  'studies', 'survey', 'team', 'times', 'trust', 'union', 'university', 'inc', 'inc.', 'ltd', 'ltd.',
  'llc', 'co.', 'corp.', 'of', 'for', 'and', '&',
]);

// One typed name. "Smith, Jane" inverts; "Jane Smith" takes the last word as
// the family name. An organization — a single word, an acronym, a name in
// {braces}, or one containing a word like Institute or Center — is cited
// whole.
export function parseName(text: string): SourceName | null {
  const name = text.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  const braced = /^\{(.+)\}$/.exec(name);
  if (braced) return { family: braced[1].trim(), given: '', literal: braced[1].trim() };
  const comma = name.indexOf(',');
  if (comma > 0) {
    return { family: name.slice(0, comma).trim(), given: name.slice(comma + 1).trim() };
  }
  const words = name.split(' ');
  const isOrg = words.length === 1
    || /^[A-Z0-9&.\- ]+$/.test(name)
    || words.some(w => ORG_WORDS.has(w.toLowerCase()));
  if (isOrg) return { family: name, given: '', literal: name };
  return { family: words[words.length - 1], given: words.slice(0, -1).join(' ') };
}

const nameFromObject = (obj: Record<string, unknown>): SourceName | null => {
  const literal = str(obj.literal) ?? str(obj.name);
  const family = str(obj.family) ?? str(obj.lastName) ?? str(obj.last);
  const given = str(obj.given) ?? str(obj.firstName) ?? str(obj.first);
  if (family) return { family, given: given ?? '' };
  if (literal) return parseName(literal);
  return null;
};

// Authors arrive as a string ("Jane Smith and John Doe", "Smith, Jane; Doe,
// John"), a list of strings, or a list of objects in CSL ({family, given}),
// Zotero ({firstName, lastName}), or plain ({name}) shape.
export function parseNames(value: unknown): SourceName[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const names: SourceName[] = [];
    for (const entry of value) {
      if (typeof entry === 'string') {
        const parsed = parseName(entry);
        if (parsed) names.push(parsed);
      } else if (entry && typeof entry === 'object') {
        const parsed = nameFromObject(entry as Record<string, unknown>);
        if (parsed) names.push(parsed);
      }
    }
    return names;
  }
  if (typeof value === 'object') {
    const parsed = nameFromObject(value as Record<string, unknown>);
    return parsed ? [parsed] : [];
  }
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  // "A; B" and "A and B" separate people; a lone comma inverts one name.
  const parts = /;|\s+and\s+|\s*&\s*/.test(text)
    ? text.split(/;|\s+and\s+|\s*&\s*/)
    : [text];
  return parts.map(parseName).filter((n): n is SourceName => n !== null);
}

// A lowercase ASCII citekey from the first author's family name (or the
// organization's first word, or the first title word) plus the year, made
// unique against the keys already in use with a letter suffix.
export function generateCitekey(
  authors: SourceName[],
  year: string | null,
  title: string,
  taken: ReadonlySet<string>,
): string {
  const root = authors[0]?.literal?.split(' ')[0] ?? authors[0]?.family ?? title.split(/\s+/)[0] ?? '';
  const ascii = root.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = `${ascii || 'source'}${year ?? ''}`;
  if (!taken.has(base)) return base;
  for (let i = 0; i < 26; i++) {
    const candidate = `${base}${String.fromCharCode(97 + i)}`;
    if (!taken.has(candidate)) return candidate;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Null when the note has no citekey — most notes — so the caller can skip
// it without allocating a Source.
export function parseSource(fm: Record<string, unknown> | undefined, path: string): Source | null {
  if (!fm) return null;
  const citekey = str(fm[CITEKEY_KEY]);
  if (!citekey) return null;
  return {
    citekey,
    path,
    type: parseSourceType(fm.type ?? fm.itemType ?? fm['item-type']),
    title: pick(fm, ['title']) ?? path.split('/').pop()?.replace(/\.md$/, '') ?? citekey,
    authors: parseNames(fm.author ?? fm.authors ?? fm.creators ?? fm.creator),
    editors: parseNames(fm.editor ?? fm.editors),
    year: parseYear(fm.year ?? fm.date ?? fm.issued ?? fm.published),
    containerTitle: pick(fm, ['container-title', 'containerTitle', 'journal', 'publicationTitle', 'publication', 'website', 'site', 'book']),
    publisher: pick(fm, ['publisher', 'university', 'institution']),
    place: pick(fm, ['place', 'publisher-place', 'location', 'city']),
    volume: pick(fm, ['volume']),
    issue: pick(fm, ['issue', 'number']),
    pages: pick(fm, ['pages', 'page']),
    edition: pick(fm, ['edition']),
    doi: pick(fm, ['doi', 'DOI']),
    url: pick(fm, ['url', 'URL', 'link']),
    accessed: pick(fm, ['accessed', 'accessDate', 'access-date']),
  };
}

// The CSL-JSON item Pandoc reads with --citeproc. Only fields with a value
// are emitted, so a sparse note does not produce "null" in a bibliography.
export function toCslItem(source: Source): Record<string, unknown> {
  const item: Record<string, unknown> = {
    id: source.citekey, type: source.type, title: source.title, 'title-short': shortTitle(source.title),
  };
  const names = (list: SourceName[]) => list.map(n => n.literal ? { literal: n.literal } : { family: n.family, given: n.given });
  if (source.authors.length) item.author = names(source.authors);
  if (source.editors.length) item.editor = names(source.editors);
  if (source.year) item.issued = { 'date-parts': [[Number(source.year)]] };
  if (source.containerTitle) item['container-title'] = source.containerTitle;
  if (source.publisher) item.publisher = source.publisher;
  if (source.place) item['publisher-place'] = source.place;
  if (source.volume) item.volume = source.volume;
  if (source.issue) item.issue = source.issue;
  if (source.pages) item.page = source.pages;
  if (source.edition) item.edition = source.edition;
  if (source.doi) item.DOI = source.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (source.url) item.URL = source.url;
  if (source.accessed) {
    const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(source.accessed);
    item.accessed = m
      ? { 'date-parts': [[Number(m[1]), Number(m[2]), Number(m[3])]] }
      : { raw: source.accessed };
  }
  return item;
}

// The frontmatter the Add source form writes — the canonical spellings, so
// a note created here reads back through parseSource without aliases.
export interface NewSourceFields {
  type: SourceType;
  title: string;
  authors: string[];
  editors: string[];
  year: string;
  publisher: string;
  place: string;
  containerTitle: string;
  volume: string;
  issue: string;
  pages: string;
  url: string;
  doi: string;
  citekey: string;
}

export function sourceFrontmatter(fields: NewSourceFields): Record<string, unknown> {
  const fm: Record<string, unknown> = { citekey: fields.citekey, type: fields.type, title: fields.title };
  const authors = fields.authors.map(a => a.trim()).filter(a => a.length > 0);
  if (authors.length) fm.author = authors;
  const editors = fields.editors.map(a => a.trim()).filter(a => a.length > 0);
  if (editors.length) fm.editor = editors;
  const set = (key: string, value: string) => { const v = value.trim(); if (v) fm[key] = v; };
  const year = fields.year.trim();
  if (/^\d{4}$/.test(year)) fm.year = Number(year);
  else set('year', year);
  set('container-title', fields.containerTitle);
  set('publisher', fields.publisher);
  set('place', fields.place);
  set('volume', fields.volume);
  set('issue', fields.issue);
  set('pages', fields.pages);
  set('doi', fields.doi);
  set('url', fields.url);
  return fm;
}

// "Smith 2020 - The Long Argument" — a readable filename that sorts by
// author, trimmed to a length every filesystem accepts.
export function sourceFileBasename(fields: Pick<NewSourceFields, 'authors' | 'year' | 'title'>): string {
  const first = fields.authors.map(a => a.trim()).find(a => a.length > 0);
  const name = first ? parseName(first) : null;
  const lead = [name?.literal ?? name?.family ?? '', fields.year.trim()].filter(s => s.length > 0).join(' ');
  const raw = lead ? `${lead} - ${fields.title.trim()}` : fields.title.trim();
  const safe = raw.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();
  return (safe.length > 80 ? safe.slice(0, 80).replace(/[. ]+$/, '') : safe) || 'Source';
}
