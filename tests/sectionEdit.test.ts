import { mergeSections, splitFrontmatter, splitSection, suggestSplitTitle } from '../src/sectionEdit';

describe('splitFrontmatter', () => {
  it('separates a leading properties block and round-trips', () => {
    const text = '---\nbinder-order: 10\n---\n\n# Title\n\nBody.\n';
    const { fm, body } = splitFrontmatter(text);
    expect(fm).toBe('---\nbinder-order: 10\n---\n');
    expect(body).toBe('\n# Title\n\nBody.\n');
    expect(fm + body).toBe(text);
  });

  it('treats a document without properties as all body', () => {
    expect(splitFrontmatter('Just text.')).toEqual({ fm: '', body: 'Just text.' });
  });
});

describe('splitSection', () => {
  const doc = '---\nbinder-order: 10\nbinder-status: draft\n---\n\n## One\n\nFirst part.\n\n## Two\n\nSecond part.\n';

  it('moves everything from the offset into the tail and keeps the properties on the head', () => {
    const at = doc.indexOf('## Two');
    const r = splitSection(doc, at);
    expect(r).not.toBeNull();
    expect(r?.head).toBe('---\nbinder-order: 10\nbinder-status: draft\n---\n## One\n\nFirst part.\n');
    expect(r?.tail).toBe('## Two\n\nSecond part.\n');
  });

  it('splits in the middle of a line when that is where the cursor is', () => {
    const r = splitSection('Alpha beta gamma', 6);
    expect(r?.head).toBe('Alpha\n');
    expect(r?.tail).toBe('beta gamma\n');
  });

  it('refuses an offset inside the properties block', () => {
    expect(splitSection(doc, 5)).toBeNull();
  });

  it('moves a footnote definition used only by the tail, copies one both halves use, keeps the rest', () => {
    const text = [
      'Head cites one.[^a] And both.[^both]',
      '',
      '[^a]: Only the head.',
      '[^b]: Only the tail.',
      '[^both]: Shared note',
      '    with a continuation line.',
      '',
      'Tail cites b.[^b] And both again.[^both]',
      '',
    ].join('\n');
    const at = text.indexOf('Tail cites');
    const r = splitSection(text, at);
    expect(r?.head).toBe([
      'Head cites one.[^a] And both.[^both]',
      '',
      '[^a]: Only the head.',
      '[^both]: Shared note',
      '    with a continuation line.',
      '',
    ].join('\n'));
    expect(r?.tail).toBe([
      'Tail cites b.[^b] And both again.[^both]',
      '',
      '[^b]: Only the tail.',
      '',
      '[^both]: Shared note',
      '    with a continuation line.',
      '',
    ].join('\n'));
  });

  it('brings a definition that sits in the tail back to the head when only the head uses it', () => {
    const text = 'Head.[^x]\n\nTail text.\n\n[^x]: Note x.\n';
    const r = splitSection(text, text.indexOf('Tail'));
    expect(r?.head).toBe('Head.[^x]\n\n[^x]: Note x.\n');
    expect(r?.tail).toBe('Tail text.\n');
  });

  it('leaves definitions inside code blocks alone', () => {
    const text = 'Head.\n\n```\n[^c]: not a note\n```\n\nTail.[^c]\n';
    const r = splitSection(text, text.indexOf('Tail'));
    expect(r?.head).toBe('Head.\n\n```\n[^c]: not a note\n```\n');
    expect(r?.tail).toBe('Tail.[^c]\n');
  });
});

describe('suggestSplitTitle', () => {
  it('offers the heading the cursor sits on', () => {
    const text = '# Intro\n\n## The case for a second reading\n\nText.';
    expect(suggestSplitTitle(text, text.indexOf('second'), 'Chapter 3')).toBe('The case for a second reading');
  });

  it('offers the heading the tail starts with when the cursor is on the blank line before it', () => {
    const text = 'Text.\n\n## Next part ##\n\nMore.';
    expect(suggestSplitTitle(text, text.indexOf('\n\n## Next') + 1, 'Chapter 3')).toBe('Next part');
  });

  it('numbers the current title when no heading is near', () => {
    expect(suggestSplitTitle('Plain text here.', 6, 'Chapter 3')).toBe('Chapter 3 (2)');
  });

  it('turns a heading into a legal filename', () => {
    const text = '## Why: "reform" fails? \n\nText.';
    expect(suggestSplitTitle(text, 3, 'Ch')).toBe('Why- -reform- fails-');
  });
});

describe('mergeSections', () => {
  it('appends the second body after one blank line and keeps only the first properties', () => {
    const first = '---\nbinder-order: 10\nsynopsis: A\n---\n\nFirst body.\n';
    const second = '---\nbinder-order: 20\nsynopsis: B\n---\n\nSecond body.\n';
    expect(mergeSections(first, second)).toBe('---\nbinder-order: 10\nsynopsis: A\n---\nFirst body.\n\nSecond body.\n');
  });

  it('inserts the second title as a heading when asked', () => {
    expect(mergeSections('One.\n', 'Two.\n', { headingTitle: 'Part Two' })).toBe('One.\n\n## Part Two\n\nTwo.\n');
  });

  it('renumbers colliding footnote labels in the second section', () => {
    const first = 'A.[^1] B.[^note]\n\n[^1]: First one.\n[^note]: First named.\n';
    const second = 'C.[^1] D.[^2] E.[^note]\n\n[^1]: Second one.\n[^2]: Second two.\n[^note]: Second named.\n';
    expect(mergeSections(first, second)).toBe([
      'A.[^1] B.[^note]',
      '',
      '[^1]: First one.',
      '[^note]: First named.',
      '',
      'C.[^3] D.[^2] E.[^note-2]',
      '',
      '[^3]: Second one.',
      '[^2]: Second two.',
      '[^note-2]: Second named.',
      '',
    ].join('\n'));
  });

  it('handles an empty first body', () => {
    expect(mergeSections('---\na: 1\n---\n', 'Text.\n')).toBe('---\na: 1\n---\nText.\n');
  });
});
