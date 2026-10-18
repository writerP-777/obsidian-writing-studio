import {
  parseSource, parseNames, parseName, parseYear, parseSourceType, generateCitekey, toCslItem,
  sourceFrontmatter, sourceFileBasename, Source,
} from '../src/sources';
import { findCitations, parseLocator, replaceCitations, toPandocCitation, CitationResolver } from '../src/citations';
import {
  authorDateInText, authorDateEntry, fullNote, shortNote, notesEntry, shortTitle, sortSources, yearSuffixes,
} from '../src/chicago';
import { extractFootnotes, expandFootnoteRefs, footnotesHtml } from '../src/footnotes';
import { renderCitations, preparePandocSections, citationReport, SourceLookup } from '../src/citeRender';
import { codeRanges } from '../src/mdMask';
import { inlineMarkdown } from '../src/markdown';

// ─── Fixtures: the four sources from the approved mock ──────────────────────

const smith = parseSource({
  citekey: 'smith2020', type: 'book', title: 'The Long Argument: Why Reform Fails',
  author: ['Jane Smith'], year: 2020, publisher: 'Riverhead', place: 'New York',
}, 'Research/Smith 2020 - The Long Argument.md') as Source;

const lee = parseSource({
  citekey: 'lee2018', type: 'chapter', title: 'Counting What Counts',
  author: 'Lee, Marcus', editor: 'Ana Ortiz', year: '2018', 'container-title': 'Measuring Institutions',
  pages: '44–71', publisher: 'University of Chicago Press', place: 'Chicago',
}, 'Research/Lee 2018.md') as Source;

const okafor = parseSource({
  citekey: 'okafor2021', itemType: 'journalArticle', title: 'Why Audits Drift',
  authors: [{ firstName: 'Chidi', lastName: 'Okafor' }, { family: 'Raman', given: 'Priya' }],
  date: '2021-06-01', publicationTitle: 'Journal of Public Administration',
  volume: 31, issue: 2, pages: '203–29', doi: '10.1000/jpa.2021.31',
}, 'Zotero/okafor2021.md') as Source;

const pew = parseSource({
  citekey: 'pew2023', type: 'webpage', title: 'Trust in Institutions',
  author: 'Pew Research Center', year: 2023, url: 'https://www.pewresearch.org/trust', accessed: 'March 3, 2026',
}, 'Research/Pew 2023.md') as Source;

const all = [smith, lee, okafor, pew];
const lookup: SourceLookup = {
  byKey: k => all.find(s => s.citekey === k) ?? null,
  hasKey: k => all.some(s => s.citekey === k),
  keyForLink: target => ({ 'Lee 2018': 'lee2018', 'Smith 2020': 'smith2020' })[target] ?? null,
};

// ─── Sources ─────────────────────────────────────────────────────────────────

describe('parseSource', () => {
  it('reads the canonical and the Zotero spellings into one shape', () => {
    expect(smith.authors).toEqual([{ family: 'Smith', given: 'Jane' }]);
    expect(lee.authors).toEqual([{ family: 'Lee', given: 'Marcus' }]);
    expect(lee.editors).toEqual([{ family: 'Ortiz', given: 'Ana' }]);
    expect(okafor.type).toBe('article-journal');
    expect(okafor.authors).toEqual([{ family: 'Okafor', given: 'Chidi' }, { family: 'Raman', given: 'Priya' }]);
    expect(okafor.year).toBe('2021');
    expect(okafor.containerTitle).toBe('Journal of Public Administration');
    expect(okafor.volume).toBe('31');
    expect(pew.authors[0].literal).toBe('Pew Research Center');
  });

  it('is null without a citekey', () => {
    expect(parseSource({ title: 'No key' }, 'x.md')).toBeNull();
    expect(parseSource(undefined, 'x.md')).toBeNull();
    expect(parseSource({ citekey: '  ' }, 'x.md')).toBeNull();
  });

  it('falls back to the filename as title', () => {
    expect(parseSource({ citekey: 'k' }, 'Research/Some Note.md')?.title).toBe('Some Note');
  });
});

