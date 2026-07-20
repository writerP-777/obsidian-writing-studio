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

  // Han and kana have no inter-word spaces; count each character as one word
  // (the 字数 convention, matching Obsidian's core counter, #297). Hangul and
  // all other scripts keep the whitespace-split path below.
  const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
  const cjkCount = stripped.match(CJK_CHAR)?.length ?? 0;

  // Counted characters and full-width CJK punctuation (。、！ U+3000–U+303F,
  // fullwidth/halfwidth punctuation subranges of U+FF01–U+FF65) become word
  // boundaries and count zero; fullwidth letters and digits fall through.
  const residual = stripped
    .replace(CJK_CHAR, ' ')
    .replace(/[\u3000-\u303f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/g, ' ');

  return cjkCount + residual.split(/\s+/).filter(w => w.length > 0).length;
}
