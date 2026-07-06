// Pure carry-over plan engine (ADR 0001 migration, slice 6 — #230).
//
// Given an immutable legacy _binder.json plus current disk state, computes
// the complete deterministic operation list: folders to create for legacy
// groups/parts, one final target per document (move + rename-to-title +
// order in a single atomic renameFile target), and the frontmatter writes.
// Nothing here executes anything — #231 owns execution.
//
// Precedence ruling (#230 Q1): existing frontmatter always wins — a key is
// written only when absent, and a folder that already carries a tilde marker
// keeps it. This is what makes re-runs safe: legacy-wins would silently
// revert user edits made between runs.
//
// Purity ruling (#230 Q5): plan-internal collisions (two legacy items
// computing the same target) suffix deterministically by legacy order; a
// foreign file occupying a pending item's target is an anomaly, never a
// suffix — a disk-dependent suffix would compute different targets across
// runs and break the pending/done classification.

import { BinderData, BinderItem } from '../models/BinderItem';
import { parseFolderPrefix, folderNameWithPrefix, naturalCompare } from './binderOrder';
import { parseBinderStatus, parseBinderType } from './binderMenu';

// The one window onto the vault the engine is allowed: existence checks and
// frontmatter reads. No handle that could write is ever passed in.
export interface DiskState {
  fileExists(path: string): boolean;
  folderExists(path: string): boolean;
  /** On-disk names of the folders directly inside `parentPath`. */
  subfolderNames(parentPath: string): string[];
  /** Frontmatter of the markdown file at `path`, or null when unreadable. */
  frontmatter(path: string): Record<string, unknown> | null;
}

// Reads the legacy binder without any of loadBinder's machinery — no cache,
// no corrupt-file backup write. A carry-over preview must be provably
// read-only, so it never goes near the runtime loader.
export function parseLegacyBinder(content: string): BinderData | null {
  try {
    const data = JSON.parse(content) as BinderData;
    return Array.isArray(data?.items) ? data : null;
  } catch {
    return null;
  }
}