describe('name and year parsing', () => {
  it('splits strings on and, semicolons, and ampersands', () => {
    expect(parseNames('Jane Smith and John Doe').map(n => n.family)).toEqual(['Smith', 'Doe']);
    expect(parseNames('Smith, Jane; Doe, John').map(n => n.given)).toEqual(['Jane', 'John']);
    expect(parseNames('A. Author & B. Writer').map(n => n.family)).toEqual(['Author', 'Writer']);
  });

  it('treats organizations, acronyms, and braced names as literal', () => {
    expect(parseName('UNESCO')?.literal).toBe('UNESCO');
    expect(parseName('World Health Organization')?.literal).toBe('World Health Organization');
    expect(parseName('{Jean Paul Group}')?.literal).toBe('Jean Paul Group');
    expect(parseName('Jean Paul Sartre')).toEqual({ family: 'Sartre', given: 'Jean Paul' });
  });

  it('finds a year in any date form', () => {
    expect(parseYear(2020)).toBe('2020');
    expect(parseYear('2021-06-01T00:00:00Z')).toBe('2021');
    expect(parseYear('circa 1999')).toBe('1999');
    expect(parseYear('n.d.')).toBeNull();
    expect(parseYear(new Date(2010, 0, 1))).toBe('2010');
  });

  it('maps type spellings and defaults unknowns to book', () => {
    expect(parseSourceType('bookSection')).toBe('chapter');
    expect(parseSourceType('article-journal')).toBe('article-journal');
    expect(parseSourceType('Newspaper Article')).toBe('article-newspaper');
    expect(parseSourceType('blogPost')).toBe('webpage');
    expect(parseSourceType('podcast')).toBe('book');
    expect(parseSourceType(undefined)).toBe('book');
  });
});

describe('generateCitekey', () => {
  it('builds surname+year, ASCII-folded, and suffixes on collision', () => {
    const taken = new Set(['smith2020', 'smith2020a']);
    expect(generateCitekey([{ family: 'Smith', given: 'Jane' }], '2020', 'T', new Set())).toBe('smith2020');
    expect(generateCitekey([{ family: 'Smith', given: 'Jane' }], '2020', 'T', taken)).toBe('smith2020b');
    expect(generateCitekey([{ family: 'Ólafsdóttir', given: 'A' }], null, 'T', new Set())).toBe('olafsdottir');
    expect(generateCitekey([], '2001', 'Trust in Institutions', new Set())).toBe('trust2001');
    expect(generateCitekey([{ family: 'Pew Research Center', given: '', literal: 'Pew Research Center' }], '2023', '', new Set())).toBe('pew2023');
  });
});

describe('CSL-JSON and new-source frontmatter', () => {
  it('emits only present fields with CSL names', () => {
    expect(toCslItem(okafor)).toEqual({
      id: 'okafor2021', type: 'article-journal', title: 'Why Audits Drift', 'title-short': 'Why Audits Drift',
      author: [{ family: 'Okafor', given: 'Chidi' }, { family: 'Raman', given: 'Priya' }],
      issued: { 'date-parts': [[2021]] }, 'container-title': 'Journal of Public Administration',
      volume: '31', issue: '2', page: '203–29', DOI: '10.1000/jpa.2021.31',
    });
    expect(toCslItem(pew).author).toEqual([{ literal: 'Pew Research Center' }]);
    expect(toCslItem(pew).accessed).toEqual({ raw: 'March 3, 2026' });
  });

  it('writes canonical keys that read back without aliases', () => {
    const fm = sourceFrontmatter({
      type: 'book', title: 'T', authors: ['Jane Smith', ''], editors: [], year: '2020', publisher: 'P', place: '',
      containerTitle: '', volume: '', issue: '', pages: '', url: '', doi: '', citekey: 'smith2020',
    });
    expect(fm).toEqual({ citekey: 'smith2020', type: 'book', title: 'T', author: ['Jane Smith'], year: 2020, publisher: 'P' });
    expect(parseSource(fm, 'x.md')?.authors[0].family).toBe('Smith');
  });

  it('names the file by author, year, and title, safely', () => {
    expect(sourceFileBasename({ authors: ['Jane Smith'], year: '2020', title: 'The Long Argument: Why Reform Fails' }))
      .toBe('Smith 2020 - The Long Argument- Why Reform Fails');
    expect(sourceFileBasename({ authors: [], year: '', title: 'Untitled?' })).toBe('Untitled-');
    expect(sourceFileBasename({ authors: [], year: '', title: '' })).toBe('Source');
  });
});

