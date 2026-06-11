import { markdownToHtml, inlineMarkdown } from '../src/markdown';

describe('inlineMarkdown', () => {
  it('converts images before links', () => {
    expect(inlineMarkdown('![alt text](img.png)')).toBe('<img src="img.png" alt="alt text">');
  });

  it('converts bold, italic, code, and links', () => {
    expect(inlineMarkdown('**b** *i* `c` [t](u)')).toBe(
      '<strong>b</strong> <em>i</em> <code>c</code> <a href="u">t</a>'
    );
  });

  it('escapes raw HTML', () => {
    expect(inlineMarkdown('<script>')).toBe('&lt;script&gt;');
  });
});

describe('markdownToHtml tables', () => {
  it('converts a pipe table with header and body', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Ada | 36 |';
    const html = markdownToHtml(md);
    expect(html).toContain('<thead><tr><th>Name</th><th>Age</th></tr></thead>');
    expect(html).toContain('<tr><td>Ada</td><td>36</td></tr>');
  });

  it('supports alignment colons in the separator row', () => {
    const md = '| L | R |\n| :--- | ---: |\n| a | b |';
    expect(markdownToHtml(md)).toContain('<th>L</th>');
  });

  it('a table followed by a paragraph closes cleanly', () => {
    const md = '| A |\n| --- |\n| 1 |\n\nAfter.';
    const html = markdownToHtml(md);
    expect(html).toContain('</table>');
    expect(html).toContain('<p>After.</p>');
  });

  it('inline markdown works inside cells', () => {
    const md = '| H |\n| --- |\n| **bold** |';
    expect(markdownToHtml(md)).toContain('<td><strong>bold</strong></td>');
  });
});

describe('markdownToHtml blocks', () => {
  it('converts unordered lists', () => {
    expect(markdownToHtml('- one\n- two')).toBe('<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>');
  });

  it('converts fenced code without inline processing', () => {
    const html = markdownToHtml('```js\nconst x = 1;\n```');
    expect(html).toBe('<pre><code class="language-js">const x = 1;</code></pre>');
  });

  it('keeps hr distinct from table separator rows', () => {
    expect(markdownToHtml('---')).toBe('<hr>');
  });

  it('converts an image on its own line inside a paragraph', () => {
    expect(markdownToHtml('![cover](c.png)')).toBe('<p><img src="c.png" alt="cover"></p>');
  });
});
