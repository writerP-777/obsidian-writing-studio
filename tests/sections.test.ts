import { splitSections, buildJumpItems, sectionId } from '../src/sections';

describe('splitSections', () => {
  it('splits at top-level h1 headings', () => {
    const md = '# One\nbody one\n# Two\nbody two';
    expect(splitSections(md)).toEqual(['# One\nbody one', '# Two\nbody two']);
  });

  it('keeps leading non-heading content as its own section', () => {
    const md = 'intro text\n# One\nbody';
    expect(splitSections(md)).toEqual(['intro text', '# One\nbody']);
  });

  it('does not split on # lines inside fenced code blocks', () => {
    const md = '# One\n```\n# not a heading\n```\n# Two\nbody';
    expect(splitSections(md)).toEqual(['# One\n```\n# not a heading\n```', '# Two\nbody']);
  });

  it('does not split inside tilde fences', () => {
    const md = '# One\n~~~\n# hidden\n~~~\n# Two';
    expect(splitSections(md)).toEqual(['# One\n~~~\n# hidden\n~~~', '# Two']);
  });

  it('handles fences with language tags', () => {
    const md = '# One\n```bash\n# comment\n```\n# Two';
    expect(splitSections(md)).toEqual(['# One\n```bash\n# comment\n```', '# Two']);
  });

  it('returns a single section for content without headings', () => {
    expect(splitSections('plain text')).toEqual(['plain text']);
  });

  it('handles a heading-only section with no body', () => {
    expect(splitSections('# Solo')).toEqual(['# Solo']);
  });
});

describe('buildJumpItems', () => {
  it('assigns positional ids that match section indexes', () => {
    const sections = splitSections('# One\nbody\n# Two\nbody');
    expect(buildJumpItems(sections)).toEqual([
      { title: 'One', id: sectionId(0) },
      { title: 'Two', id: sectionId(1) },
    ]);
  });

  it('produces unique ids for non-Latin titles', () => {
    const sections = splitSections('# 第一章\nbody\n# 第二章\nbody\n# Глава\nbody');
    const items = buildJumpItems(sections);
    expect(items.map(i => i.title)).toEqual(['第一章', '第二章', 'Глава']);
    const ids = items.map(i => i.id);
    expect(new Set(ids).size).toBe(3);
    ids.forEach(id => expect(id).not.toBe(''));
  });

  it('skips sections that do not start with an h1', () => {
    const sections = splitSections('intro\n# One\nbody');
    const items = buildJumpItems(sections);
    expect(items).toEqual([{ title: 'One', id: sectionId(1) }]);
  });

  it('handles a heading with no trailing newline', () => {
    const items = buildJumpItems(splitSections('# Solo'));
    expect(items).toEqual([{ title: 'Solo', id: sectionId(0) }]);
  });
});
