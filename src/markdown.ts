// Shared block-level Markdown → HTML converter, used by the HTML, manuscript,
// and EPUB export paths and by WordPress publishing. Handles ATX headings,
// paragraphs, unordered/ordered lists, blockquotes, fenced code blocks,
// horizontal rules, pipe tables, images, links, bold/italic, and inline code.
// Known limitations (documented in the README): nested lists, setext
// headings, and footnotes are not converted.

// Converts inline markdown spans (images, bold, italic, code, links) within
// a text node. HTML-escapes first, so raw HTML in prose stays inert.
export function inlineMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function markdownToHtml(md: string): string {
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  const blockquoteLines: string[] = [];
  let inCodeFence = false;
  const codeLines: string[] = [];
  let codeLang = '';
  const tableRows: string[][] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join(' ').trim();
    if (text) blocks.push(`<p>${text}</p>`);
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listType) return;
    const tag = listType;
    blocks.push(`<${tag}>\n${listItems.map(i => `  <li>${i}</li>`).join('\n')}\n</${tag}>`);
    listItems.length = 0;
    listType = null;
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length === 0) return;
    const inner = blockquoteLines.join(' ').trim();
    blocks.push(`<blockquote><p>${inner}</p></blockquote>`);
    blockquoteLines.length = 0;
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    let header: string[] | null = null;
    let body = tableRows;
    if (tableRows.length >= 2 && tableRows[1].every(c => /^:?-{3,}:?$/.test(c))) {
      header = tableRows[0];
      body = tableRows.slice(2);
    }
    const cell = (c: string, tag: 'th' | 'td') => `<${tag}>${inlineMarkdown(c)}</${tag}>`;
    const parts: string[] = ['<table>'];
    if (header) {
      parts.push(`<thead><tr>${header.map(c => cell(c, 'th')).join('')}</tr></thead>`);
    }
    if (body.length > 0) {
      parts.push(`<tbody>\n${body.map(r => `<tr>${r.map(c => cell(c, 'td')).join('')}</tr>`).join('\n')}\n</tbody>`);
    }
    parts.push('</table>');
    blocks.push(parts.join('\n'));
    tableRows.length = 0;
  };

  const flushAll = () => { flushParagraph(); flushList(); flushBlockquote(); flushTable(); };

  for (const line of md.split('\n')) {
    // Fenced code block open / close
    if (/^```/.test(line)) {
      if (!inCodeFence) {
        flushAll();
        inCodeFence = true;
        codeLang = line.slice(3).trim();
      } else {
        const escaped = codeLines.join('\n')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
        blocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
        codeLines.length = 0;
        codeLang = '';
        inCodeFence = false;
      }
      continue;
    }
    if (inCodeFence) { codeLines.push(line); continue; }

    // Pipe table row (must run before the hr check — separator rows
    // like |---|---| would otherwise never be seen)
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph(); flushList(); flushBlockquote();
      tableRows.push(line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      continue;
    }
    flushTable();

    // Horizontal rule
    if (/^---+$/.test(line)) {
      flushParagraph(); flushList(); flushBlockquote();
      blocks.push('<hr>');
      continue;
    }

    // ATX headings
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      flushParagraph(); flushList(); flushBlockquote();
      const lvl = hm[1].length;
      blocks.push(`<h${lvl}>${inlineMarkdown(hm[2])}</h${lvl}>`);
      continue;
    }

    // Unordered list item (-, *, +)
    const ulm = line.match(/^[-*+]\s+(.+)$/);
    if (ulm) {
      flushParagraph(); flushBlockquote();
      if (listType === 'ol') flushList();
      listType = 'ul';
      listItems.push(inlineMarkdown(ulm[1]));
      continue;
    }

    // Ordered list item (1. 2. etc.)
    const olm = line.match(/^\d+\.\s+(.+)$/);
    if (olm) {
      flushParagraph(); flushBlockquote();
      if (listType === 'ul') flushList();
      listType = 'ol';
      listItems.push(inlineMarkdown(olm[1]));
      continue;
    }

    // Blockquote
    const bqm = line.match(/^>\s?(.*)$/);
    if (bqm) {
      flushParagraph(); flushList();
      blockquoteLines.push(inlineMarkdown(bqm[1]));
      continue;
    }

    // Blank line — close any open block
    if (line.trim() === '') {
      flushParagraph(); flushList(); flushBlockquote();
      continue;
    }

    // Regular paragraph line — close any open list/blockquote first
    flushList(); flushBlockquote();
    paragraphLines.push(inlineMarkdown(line));
  }

  flushAll();
  return blocks.join('\n');
}