// ─── Citations ───────────────────────────────────────────────────────────────

describe('parseLocator', () => {
  it('recognizes page forms and keeps others verbatim', () => {
    expect(parseLocator('p. 12')).toEqual({ label: 'page', value: '12' });
    expect(parseLocator('pp. 12-14')).toEqual({ label: 'page', value: '12–14' });
    expect(parseLocator('12')).toEqual({ label: 'page', value: '12' });
    expect(parseLocator('chap. 3')).toEqual({ label: 'other', value: 'chap. 3' });
    expect(parseLocator('')).toBeNull();
  });
});

describe('findCitations', () => {
  const resolver: CitationResolver = lookup;

  it('finds bracketed, narrative, suppressed, multi-item, and wikilink citations', () => {
    const text = 'Ideas [@smith2020, p. 12]. As @okafor2021 show, [see @lee2018; -@smith2020] and [[Lee 2018|p. 51]] agree.';
    const found = findCitations(text, resolver);
    expect(found.map(c => c.raw)).toEqual([
      '[@smith2020, p. 12]', '@okafor2021', '[see @lee2018; -@smith2020]', '[[Lee 2018|p. 51]]',
    ]);
    expect(found[0].items[0].locator).toEqual({ label: 'page', value: '12' });
    expect(found[1].narrative).toBe(true);
    expect(found[2].items[0].prefix).toBe('see');
    expect(found[2].items[1].suppressAuthor).toBe(true);
    expect(found[3].items[0]).toMatchObject({ key: 'lee2018', locator: { label: 'page', value: '51' } });
  });

  it('ignores email addresses, unknown bare handles, embeds, plain wikilinks, and code', () => {
    const text = 'Mail don@example.com or @someone; see ![[Smith 2020]] and [[Other note]]. `[@smith2020]`\n\n```\n@okafor2021\n```\n';
    expect(findCitations(text, resolver)).toEqual([]);
  });

  it('reports a bracketed unknown key and leaves an unknown bare key alone', () => {
    const found = findCitations('[@nobody] and @nobody', resolver);
    expect(found.map(c => c.raw)).toEqual(['[@nobody]']);
  });

  it('stops a narrative key at trailing punctuation and keeps a Pandoc locator bracket', () => {
    const found = findCitations('As @smith2020. Then @smith2020 [p. 4].', resolver);
    expect(found.map(c => c.raw)).toEqual(['@smith2020', '@smith2020 [p. 4]']);
    expect(found[1].items[0].locator?.value).toBe('4');
  });

  it('re-emits Pandoc spelling for citeproc', () => {
    const found = findCitations('[[Lee 2018|pp. 51-52]] and @smith2020 [p. 4] and [see @okafor2021, chap. 2]', resolver);
    expect(replaceCitations('[[Lee 2018|pp. 51-52]] and @smith2020 [p. 4] and [see @okafor2021, chap. 2]', found, toPandocCitation))
      .toBe('[@lee2018, pp. 51–52] and @smith2020 [p. 4] and [see @okafor2021, chap. 2]');
  });
});

describe('codeRanges', () => {
  it('covers fences and inline spans only', () => {
    const text = 'a `b` c\n```\nd\n```\ne';
    expect(codeRanges(text)).toEqual([{ start: 2, end: 5 }, { start: 8, end: 17 }]);
  });
});

// ─── Chicago formatter: the approved mock, verbatim ─────────────────────────

