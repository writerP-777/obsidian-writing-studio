// Single word-count definition shared by every surface (binder, status bar,
// sidebar tooltip, manuscript title page) — three diverging counters
// previously showed different numbers for the same file.
export function countWords(content: string): number {
  // Strip frontmatter (tolerate CRLF files)
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // Strip markdown syntax
  const stripped = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\n/g, ' ')
    .trim();

  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(w => w.length > 0).length;
}
