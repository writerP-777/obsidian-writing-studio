import * as fs from 'fs';
import * as path from 'path';
import { stripForHelp } from '../src/HelpContent';

// The real README, not the test stub — the help view embeds this file.
const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf-8');

describe('in-app help built from the README', () => {
  const help = stripForHelp(readme);

  it('starts at Features and stops before Installation', () => {
    expect(help.startsWith('## Features')).toBe(true);
    expect(help).not.toMatch(/\n## (Installation|Requirements|Reporting a Bug|Security)\b/);
  });

  it('drops every relative-path image, Markdown and HTML alike (#394)', () => {
    expect(readme).toMatch(/<img src="assets\//); // the README does carry them
    expect(help).not.toMatch(/src="assets\//);
    expect(help).not.toMatch(/^!\[[^\]]*\]\((?!https?:\/\/)/m);
    expect(help).not.toMatch(/<p align="center">/);
  });

  it('keeps the prose around a figure intact', () => {
    expect(help).toContain('#### Outline');
    expect(help).toContain('| Column | What it shows |');
    expect(help).toContain('Every match has a checkbox');
  });

  it('strips a figure wherever it sits, including one before a code fence', () => {
    const sample = [
      '## Features', '', 'Intro.', '',
      '<p align="center">',
      '  <img src="assets/x.png" alt="x" width="560">',
      '  <br>',
      '  <em>Caption.</em>',
      '</p>', '',
      '```yaml', 'a: 1', '```', '',
      '![inline](assets/y.png)', '',
      '![remote](https://example.com/z.png)', '',
    ].join('\n');
    const out = stripForHelp(sample);
    expect(out).not.toContain('assets/x.png');
    expect(out).not.toContain('assets/y.png');
    expect(out).toContain('https://example.com/z.png');
    expect(out).toContain('```yaml\na: 1\n```');
  });
});