describe('Chicago author-date', () => {
  const none = new Map<string, string>();
  const by = (k: string) => lookup.byKey(k);

  it('formats parenthetical, narrative, multi-item, and suppressed citations', () => {
    expect(authorDateInText([{ key: 'smith2020', prefix: '', locator: { label: 'page', value: '12' }, suffix: '', suppressAuthor: false }], by, none, false))
      .toBe('(Smith 2020, 12)');
    expect(authorDateInText([{ key: 'okafor2021', prefix: '', locator: null, suffix: '', suppressAuthor: false }], by, none, true))
      .toBe('Okafor and Raman (2021)');
    expect(authorDateInText([
      { key: 'lee2018', prefix: 'see', locator: null, suffix: '', suppressAuthor: false },
      { key: 'smith2020', prefix: '', locator: null, suffix: '', suppressAuthor: true },
    ], by, none, false)).toBe('(see Lee 2018; 2020)');
    expect(authorDateInText([{ key: 'pew2023', prefix: '', locator: null, suffix: '', suppressAuthor: false }], by, none, false))
      .toBe('(Pew Research Center 2023)');
    expect(authorDateInText([{ key: 'nobody', prefix: '', locator: null, suffix: '', suppressAuthor: false }], by, none, false))
      .toBe('([@nobody?])');
  });

  it('renders the four works-cited entries from the mock', () => {
    expect(authorDateEntry(lee)).toBe('Lee, Marcus. 2018. “Counting What Counts.” In *Measuring Institutions*, edited by Ana Ortiz, 44–71. Chicago: University of Chicago Press.');
    expect(authorDateEntry(okafor)).toBe('Okafor, Chidi, and Priya Raman. 2021. “Why Audits Drift.” *Journal of Public Administration* 31 (2): 203–29. https://doi.org/10.1000/jpa.2021.31.');
    expect(authorDateEntry(pew)).toBe('Pew Research Center. 2023. “Trust in Institutions.” Accessed March 3, 2026. https://www.pewresearch.org/trust.');
    expect(authorDateEntry(smith)).toBe('Smith, Jane. 2020. *The Long Argument: Why Reform Fails*. New York: Riverhead.');
  });

  it('sorts by author, then year, then title, and disambiguates same author-year', () => {
    const smithB = { ...smith, citekey: 'smith2020b', title: 'Another Book' };
    expect(sortSources([smith, pew, okafor, lee, smithB]).map(s => s.citekey))
      .toEqual(['lee2018', 'okafor2021', 'pew2023', 'smith2020b', 'smith2020']);
    const suffixes = yearSuffixes([smith, smithB, lee]);
    expect(suffixes.get('smith2020b')).toBe('a');
    expect(suffixes.get('smith2020')).toBe('b');
    expect(suffixes.has('lee2018')).toBe(false);
    expect(authorDateEntry(smith, 'b')).toMatch(/^Smith, Jane\. 2020b\./);
  });

  it('handles sparse sources without stray punctuation', () => {
    const bare = parseSource({ citekey: 'x', title: 'Only a Title' }, 'x.md') as Source;
    expect(authorDateEntry(bare)).toBe('*Only a Title*. n.d.');
    expect(authorDateInText([{ key: 'x', prefix: '', locator: null, suffix: '', suppressAuthor: false }], () => bare, none, false))
      .toBe('(Only a Title n.d.)');
  });
});

