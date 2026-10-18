// Turns a compiled manuscript's citations into text. Two consumers:
//
// - renderCitations: the built-in paths (HTML, Manuscript, EPUB, Markdown,
//   compile preview). Author-date citations become "(Smith 2020, 12)" in
//   place; notes-style citations become inline footnotes `^[…]` so the
//   footnote converter numbers them with the writer's own notes, full form
//   on a source's first appearance in each section and short form after.
//   A final section carries the works-cited list or bibliography.
// - preparePandocSections: the Pandoc paths. Wikilink citations are
//   rewritten in Pandoc's spelling, a references div is appended, and the
//   cited sources are returned as CSL-JSON for --citeproc.

import { findCitations, replaceCitations, toPandocCitation, Citation, CitationResolver } from './citations';
import {
  CitationStyle, authorDateInText, authorDateEntry, fullNote, shortNote, notesEntry, namesInText,
  sortSources, yearSuffixes,
} from './chicago';
import { Source, toCslItem } from './sources';

export interface SourceLookup extends CitationResolver {
  byKey(key: string): Source | null;
}

export interface CiteLabels {
  worksCited: string;
  bibliography: string;
}

export interface RenderCitationsOptions {
  sections: string[];
  style: CitationStyle;
  sources: SourceLookup;
  labels: CiteLabels;
  // Heading level of the references section — the level document titles use.
  headingLevel: number;
}

export interface RenderedCitations {
  sections: string[];
  // Markdown for the references section, or null when nothing was cited.
  references: string | null;
  cited: string[];
  unresolved: string[];
  citationCount: number;
}

export interface CitationReport {
  citationCount: number;
  sourceCount: number;
  unresolved: string[];
}

function scan(sections: string[], resolver: CitationResolver): Citation[][] {
  return sections.map(s => findCitations(s, resolver));
}

function collect(found: Citation[][], resolver: CitationResolver): CitationReport & { cited: string[] } {
  const cited: string[] = [];
  const unresolved: string[] = [];
  let citationCount = 0;
  for (const list of found) {
    for (const c of list) {
      citationCount++;
      for (const item of c.items) {
        if (resolver.hasKey(item.key)) {
          if (!cited.includes(item.key)) cited.push(item.key);
        } else if (!unresolved.includes(item.key)) {
          unresolved.push(item.key);
        }
      }
    }
  }
  return { citationCount, sourceCount: cited.length, unresolved, cited };
}

// What the export dialog shows before anyone exports.
export function citationReport(sections: string[], resolver: CitationResolver): CitationReport {
  const { citationCount, sourceCount, unresolved } = collect(scan(sections, resolver), resolver);
  return { citationCount, sourceCount, unresolved };
}

// A note marker follows the sentence's punctuation with no space before it:
// "ideas [@smith]." becomes "ideas.^[…]". A narrative citation keeps the
// author's name in the sentence and hangs the marker on it.
function replaceAsNotes(
  text: string,
  citations: Citation[],
  render: (c: Citation) => { who: string; note: string },
): string {
  let out = '';
  let pos = 0;
  for (const c of citations) {
    const { who, note } = render(c);
    let before = text.slice(pos, c.start);
    let end = c.end;
    if (who) {
      out += `${before}${who}${note}`;
    } else {
      while (before.endsWith(' ') || before.endsWith('\t')) before = before.slice(0, -1);
      const punct = /^[.,;:!?]/.exec(text.slice(end, end + 1));
      if (punct && text[end + 1] !== '.') {
        end += 1;
        out += `${before}${punct[0]}${note}`;
      } else {
        out += `${before}${note}`;
      }
    }
    pos = end;
  }
  return out + text.slice(pos);
}

const heading = (level: number, text: string): string => `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`;

export function renderCitations(opts: RenderCitationsOptions): RenderedCitations {
  const { sources, style } = opts;
  const found = scan(opts.sections, sources);
  const report = collect(found, sources);
  const citedSources = report.cited.map(k => sources.byKey(k)).filter((s): s is Source => s !== null);
  const suffixes = style === 'author-date' ? yearSuffixes(citedSources) : new Map<string, string>();

  const sections = opts.sections.map((text, i) => {
    if (style === 'author-date') {
      return replaceCitations(text, found[i], c =>
        authorDateInText(c.items, k => sources.byKey(k), suffixes, c.narrative));
    }
    // Notes style: the first time a source is cited in a section it gets the
    // full note; later citations in the same section use the short form.
    const seen = new Set<string>();
    return replaceAsNotes(text, found[i], c => {
      const notes = c.items.map(item => {
        const s = sources.byKey(item.key);
        if (!s) return `[@${item.key}?]`;
        const note = seen.has(s.citekey) ? shortNote(s, item.locator) : fullNote(s, item.locator);
        seen.add(s.citekey);
        const prefix = item.prefix ? `${item.prefix.charAt(0).toUpperCase()}${item.prefix.slice(1)} ` : '';
        const body = prefix ? `${prefix}${note.charAt(0).toLowerCase()}${note.slice(1)}` : note;
        return item.suffix ? `${body.replace(/\.$/, '')}, ${item.suffix}.` : body;
      });
      const first = sources.byKey(c.items[0].key);
      const who = c.narrative && first ? namesInText(first.authors.length ? first.authors : first.editors) : '';
      return { who, note: `^[${notes.join(' ')}]` };
    });
  });

  let references: string | null = null;
  if (citedSources.length > 0) {
    const entries = sortSources(citedSources).map(s =>
      style === 'author-date' ? authorDateEntry(s, suffixes.get(s.citekey) ?? '') : notesEntry(s));
    const title = style === 'author-date' ? opts.labels.worksCited : opts.labels.bibliography;
    references = `${heading(opts.headingLevel, title)}\n\n${entries.join('\n\n')}`;
  }

  return {
    sections,
    references,
    cited: report.cited,
    unresolved: report.unresolved,
    citationCount: report.citationCount,
  };
}

export interface PandocPreparation {
  sections: string[];
  // CSL-JSON items for every cited source — Pandoc prints only what is cited.
  items: Record<string, unknown>[];
  cited: string[];
  unresolved: string[];
  citationCount: number;
}

export function preparePandocSections(
  sections: string[],
  sources: SourceLookup,
  style: CitationStyle,
  labels: CiteLabels,
  headingLevel: number,
): PandocPreparation {
  const found = scan(sections, sources);
  const report = collect(found, sources);
  const out = sections.map((text, i) => replaceCitations(text, found[i], toPandocCitation));
  const items = report.cited.map(k => sources.byKey(k)).filter((s): s is Source => s !== null).map(toCslItem);
  if (items.length > 0) {
    const title = style === 'author-date' ? labels.worksCited : labels.bibliography;
    out.push(`${heading(headingLevel, title)}\n\n::: {#refs}\n:::`);
  }
  return { sections: out, items, cited: report.cited, unresolved: report.unresolved, citationCount: report.citationCount };
}
