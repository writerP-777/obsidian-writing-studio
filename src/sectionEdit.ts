// Split and merge for manuscript sections. Pure text work — the caller reads
// the files, decides where the new section goes in the binder, and writes
// the results. Both operations carry footnotes correctly: a split moves each
// reference-style definition to the half that uses it (and copies one both
// halves use), and a merge renumbers the second section's labels where they
// collide with the first's, so no reference is ever left pointing at the
// wrong note.

import { codeRanges, inRanges } from './mdMask';
import { replaceIllegalNameChars, stripTrailingDotsAndSpaces } from './folderRename';

export interface FrontmatterSplit {
  /** The leading `---` block with its delimiters and closing newline, or ''. */
  fm: string;
  body: string;
}

// `fm + body` round-trips the input byte for byte.
export function splitFrontmatter(text: string): FrontmatterSplit {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { fm: '', body: text };
  return { fm: m[0], body: text.slice(m[0].length) };
}

interface DefBlock {
  id: string;
  start: number;
  /** Exclusive; includes the block's trailing newline when there is one. */
  end: number;
  text: string;
}

// Reference-style footnote definitions with the continuation lines they
// own (indented lines, and a blank line between two indented lines) — the
// same ownership rule the export converter applies.
function footnoteDefinitions(body: string): DefBlock[] {
  const blocks: DefBlock[] = [];
  const lines = body.split('\n');
  const skip = codeRanges(body);
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const start = pos;
    pos += line.length + 1;
    const def = /^\[\^([^\]\s]+)\]:/.exec(line);
    if (!def || inRanges(skip, start)) continue;
    let end = Math.min(pos, body.length + 1);
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^(?: {2,}|\t)\S/.test(next)) {
        pos += next.length + 1;
        i++;
        end = pos;
      } else if (next.trim() === '' && i + 2 < lines.length && /^(?: {2,}|\t)\S/.test(lines[i + 2])) {
        pos += next.length + 1;
        i++;
      } else {
        break;
      }
    }
    end = Math.min(end, body.length);
    blocks.push({ id: def[1], start, end, text: body.slice(start, end).replace(/\n$/, '') });
  }
  return blocks;
}

// Footnote labels referenced (`[^id]`, never the `[^id]:` definition line)
// outside code.
function footnoteRefs(body: string): Set<string> {
  const ids = new Set<string>();
  const skip = codeRanges(body);
  const re = /\[\^([^\]\s]+)\](?!:)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!inRanges(skip, m.index)) ids.add(m[1]);
  }
  return ids;
}

function withoutRanges(text: string, ranges: { start: number; end: number }[]): string {
  let out = text;
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}

export interface SplitResult {
  head: string;
  tail: string;
}

// Splits a document at `offset` (an index into the full text, properties
// included). Everything from the offset on becomes the tail; the head keeps
// the properties. Null when the offset sits inside the properties block —
// there is nothing sensible to split there.
export function splitSection(text: string, offset: number): SplitResult | null {
  const { fm, body } = splitFrontmatter(text);
  if (offset < fm.length) return null;
  const at = Math.min(offset - fm.length, body.length);
  let headBody = body.slice(0, at);
  let tailBody = body.slice(at);

  const defs = footnoteDefinitions(body);
  const headDefs = defs.filter(d => d.end <= at);
  const tailDefs = defs.filter(d => d.start >= at).map(d => ({ ...d, start: d.start - at, end: d.end - at }));
  const headRefs = footnoteRefs(withoutRanges(headBody, headDefs));
  const tailRefs = footnoteRefs(withoutRanges(tailBody, tailDefs));

  const toTail: string[] = [];
  const removeFromHead: DefBlock[] = [];
  for (const d of headDefs) {
    if (!tailRefs.has(d.id)) continue;
    toTail.push(d.text);
    if (!headRefs.has(d.id)) removeFromHead.push(d);
  }
  const toHead: string[] = [];
  const removeFromTail: DefBlock[] = [];
  for (const d of tailDefs) {
    if (!headRefs.has(d.id)) continue;
    toHead.push(d.text);
    if (!tailRefs.has(d.id)) removeFromTail.push(d);
  }
  headBody = withoutRanges(headBody, removeFromHead);
  tailBody = withoutRanges(tailBody, removeFromTail);

  const assemble = (main: string, appended: string[]): string => {
    const parts = [main.trim(), ...appended].filter(p => p.length > 0);
    return parts.length ? parts.join('\n\n') + '\n' : '';
  };
  return {
    head: fm + assemble(headBody, toHead),
    tail: assemble(tailBody, toTail),
  };
}

const headingText = (line: string): string | null => {
  const m = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
  return m && m[1].trim() ? m[1].trim() : null;
};

// The title the split dialog offers: the heading the cursor sits on, or the
// heading the tail starts with, otherwise the current title numbered. The
// result is always a legal filename, since typed names are validated and
// never silently altered.
export function suggestSplitTitle(text: string, offset: number, currentTitle: string): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const cursorLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  let heading = headingText(cursorLine);
  if (!heading) {
    const firstTailLine = text.slice(offset).split('\n').find(l => l.trim() !== '');
    if (firstTailLine !== undefined) heading = headingText(firstTailLine);
  }
  const raw = heading ?? `${currentTitle} (2)`;
  return stripTrailingDotsAndSpaces(replaceIllegalNameChars(raw, '-')).trim() || `${currentTitle} (2)`;
}

export interface MergeOptions {
  /** When set, this title is inserted as a `##` heading where the two join. */
  headingTitle?: string | null;
}

function footnoteLabels(body: string): Set<string> {
  const ids = footnoteRefs(body);
  for (const d of footnoteDefinitions(body)) ids.add(d.id);
  return ids;
}

// Relabels every `[^id]` (references and definitions) in `body` per `map`,
// outside code, in one pass so a renamed label can never collide with one
// renamed later.
function relabelFootnotes(body: string, map: Map<string, string>): string {
  if (map.size === 0) return body;
  const skip = codeRanges(body);
  return body.replace(/\[\^([^\]\s]+)\]/g, (whole, id: string, index: number) => {
    if (inRanges(skip, index)) return whole;
    const next = map.get(id);
    return next ? `[^${next}]` : whole;
  });
}

// Appends the second section's text to the first. The first section's
// properties are kept and the second's dropped; footnote labels the two
// share are renumbered in the second (numeric labels continue the count,
// named ones get a `-2` suffix) so each note keeps its own text.
export function mergeSections(first: string, second: string, opts: MergeOptions = {}): string {
  const a = splitFrontmatter(first);
  const b = splitFrontmatter(second);

  const used = footnoteLabels(a.body);
  const bLabels = footnoteLabels(b.body);
  for (const l of bLabels) used.add(l);
  let nextNumber = 0;
  for (const l of used) {
    if (/^\d+$/.test(l)) nextNumber = Math.max(nextNumber, Number(l));
  }
  const map = new Map<string, string>();
  for (const l of bLabels) {
    if (!footnoteLabels(a.body).has(l)) continue;
    let candidate: string;
    if (/^\d+$/.test(l)) {
      candidate = String(++nextNumber);
    } else {
      let n = 2;
      candidate = `${l}-${n}`;
      while (used.has(candidate)) candidate = `${l}-${++n}`;
    }
    used.add(candidate);
    map.set(l, candidate);
  }
  const secondBody = relabelFootnotes(b.body, map);

  const heading = opts.headingTitle?.trim();
  const parts = [a.body.trim(), heading ? `## ${heading}` : '', secondBody.trim()].filter(p => p.length > 0);
  return a.fm + (parts.length ? parts.join('\n\n') + '\n' : '');
}