describe('Chicago notes', () => {
  const p = (v: string) => ({ label: 'page' as const, value: v });

  it('renders full notes from the mock', () => {
    expect(fullNote(smith, p('12'))).toBe('Jane Smith, *The Long Argument: Why Reform Fails* (New York: Riverhead, 2020), 12.');
    expect(fullNote(okafor, null)).toBe('Chidi Okafor and Priya Raman, “Why Audits Drift,” *Journal of Public Administration* 31, no. 2 (2021): 203–29.');
    expect(fullNote(lee, p('51'))).toBe('Marcus Lee, “Counting What Counts,” in *Measuring Institutions*, ed. Ana Ortiz (Chicago: University of Chicago Press, 2018), 51.');
    expect(fullNote(pew, null)).toBe('Pew Research Center, “Trust in Institutions,” 2023, https://www.pewresearch.org/trust.');
  });

  it('renders short notes with shortened titles', () => {
    expect(shortNote(smith, p('40'))).toBe('Smith, *Long Argument*, 40.');
    expect(shortNote(lee, null)).toBe('Lee, “Counting What Counts.”');
    expect(shortTitle('A Very Long Title With Many Words Indeed')).toBe('Very Long Title With');
  });

  it('renders bibliography entries with the year at the end', () => {
    expect(notesEntry(lee)).toBe('Lee, Marcus. “Counting What Counts.” In *Measuring Institutions*, edited by Ana Ortiz, 44–71. Chicago: University of Chicago Press, 2018.');
    expect(notesEntry(smith)).toBe('Smith, Jane. *The Long Argument: Why Reform Fails*. New York: Riverhead, 2020.');
    expect(notesEntry(okafor)).toBe('Okafor, Chidi, and Priya Raman. “Why Audits Drift.” *Journal of Public Administration* 31, no. 2 (2021): 203–29. https://doi.org/10.1000/jpa.2021.31.');
  });
});

// ─── Footnotes ───────────────────────────────────────────────────────────────

describe('extractFootnotes', () => {
  it('numbers references in order of appearance and lifts definitions', () => {
    const md = 'First.[^b] Second.[^a] Again.[^b] Inline.^[An *inline* note.]\n\n[^a]: Note A.\n[^b]: Note B\n    continues here.\n\nTail.';
    const { body, notes } = extractFootnotes(md);
    expect(notes).toEqual([
      { n: 1, text: 'Note B continues here.' },
      { n: 2, text: 'Note A.' },
      { n: 3, text: 'An *inline* note.' },
    ]);
    expect(body).toBe('First.\u0001fn:1\u0001 Second.\u0001fn:2\u0001 Again.\u0001fn:1\u0001 Inline.\u0001fn:3\u0001\n\nTail.');
  });

  it('leaves unknown references and code untouched', () => {
    const { body, notes } = extractFootnotes('See [^nope] and `[^x]`.\n\n[^x]: Defined.');
    expect(notes).toEqual([]);
    expect(body).toBe('See [^nope] and `[^x]`.');
  });

  it('keeps nested brackets inside an inline note', () => {
    const { notes } = extractFootnotes('A^[See [the site](http://x) now.] B');
    expect(notes[0].text).toBe('See [the site](http://x) now.');
  });

  it('expands tokens to superscript links and renders the list', () => {
    const html = expandFootnoteRefs('<p>Hi\u0001fn:1\u0001</p>', 'c1');
    expect(html).toBe('<p>Hi<sup class="ws-fn-ref" id="fnref-c1-1"><a href="#fn-c1-1">1</a></sup></p>');
    const list = footnotesHtml([{ n: 1, text: 'A *b*' }], 'c1', inlineMarkdown, { epub: true, returnLabel: 'Back' });
    expect(list).toBe('<ol class="ws-footnotes">\n<li id="fn-c1-1" epub:type="footnote">A <em>b</em> <a href="#fnref-c1-1" class="ws-fn-back" aria-label="Back">↩</a></li>\n</ol>');
    expect(footnotesHtml([], 'c1', inlineMarkdown)).toBe('');
  });
});

// ─── Rendering pipeline ──────────────────────────────────────────────────────

const labels = { worksCited: 'Works cited', bibliography: 'Bibliography' };
const paragraph = 'Reform rarely fails for lack of good ideas [@smith2020, p. 12]. As @okafor2021\nshow, audits drift toward what is easy to count, a pattern [[Lee 2018|p. 51]]\ndocuments in the schools data.[^1]\n\n[^1]: The 2016 cohort was excluded because the records are incomplete.';

