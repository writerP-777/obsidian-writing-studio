// Footnotes for the built-in converter. Reference-style notes (`[^id]` with a
// `[^id]: text` definition anywhere in the section) and inline notes
// (`^[text]`) are pulled out of a section, numbered in order of first
// reference, and handed back as a list; each reference in the body becomes a
// token that survives HTML escaping and is swapped for a superscript link
// after conversion.

import { codeRanges, inRanges } from './mdMask';
import { inlineMarkdown, markdownToHtml } from './markdown';

export interface Footnote {
  n: number;
  // Markdown inline content — one paragraph.
  text: string;
}

export interface FootnoteExtraction {
  body: string;
  notes: Footnote[];
}

const TOKEN = '\u0001';
const tokenFor = (n: number): string => `${TOKEN}fn:${n}${TOKEN}`;
const TOKEN_RE = new RegExp(`${TOKEN}fn:(\\d+)${TOKEN}`, 'g');

// Finds the `]` that closes an inline note opened at `open`, honoring nested
// brackets; -1 when unbalanced.
function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function extractFootnotes(md: string): FootnoteExtraction {
  // 1. Lift definitions out. A definition owns the lines after it that are
  //    indented, and a blank line between indented lines; the note is one
  //    paragraph, so continuation lines join with a space.
  const defs = new Map<string, string>();
  const kept: string[] = [];
  const lines = md.split('\n');
  const skipDefs = codeRanges(md);
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = pos;
    pos += line.length + 1;
    const def = /^\[\^([^\]\s]+)\]:\s?(.*)$/.exec(line);
    if (!def || inRanges(skipDefs, lineStart)) { kept.push(line); continue; }
    const parts = [def[2].trim()];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^(?: {2,}|\t)\S/.test(next)) {
        parts.push(next.trim());
        pos += next.length + 1;
        i++;
      } else if (next.trim() === '' && i + 2 < lines.length && /^(?: {2,}|\t)\S/.test(lines[i + 2])) {
        pos += next.length + 1;
        i++;
      } else {
        break;
      }
    }
    defs.set(def[1], parts.filter(p => p.length > 0).join(' '));
  }
  let body = kept.join('\n');

  // 2. Number references in order of appearance; inline notes define
  //    themselves. Unknown references stay as typed.
  const notes: Footnote[] = [];
  const numberFor = new Map<string, number>();
  const skip = codeRanges(body);
  let out = '';
  let i = 0;
  while (i < body.length) {
    if (inRanges(skip, i)) { out += body[i]; i++; continue; }
    if (body.startsWith('^[', i)) {
      const close = closingBracket(body, i + 1);
      if (close > 0) {
        const text = body.slice(i + 2, close).trim();
        const n = notes.length + 1;
        notes.push({ n, text });
        out += tokenFor(n);
        i = close + 1;
        continue;
      }
    }
    if (body.startsWith('[^', i)) {
      const close = body.indexOf(']', i + 2);
      const id = close > 0 ? body.slice(i + 2, close) : '';
      if (id && !/[\s\]]/.test(id) && body[close + 1] !== ':' && defs.has(id)) {
        let n = numberFor.get(id);
        if (n === undefined) {
          n = notes.length + 1;
          numberFor.set(id, n);
          notes.push({ n, text: defs.get(id) ?? '' });
        }
        out += tokenFor(n);
        i = close + 1;
        continue;
      }
    }
    out += body[i];
    i++;
  }
  body = out.replace(/\n{3,}/g, '\n\n').trim();
  return { body, notes };
}

// Swaps reference tokens for superscript links. `scope` keeps ids unique
// across chapters that each restart at 1.
export function expandFootnoteRefs(html: string, scope: string, epub = false): string {
  const type = epub ? ' epub:type="noteref"' : '';
  return html.replace(TOKEN_RE, (_m, n: string) =>
    `<sup class="ws-fn-ref" id="fnref-${scope}-${n}"><a${type} href="#fn-${scope}-${n}">${n}</a></sup>`);
}

// The notes list for one scope. `inline` is the inline-markdown converter;
// `epub` adds the semantics EPUB readers use to show notes as popups.
export function footnotesHtml(
  notes: Footnote[],
  scope: string,
  inline: (md: string) => string,
  opts: { epub?: boolean; returnLabel: string } = { returnLabel: '↩' },
): string {
  if (notes.length === 0) return '';
  const items = notes.map(n => {
    const back = `<a href="#fnref-${scope}-${n.n}" class="ws-fn-back" aria-label="${opts.returnLabel}">↩</a>`;
    const type = opts.epub ? ' epub:type="footnote"' : '';
    return `<li id="fn-${scope}-${n.n}"${type}>${inline(n.text)} ${back}</li>`;
  });
  return `<ol class="ws-footnotes">\n${items.join('\n')}\n</ol>`;
}

export interface SectionHtml {
  bodyHtml: string;
  // The section's notes list, or '' when it has none.
  notesHtml: string;
  noteCount: number;
}

// One compiled section to HTML with its footnotes numbered from 1. The notes
// list is returned separately so HTML and Manuscript can gather every
// section's notes at the end while EPUB keeps each chapter's with it.
export function renderSectionHtml(md: string, scope: string, opts: { epub?: boolean; returnLabel: string }): SectionHtml {
  const { body, notes } = extractFootnotes(md);
  return {
    bodyHtml: expandFootnoteRefs(markdownToHtml(body), scope, opts.epub === true),
    notesHtml: footnotesHtml(notes, scope, inlineMarkdown, opts),
    noteCount: notes.length,
  };
}
