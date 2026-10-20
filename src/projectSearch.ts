// Project-wide find and replace, as pure text work: locate matches in one
// document (properties and code left alone), rebuild the text with a chosen
// subset replaced, and plan an undo that restores only the files nobody has
// touched since. The dialog reads and writes the files.

import { codeRanges, inRanges } from './mdMask';
import { splitFrontmatter } from './sectionEdit';

export interface SearchQuery {
  find: string;
  matchCase: boolean;
  wholeWord: boolean;
}

export interface TextMatch {
  /** Offsets into the full text, properties included. */
  start: number;
  end: number;
  /** Zero-based line of the match, for jumping the editor to it. */
  line: number;
  /** The match with up to CONTEXT characters of its line either side. */
  before: string;
  hit: string;
  after: string;
}

const CONTEXT = 40;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function queryRegExp(q: SearchQuery): RegExp | null {
  if (!q.find) return null;
  const core = escapeRegExp(q.find);
  const source = q.wholeWord ? `(?<![\\p{L}\\p{N}_])${core}(?![\\p{L}\\p{N}_])` : core;
  return new RegExp(source, q.matchCase ? 'gu' : 'giu');
}

export function findMatches(text: string, q: SearchQuery): TextMatch[] {
  const re = queryRegExp(q);
  if (!re) return [];
  const { fm, body } = splitFrontmatter(text);
  const skip = codeRanges(body);
  const out: TextMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (inRanges(skip, m.index)) continue;
    const start = m.index;
    const end = start + m[0].length;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const lineEndRaw = body.indexOf('\n', end);
    const lineEnd = lineEndRaw === -1 ? body.length : lineEndRaw;
    const beforeFull = body.slice(lineStart, start);
    const afterFull = body.slice(end, lineEnd);
    const line = (fm + body.slice(0, start)).split('\n').length - 1;
    out.push({
      start: fm.length + start,
      end: fm.length + end,
      line,
      before: beforeFull.length > CONTEXT ? '…' + beforeFull.slice(-CONTEXT) : beforeFull,
      hit: m[0],
      after: afterFull.length > CONTEXT ? afterFull.slice(0, CONTEXT) + '…' : afterFull,
    });
  }
  return out;
}

// Rebuilds the text with the given (non-overlapping) spans replaced.
export function replaceMatches(text: string, spans: { start: number; end: number }[], replacement: string): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue;
    out += text.slice(pos, s.start) + replacement;
    pos = s.end;
  }
  return out + text.slice(pos);
}

export interface ReplaceRecord {
  path: string;
  before: string;
  after: string;
}

export interface UndoPlan {
  restore: { path: string; content: string }[];
  /** Files left alone because their content no longer matches the replace result. */
  skipped: string[];
}

// Undo restores a file only when it still holds exactly what the replace
// wrote — an edit made since is never overwritten.
export function planUndo(records: ReplaceRecord[], current: (path: string) => string | null): UndoPlan {
  const plan: UndoPlan = { restore: [], skipped: [] };
  for (const r of records) {
    const now = current(r.path);
    if (now === r.after) plan.restore.push({ path: r.path, content: r.before });
    else plan.skipped.push(r.path);
  }
  return plan;
}
