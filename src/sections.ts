export interface JumpItem {
  title: string;
  id: string;
}

// Splits compiled markdown into sections at top-level `# ` headings while
// tracking fence state — a naive split also broke on `# ` lines inside
// fenced code blocks.
export function splitSections(content: string): string[] {
  const lines = content.split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (fenceMatch[1] === fence) fence = null;
    }
    if (fence === null && line.startsWith('# ') && current.length > 0) {
      sections.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) sections.push(current.join('\n'));
  return sections;
}

// IDs are positional, not derived from the title — slugging non-Latin titles
// (Chinese, Russian, Arabic, …) produced empty, colliding IDs.
export function sectionId(index: number): string {
  return `section-${index}`;
}

export function buildJumpItems(sections: string[]): JumpItem[] {
  const items: JumpItem[] = [];
  sections.forEach((section, index) => {
    const h1 = /^# (.+)/.exec(section);
    if (h1) items.push({ title: h1[1].trim(), id: sectionId(index) });
  });
  return items;
}
