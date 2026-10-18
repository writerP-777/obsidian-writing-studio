// Ranges of a markdown string that are code — fenced blocks and inline
// backtick spans — so citation and footnote scanning can leave them alone.
// A `[@key]` inside a code sample is documentation, not a citation.

export interface Range {
  start: number;
  end: number;
}

export function codeRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let pos = 0;
  let fence: { marker: string; start: number } | null = null;
  const lines = text.split('\n');
  for (const line of lines) {
    const lineEnd = pos + line.length;
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.marker[0] && fenceMatch[1].length >= fence.marker.length) {
        ranges.push({ start: fence.start, end: lineEnd });
        fence = null;
      }
    } else if (fenceMatch) {
      fence = { marker: fenceMatch[1], start: pos };
    } else {
      // Inline code: a run of N backticks closes at the next run of exactly N.
      const re = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        ranges.push({ start: pos + m.index, end: pos + m.index + m[0].length });
      }
    }
    pos = lineEnd + 1;
  }
  if (fence) ranges.push({ start: fence.start, end: text.length });
  return ranges;
}

export function inRanges(ranges: Range[], index: number): boolean {
  for (const r of ranges) {
    if (index >= r.start && index < r.end) return true;
  }
  return false;
}