// Deterministic repair of a legacy title into a legal filename component
// (#230 Q4): illegal characters deleted, whitespace runs collapsed, trailing
// dots and spaces stripped. An empty result means the title is unusable —
// the caller keeps the original name instead.
export function sanitizeTitle(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

// Windows rejects these name stems regardless of extension (CON.md fails
// like CON), for folders and files alike. Seeded into the collision
// namespace (#230, Cowork addition 2) so no computed target can be rejected
// by the filesystem at execution.
const RESERVED_STEMS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function isReservedStem(stem: string): boolean {
  return RESERVED_STEMS.test(stem);
}

export interface CarryOverFmEntry {
  key: 'binder-order' | 'binder-status' | 'binder-type' | 'word-count-goal' | 'binder-compile';
  value: number | string | boolean;
  /** True when the key already has a value — the write is skipped (Q1). */
  kept: boolean;
}

export interface CarryOverFolderOp {
  kind: 'folder';
  legacyTitle: string;
  /** Name after sanitizing and collision resolution, marker stripped. */
  displayName: string;
  /** Final on-disk name — the adopted name when done, minted when pending. */
  targetName: string;
  targetPath: string;
  state: 'done' | 'pending';
  suffixed: boolean;
  reserved: boolean;
}

export type DocAnomaly = 'missing' | 'target-occupied';

export interface CarryOverDocOp {
  kind: 'doc';
  originalPath: string;
  finalPath: string;
  state: 'done' | 'pending' | 'anomaly';
  anomaly?: DocAnomaly;
  suffixed: boolean;
  reserved: boolean;
  titleUnusable: boolean;
  /** Empty for anomalies — an item that needs attention is left untouched. */
  frontmatter: CarryOverFmEntry[];
}

export interface CarryOverCounts {
  total: number;
  done: number;
  pending: number;
  anomalies: number;
}

export interface CarryOverPlan {
  folderOps: CarryOverFolderOp[];
  docOps: CarryOverDocOp[];
  counts: CarryOverCounts;
}

// A frontmatter row renders (and counts) only when there is something to
// say; it is pending when any key still needs writing, otherwise done.
export function fmRowState(op: CarryOverDocOp): 'done' | 'pending' | null {
  if (op.frontmatter.length === 0) return null;
  return op.frontmatter.some(e => !e.kept) ? 'pending' : 'done';
}

export function planHasWork(plan: CarryOverPlan): boolean {
  return plan.counts.pending > 0 || plan.counts.anomalies > 0;
}

const isStructural = (item: BinderItem): boolean =>
  item.type === 'group' || item.type === 'part';

// Legacy binders can nest children under documents; a filesystem document
// cannot contain documents, so a document's children flatten into its own
// sibling group immediately after it — order preserved, nothing guessed.
function expandSiblings(items: BinderItem[]): BinderItem[] {
  const out: BinderItem[] = [];
  for (const item of items) {
    out.push(item);
    if (!isStructural(item) && item.children?.length) {
      out.push(...expandSiblings(item.children));
    }
  }
  return out;
}

// Claims the first free name for `stem` in a sibling namespace: the stem
// itself, else `stem 2`, `stem 3`, … (legacy order decides who claims
// first). Reserved stems can never be claimed, so a reserved title flows
// into the same suffix series (`CON` → `CON 2`).
function claimStem(
  claimed: Set<string>,
  stem: string,
  ext: string,
): { stem: string; suffixed: boolean; reserved: boolean } {
  const reserved = isReservedStem(stem);
  let candidate = stem;
  let n = 1;
  while (isReservedStem(candidate) || claimed.has((candidate + ext).toLowerCase())) {
    n += 1;
    candidate = `${stem} ${n}`;
  }
  claimed.add((candidate + ext).toLowerCase());
  return { stem: candidate, suffixed: candidate !== stem && !reserved, reserved };
}

export function planCarryOver(
  items: BinderItem[],
  projectFolderPath: string,
  disk: DiskState,
): CarryOverPlan {
  const folderOps: CarryOverFolderOp[] = [];
  const docOps: CarryOverDocOp[] = [];
  walkGroup(items, projectFolderPath, disk, folderOps, docOps);

  const counts: CarryOverCounts = { total: 0, done: 0, pending: 0, anomalies: 0 };
  for (const op of folderOps) {
    counts.total += 1;
    if (op.state === 'done') counts.done += 1;
    else counts.pending += 1;
  }
  for (const op of docOps) {
    counts.total += 1;
    if (op.state === 'done') counts.done += 1;
    else if (op.state === 'pending') counts.pending += 1;
    else counts.anomalies += 1;
    const fmState = fmRowState(op);
    if (fmState !== null) {
      counts.total += 1;
      if (fmState === 'done') counts.done += 1;
      else counts.pending += 1;
    }
  }
  return { folderOps, docOps, counts };
}

function walkGroup(
  items: BinderItem[],
  parentPath: string,
  disk: DiskState,
  folderOps: CarryOverFolderOp[],
  docOps: CarryOverDocOp[],
): void {
  const expanded = expandSiblings(items);
  // One number line per sibling group (ADR 0001): documents and folders
  // share the 10/20/30 sequence in legacy order.
  const claimedFiles = new Set<string>();
  const claimedDisplays = new Set<string>();
  const consumedAdoptees = new Set<string>();
  const existingFolders = disk.subfolderNames(parentPath);

  let position = 0;
  for (const item of expanded) {
    position += 10;
    if (isStructural(item)) {
      const op = planFolder(item, position, parentPath, existingFolders, claimedDisplays, consumedAdoptees);
      folderOps.push(op);
      walkGroup(item.children ?? [], op.targetPath, disk, folderOps, docOps);
    } else {
      docOps.push(planDoc(item, position, parentPath, disk, claimedFiles));
    }
  }
}

function planFolder(
  item: BinderItem,
  position: number,
  parentPath: string,
  existingFolders: string[],
  claimedDisplays: Set<string>,
  consumedAdoptees: Set<string>,
): CarryOverFolderOp {
  const base = sanitizeTitle(item.title) || 'Untitled';
  const { stem: displayName, suffixed, reserved } = claimStem(claimedDisplays, base, '');

  // Adoption (Q1 for folders): an existing folder whose display name matches
  // is this item's folder — done, on-disk name kept as-is (marker included,
  // never re-minted). Renaming a folder carries its children, so adopting by
  // display name is what keeps re-runs classifying correctly after the user
  // reorders. Tiebreak when several match: the exact minted name, then any
  // marker-carrying name, then natural order.
  const minted = folderNameWithPrefix(displayName, position);
  const candidates = existingFolders.filter(n =>
    !consumedAdoptees.has(n) &&
    parseFolderPrefix(n).displayName.toLowerCase() === displayName.toLowerCase());
  candidates.sort((a, b) => {
    if ((a === minted) !== (b === minted)) return a === minted ? -1 : 1;
    const aMarked = parseFolderPrefix(a).order !== null;
    const bMarked = parseFolderPrefix(b).order !== null;
    if (aMarked !== bMarked) return aMarked ? -1 : 1;
    return naturalCompare(a, b);
  });

  const adopted = candidates.length > 0 ? candidates[0] : null;
  if (adopted !== null) consumedAdoptees.add(adopted);
  const targetName = adopted ?? minted;
  return {
    kind: 'folder',
    legacyTitle: item.title,
    displayName,
    targetName,
    targetPath: `${parentPath}/${targetName}`,
    state: adopted !== null ? 'done' : 'pending',
    suffixed,
    reserved,
  };
}

function planDoc(
  item: BinderItem,
  position: number,
  parentPath: string,
  disk: DiskState,
  claimedFiles: Set<string>,
): CarryOverDocOp {
  const originalPath = (item.filePath || '').replace(/\\/g, '/');
  const basename = originalPath.split('/').pop() ?? '';
  const extIdx = basename.lastIndexOf('.');
  const ext = extIdx > 0 ? basename.slice(extIdx) : '.md';

  let stem = sanitizeTitle(item.title);
  const titleUnusable = stem === '';
  if (titleUnusable) {
    stem = (extIdx > 0 ? basename.slice(0, extIdx) : basename) || 'Untitled';
  }
  const { stem: resolvedStem, suffixed, reserved } = claimStem(claimedFiles, stem, ext);
  const finalPath = `${parentPath}/${resolvedStem}${ext}`;

  const atOriginal = originalPath !== '' && disk.fileExists(originalPath);
  const atFinal = disk.fileExists(finalPath);
  let state: CarryOverDocOp['state'];
  let anomaly: DocAnomaly | undefined;
  if (finalPath === originalPath && atFinal) {
    state = 'done';
  } else if (atOriginal && atFinal) {
    // A foreign file occupies the target (Q5) — never suffix around it
    state = 'anomaly';
    anomaly = 'target-occupied';
  } else if (atOriginal) {
    state = 'pending';
  } else if (atFinal) {
    state = 'done';
  } else {
    state = 'anomaly';
    anomaly = 'missing';
  }

  return {
    kind: 'doc',
    originalPath,
    finalPath,
    state,
    anomaly,
    suffixed,
    reserved,
    titleUnusable,
    frontmatter: state === 'anomaly'
      ? []
      : planFrontmatter(item, position, disk, state === 'pending' ? originalPath : finalPath),
  };
}

function planFrontmatter(
  item: BinderItem,
  position: number,
  disk: DiskState,
  currentPath: string,
): CarryOverFmEntry[] {
  const fm = disk.frontmatter(currentPath) ?? {};
  const kept = (key: string): boolean => fm[key] !== undefined && fm[key] !== null;
  const entries: CarryOverFmEntry[] = [];

  entries.push({ key: 'binder-order', value: position, kept: kept('binder-order') });
  const status = parseBinderStatus(item.status);
  if (status !== null) {
    entries.push({ key: 'binder-status', value: status, kept: kept('binder-status') });
  }
  const docType = parseBinderType(item.type);
  if (docType !== null) {
    entries.push({ key: 'binder-type', value: docType, kept: kept('binder-type') });
  }
  if (typeof item.wordCountGoal === 'number' && Number.isFinite(item.wordCountGoal) && item.wordCountGoal > 0) {
    entries.push({ key: 'word-count-goal', value: item.wordCountGoal, kept: kept('word-count-goal') });
  }
  // Q2: a legacy compile exclusion survives; inclusion stays expressed by
  // key absence (#229 — re-include deletes the key, never writes true)
  if (item.includeInExport === false) {
    entries.push({ key: 'binder-compile', value: false, kept: kept('binder-compile') });
  }
  return entries;
}
