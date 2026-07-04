// Pure ordering engine for the filesystem-owned binder (ADR 0001).
//
// One number line per sibling group: a document's `binder-order` frontmatter
// value and a folder's numeric name prefix compete on the same axis, so
// `binder-order: 15` sorts before a folder named `020 Part One`. Anything
// without a value natural-sorts at the end of its group, after every ordered
// sibling — an untouched folder is therefore pure natural sort. Ties resolve
// by natural display-name comparison, then documents before folders.

export interface SiblingEntry {
  /** On-disk name — folder name, or file name including extension. */
  name: string;
  isFolder: boolean;
  /** File extension without the dot; undefined for folders. */
  extension?: string;
  /** `binder-order` frontmatter value for documents; null when absent. */
  binderOrder: number | null;
}

export interface FolderPrefixParse {
  /** Parsed order, or null when the name carries no prefix. */
  order: number | null;
  /** Name with the prefix stripped — what the binder displays. */
  displayName: string;
}

// `020 Part One` → order 20, display "Part One". The prefix is digits
// followed by whitespace followed by a non-empty rest — a purely numeric
// name like `2026` (blog year folders) is a name, not a prefix.
export function parseFolderPrefix(name: string): FolderPrefixParse {
  const m = /^(\d+)\s+(\S.*)$/.exec(name);
  if (!m) return { order: null, displayName: name };
  return { order: parseInt(m[1], 10), displayName: m[2] };
}

// Plugin plumbing (`_project.json`, `_binder.json`) and dotfiles are hidden
// from every binder zone and excluded from all counts.
export function isHiddenName(name: string): boolean {
  return name.startsWith('_') || name.startsWith('.');
}

// Frontmatter arrives untyped; only a finite number is an order value.
// Anything else (strings, arrays, booleans) means unordered — never guess.
export function parseBinderOrder(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// A folder's order comes from its name prefix; a document carries its own.
export function effectiveOrder(entry: SiblingEntry): number | null {
  return entry.isFolder ? parseFolderPrefix(entry.name).order : entry.binderOrder;
}

// What the binder shows: folders lose their numeric prefix, markdown files
// lose their extension (the filename is the title), and every other file
// keeps its full name so its type stays evident.
export function entryDisplayName(entry: SiblingEntry): string {
  if (entry.isFolder) return parseFolderPrefix(entry.name).displayName;
  if (entry.extension === 'md') {
    return entry.name.slice(0, entry.name.length - '.md'.length);
  }
  return entry.name;
}

// Numeric-aware, case-insensitive — "Chapter 2" sorts before "Chapter 10".
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function compareSiblings(a: SiblingEntry, b: SiblingEntry): number {
  const ao = effectiveOrder(a);
  const bo = effectiveOrder(b);
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  const byName = naturalCompare(entryDisplayName(a), entryDisplayName(b));
  if (byName !== 0) return byName;
  if (a.isFolder !== b.isFolder) return a.isFolder ? 1 : -1;
  return 0;
}

export function sortSiblings<T extends SiblingEntry>(entries: T[]): T[] {
  return [...entries].sort(compareSiblings);
}
