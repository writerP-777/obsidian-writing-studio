// Pure ordering engine for the filesystem-owned binder (ADR 0001).
//
// One number line per sibling group: a document's `binder-order` frontmatter
// value and a folder's numeric name prefix compete on the same axis, so
// `binder-order: 15` sorts before a folder named `020~ Part One`. Anything
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

// `020~ Part One` → order 20, display "Part One". The tilde delimiter is the
// collision guard (#239): no human numbering convention produces
// `digits + ~ + space`, so a typed name like `2023 files` or `020 Part One`
// is always a plain name — displayed in full, never rewritten. The one
// accepted residual (ruling on #239): a user who deliberately types the
// marker syntax (`007~ Bond`) is read as ordered.
export function parseFolderPrefix(name: string): FolderPrefixParse {
  const m = /^(-?\d+)~ (\S.*)$/.exec(name);
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

// ─── Reorder planning (#227) ─────────────────────────────────────────────────

// Only markdown documents (frontmatter) and folders (name prefix) can carry
// an order value; everything else is permanently unordered.
export function canCarryOrder(entry: SiblingEntry): boolean {
  return entry.isFolder || entry.extension === 'md';
}

// The on-disk folder name for a given order: three-digit zero-padded marker
// (`020~ Part One`), replacing any existing marker — the typed remainder is
// never altered. Negative orders (legal from planReorder's front insertion)
// pad the magnitude so they round-trip through parseFolderPrefix. Never
// touches documents.
export function folderNameWithPrefix(name: string, order: number): string {
  const marker = order < 0
    ? '-' + String(-order).padStart(3, '0')
    : String(order).padStart(3, '0');
  return marker + '~ ' + parseFolderPrefix(name).displayName;
}

export interface ReorderWrite {
  /** Index into the new sequence of the entry receiving a value. */
  index: number;
  order: number;
}

// Given the desired sibling sequence (the dragged entry already placed at
// movedIndex), compute the minimal order writes that make sortSiblings
// reproduce it. Lazy by design: one write when the position is expressible
// against ordered neighbors — midpoint in a gap ≥ 2, `next − 10` at the
// start (negative values are valid and sort correctly), `prev + 10` at the
// end or against the unordered tail. When the position is not expressible
// (unordered neighbors, exhausted gap, duplicate values), the whole group
// materializes as 10/20/30 in sequence order — writing only entries whose
// value actually differs, and never a non-carrier.
export function planReorder(sequence: SiblingEntry[], movedIndex: number): ReorderWrite[] {
  const moved = sequence[movedIndex];
  if (!moved || !canCarryOrder(moved)) return [];

  const prev = movedIndex > 0 ? sequence[movedIndex - 1] : null;
  const next = movedIndex < sequence.length - 1 ? sequence[movedIndex + 1] : null;
  const prevOrder = prev ? effectiveOrder(prev) : null;
  const nextOrder = next ? effectiveOrder(next) : null;

  if (!prev && !next) {
    return effectiveOrder(moved) === 10 ? [] : [{ index: movedIndex, order: 10 }];
  }
  if (!prev) {
    // Any ordered value sorts before the unordered tail, so a missing
    // nextOrder still admits a single write
    const order = nextOrder !== null ? nextOrder - 10 : 10;
    return effectiveOrder(moved) === order ? [] : [{ index: movedIndex, order }];
  }
  if (prevOrder !== null && (!next || nextOrder === null)) {
    const order = prevOrder + 10;
    return effectiveOrder(moved) === order ? [] : [{ index: movedIndex, order }];
  }
  if (prevOrder !== null && nextOrder !== null && nextOrder - prevOrder >= 2) {
    const order = Math.floor((prevOrder + nextOrder) / 2);
    return effectiveOrder(moved) === order ? [] : [{ index: movedIndex, order }];
  }

  // Unordered neighbors or exhausted gap: materialize the sibling group
  const writes: ReorderWrite[] = [];
  let value = 10;
  for (let i = 0; i < sequence.length; i++) {
    const entry = sequence[i];
    if (!canCarryOrder(entry)) continue;
    if (effectiveOrder(entry) !== value) writes.push({ index: i, order: value });
    value += 10;
  }
  return writes;
}