describe('renderCitations', () => {
  it('author-date: cites in place and appends Works cited', () => {
    const r = renderCitations({ sections: ['# Title', paragraph], style: 'author-date', sources: lookup, labels, headingLevel: 1 });
    expect(r.sections[1]).toBe('Reform rarely fails for lack of good ideas (Smith 2020, 12). As Okafor and Raman (2021)\nshow, audits drift toward what is easy to count, a pattern (Lee 2018, 51)\ndocuments in the schools data.[^1]\n\n[^1]: The 2016 cohort was excluded because the records are incomplete.');
    expect(r.references).toBe([
      '# Works cited', '',
      'Lee, Marcus. 2018. “Counting What Counts.” In *Measuring Institutions*, edited by Ana Ortiz, 44–71. Chicago: University of Chicago Press.', '',
      'Okafor, Chidi, and Priya Raman. 2021. “Why Audits Drift.” *Journal of Public Administration* 31 (2): 203–29. https://doi.org/10.1000/jpa.2021.31.', '',
      'Smith, Jane. 2020. *The Long Argument: Why Reform Fails*. New York: Riverhead.',
    ].join('\n'));
    expect(r.cited).toEqual(['smith2020', 'okafor2021', 'lee2018']);
    expect(r.citationCount).toBe(3);
    expect(r.unresolved).toEqual([]);
  });

  it('notes: full note first, short note after, per section, with the bibliography', () => {
    const second = 'Again [@smith2020, p. 40].';
    const r = renderCitations({ sections: [paragraph, second], style: 'notes', sources: lookup, labels, headingLevel: 1 });
    expect(r.sections[0]).toContain('ideas.^[Jane Smith, *The Long Argument: Why Reform Fails* (New York: Riverhead, 2020), 12.]');
    expect(r.sections[0]).toContain('As Okafor and Raman^[Chidi Okafor and Priya Raman, “Why Audits Drift,” *Journal of Public Administration* 31, no. 2 (2021): 203–29.]');
    // A new section starts over with the full form
    expect(r.sections[1]).toBe('Again.^[Jane Smith, *The Long Argument: Why Reform Fails* (New York: Riverhead, 2020), 40.]');
    expect(r.references).toContain('# Bibliography');
    expect(r.references).toContain('Smith, Jane. *The Long Argument: Why Reform Fails*. New York: Riverhead, 2020.');
  });

  it('notes: a repeat in the same section uses the short form and moves punctuation before the note', () => {
    const r = renderCitations({ sections: ['One [@smith2020, p. 12]. Two [@smith2020, p. 40].'], style: 'notes', sources: lookup, labels, headingLevel: 1 });
    expect(r.sections[0]).toBe('One.^[Jane Smith, *The Long Argument: Why Reform Fails* (New York: Riverhead, 2020), 12.] Two.^[Smith, *Long Argument*, 40.]');
  });

  it('leaves unresolved keys visible and reports them', () => {
    const r = renderCitations({ sections: ['See [@ghost2001].'], style: 'author-date', sources: lookup, labels, headingLevel: 1 });
    expect(r.sections[0]).toBe('See ([@ghost2001?]).');
    expect(r.unresolved).toEqual(['ghost2001']);
    expect(r.references).toBeNull();
  });

  it('citationReport counts without rendering', () => {
    expect(citationReport([paragraph, '[@ghost2001] [@smith2020]'], lookup))
      .toEqual({ citationCount: 5, sourceCount: 3, unresolved: ['ghost2001'] });
  });
});

describe('preparePandocSections', () => {
  it('normalizes citations to Pandoc syntax, appends the refs div, and returns CSL items', () => {
    const r = preparePandocSections([paragraph], lookup, 'author-date', labels, 1);
    expect(r.sections[0]).toContain('[@smith2020, p. 12]');
    expect(r.sections[0]).toContain('As @okafor2021\nshow');
    expect(r.sections[0]).toContain('a pattern [@lee2018, p. 51]\ndocuments');
    expect(r.sections[1]).toBe('# Works cited\n\n::: {#refs}\n:::');
    expect(r.items.map(i => i.id)).toEqual(['smith2020', 'okafor2021', 'lee2018']);
  });

  it('adds nothing when nothing is cited', () => {
    const r = preparePandocSections(['Plain prose.'], lookup, 'notes', labels, 1);
    expect(r.sections).toEqual(['Plain prose.']);
    expect(r.items).toEqual([]);
  });
});
