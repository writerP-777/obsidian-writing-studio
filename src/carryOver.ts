// Pure silent-migration engine (ADR 0001 migration, slices 6+7 — #230/#231).
//
// Given an immutable legacy _binder.json plus current disk state, computes
// the deterministic operation list that reproduces the legacy hierarchy as
// real folders on disk: legacy groups/parts become folders (created with
// minted tilde markers, or adopted by display name), documents move into
// them keeping their basenames, and per-document metadata lands in
// frontmatter. The inverse plan (restore the previous layout) is computed
// from the same immutable source — no journal exists in either direction.
//
// Hard rules from the #231 record:
// - A document's basename is NEVER altered — no rename-to-title, no
//   sanitizer, no suffixes, no reserved-name handling for documents.
// - Same-basename collision (R1): the first claimant in legacy depth-first
//   order moves; later claimants are permanent leftovers — they keep their
//   name and place and get their binder-order in their ACTUAL folder.
// - Precedence (Q1, #230): existing frontmatter always wins — a key is
//   written only when absent; a folder already carrying a marker keeps it.
// - Reserved folder titles resolve via the marker itself: `010~ CON` is not
//   a reserved stem, and the displayed name stays exactly as typed.

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
// no corrupt-file backup write. Migration must be provably read-only toward
// _binder.json, so it never goes near the runtime loader.
export function parseLegacyBinder(content: string): BinderData | null {
  try {
    const data = JSON.parse(content) as BinderData;
    return Array.isArray(data?.items) ? data : null;
  } catch {
    return null;
  }
}

// Deterministic repair of a legacy structural title into a legal folder-name
// component: illegal characters deleted, whitespace runs collapsed, trailing
// dots and spaces stripped. Documents never pass through here.
export function sanitizeTitle(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

export interface CarryOverFmEntry {
  key: 'binder-order' | 'binder-status' | 'binder-type' | 'word-count-goal' | 'binder-compile';
  value: number | string | boolean;
  /** True when the key already has a value — the write is skipped (Q1). */
  kept: boolean;
}

// none = already in final form; create = new folder at targetPath;
// attach-marker = in-place rename of an adopted plain folder to carry order.
export type FolderAction = 'none' | 'create' | 'attach-marker';

export interface CarryOverFolderOp {
  kind: 'folder';
  legacyTitle: string;
  displayName: string;
  /** On-disk path today (attach-marker only). */
  currentPath: string | null;
  targetName: string;
  targetPath: string;
  action: FolderAction;
}

// done: at its final path. pending: at its original path, move ahead.
// leftover (R1): permanent — target basename taken, stays where it is.
// missing: at neither path — logged, never guessed.
export type DocState = 'done' | 'pending' | 'leftover' | 'missing';

export interface CarryOverDocOp {
  kind: 'doc';
  originalPath: string;
  finalPath: string;
  state: DocState;
  /** binder-order value; for a leftover it ranks within its ACTUAL folder. */
  order: number;
  /** Non-order metadata (status/type/goal/compile), write-if-absent. */
  frontmatter: CarryOverFmEntry[];
  /** True when binder-order at the write location is already set (Q1). */
  orderKept: boolean;
}

export interface CarryOverPlan {
  folderOps: CarryOverFolderOp[];
  docOps: CarryOverDocOp[];
}

// Where a document's frontmatter belongs right now: a pending document is
// still at its original path; done lives at final; a leftover stays put.
export function docCurrentPath(op: CarryOverDocOp): string | null {
  if (op.state === 'missing') return null;
  return op.state === 'done' ? op.finalPath : op.originalPath;
}

export function planHasWork(plan: CarryOverPlan): boolean {
  if (plan.folderOps.some(op => op.action !== 'none')) return true;
  return plan.docOps.some(op => {
    if (op.state === 'pending') return true;
    if (op.state === 'missing') return false;
    return op.frontmatter.some(e => !e.kept) || !op.orderKept;
  });
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

export function planCarryOver(
  items: BinderItem[],
  projectFolderPath: string,
  disk: DiskState,
): CarryOverPlan {
  const plan: CarryOverPlan = { folderOps: [], docOps: [] };
  walkGroup(items, projectFolderPath, disk, plan);
  assignLeftoverOrders(plan, disk);
  return plan;
}

function walkGroup(
  items: BinderItem[],
  parentPath: string,
  disk: DiskState,
  plan: CarryOverPlan,
): void {
  const expanded = expandSiblings(items);
  // One number line per target sibling group (ADR 0001): documents and
  // folders share the 10/20/30 sequence in legacy order. Every item keeps
  // its slot regardless of classification, so values stay stable when a
  // leftover or missing document changes state between runs.
  const claimedBasenames = new Set<string>();
  const consumedAdoptees = new Set<string>();
  const existingFolders = disk.subfolderNames(parentPath);

  let position = 0;
  for (const item of expanded) {
    position += 10;
    if (isStructural(item)) {
      const op = planFolder(item, position, parentPath, existingFolders, consumedAdoptees);
      plan.folderOps.push(op);
      walkGroup(item.children ?? [], op.targetPath, disk, plan);
    } else {
      plan.docOps.push(planDoc(item, position, parentPath, disk, claimedBasenames));
    }
  }
}

function planFolder(
  item: BinderItem,
  position: number,
  parentPath: string,
  existingFolders: string[],
  consumedAdoptees: Set<string>,
): CarryOverFolderOp {
  const displayName = sanitizeTitle(item.title) || 'Untitled';
  const minted = folderNameWithPrefix(displayName, position);

  // Adoption (Q1 for folders): an existing folder whose display name matches
  // is this item's folder. One with a marker keeps it as-is; a plain one
  // gets the marker attached in place — the typed name is never destroyed,
  // only prefixed. Tiebreak when several match: the exact minted name, then
  // any marker-carrying name, then natural order; never adopted twice.
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

  if (adopted === null) {
    return {
      kind: 'folder', legacyTitle: item.title, displayName,
      currentPath: null, targetName: minted,
      targetPath: `${parentPath}/${minted}`, action: 'create',
    };
  }
  if (parseFolderPrefix(adopted).order !== null) {
    return {
      kind: 'folder', legacyTitle: item.title, displayName,
      currentPath: null, targetName: adopted,
      targetPath: `${parentPath}/${adopted}`, action: 'none',
    };
  }
  // Plain adopted folder: the marker carries the legacy order in place.
  // The attached name reuses the folder's own typed text, not the title.
  const attached = folderNameWithPrefix(adopted, position);
  return {
    kind: 'folder', legacyTitle: item.title, displayName,
    currentPath: `${parentPath}/${adopted}`, targetName: attached,
    targetPath: `${parentPath}/${attached}`, action: 'attach-marker',
  };
}

function planDoc(
  item: BinderItem,
  position: number,
  parentPath: string,
  disk: DiskState,
  claimedBasenames: Set<string>,
): CarryOverDocOp {
  const originalPath = (item.filePath || '').replace(/\\/g, '/');
  const basename = originalPath.split('/').pop() ?? '';
  const finalPath = `${parentPath}/${basename}`;

  const atOriginal = originalPath !== '' && disk.fileExists(originalPath);
  const atFinal = basename !== '' && disk.fileExists(finalPath);
  const key = basename.toLowerCase();

  let state: DocState;
  if (!atOriginal && !atFinal) {
    // Missing documents do not claim the basename — a present sibling with
    // the same name is the rightful claimant.
    state = 'missing';
  } else if (claimedBasenames.has(key)) {
    state = 'leftover';
  } else {
    claimedBasenames.add(key);
    if (finalPath === originalPath) state = 'done';
    else if (atOriginal && atFinal) state = 'leftover'; // foreign occupant (R1)
    else if (atOriginal) state = 'pending';
    else state = 'done';
  }

  const currentPath = state === 'missing'
    ? null
    : state === 'done' ? finalPath : originalPath;
  const fm = currentPath !== null ? disk.frontmatter(currentPath) ?? {} : {};
  const kept = (k: string): boolean => fm[k] !== undefined && fm[k] !== null;

  return {
    kind: 'doc',
    originalPath,
    finalPath,
    state,
    order: position, // leftovers re-ranked in assignLeftoverOrders
    frontmatter: state === 'missing' ? [] : metadataEntries(item, kept),
    orderKept: state === 'missing' ? false : kept('binder-order'),
  };
}

function metadataEntries(item: BinderItem, kept: (k: string) => boolean): CarryOverFmEntry[] {
  const entries: CarryOverFmEntry[] = [];
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
  // Q2 (#230): a legacy compile exclusion survives; inclusion stays
  // expressed by key absence (#229 — re-include deletes the key)
  if (item.includeInExport === false) {
    entries.push({ key: 'binder-compile', value: false, kept: kept('binder-compile') });
  }
  return entries;
}

// R1 order fix: a permanent leftover ranks within its ACTUAL folder —
// 10/20/30 among the leftovers sharing that parent, in legacy walk order —
// so it is ordered where the user will actually see it.
function assignLeftoverOrders(plan: CarryOverPlan, disk: DiskState): void {
  const positions = new Map<string, number>();
  for (const op of plan.docOps) {
    if (op.state !== 'leftover') continue;
    const parent = op.originalPath.split('/').slice(0, -1).join('/');
    const next = (positions.get(parent) ?? 0) + 10;
    positions.set(parent, next);
    op.order = next;
    op.orderKept = (disk.frontmatter(op.originalPath) ?? {})['binder-order'] != null;
  }
}

// ─── Restore (inverse pass) ─────────────────────────────────────────────────

// Layout-only by ruling: documents return to their legacy paths and markers
// come off matched folders; frontmatter is untouched and nothing is ever
// deleted — a folder migration created stays behind (empty) because it is
// statelessly indistinguishable from a pre-existing adopted folder.
export interface RestoreDocOp {
  kind: 'restore-doc';
  /** Where migration put it (or would have). */
  fromPath: string;
  /** The legacy home it returns to. */
  toPath: string;
  /** Legacy parent folders to ensure exist, outermost first. */
  ensureFolders: string[];
  state: 'pending' | 'done' | 'skipped';
  skipReason?: 'not-found' | 'target-occupied';
}

export interface RestoreFolderOp {
  kind: 'restore-folder';
  /** Marker-carrying path today. */
  fromPath: string;
  /** Same folder with the marker stripped. */
  toPath: string;
  state: 'pending' | 'done' | 'skipped';
  skipReason?: 'target-occupied';
}

export interface RestorePlan {
  docOps: RestoreDocOp[];
  folderOps: RestoreFolderOp[];
}

export function restoreHasWork(plan: RestorePlan): boolean {
  return plan.docOps.some(op => op.state === 'pending')
    || plan.folderOps.some(op => op.state === 'pending');
}

export function planRestore(
  items: BinderItem[],
  projectFolderPath: string,
  disk: DiskState,
): RestorePlan {
  const forward = planCarryOver(items, projectFolderPath, disk);
  const docOps: RestoreDocOp[] = [];

  for (const op of forward.docOps) {
    if (op.originalPath === '' || op.finalPath === op.originalPath) continue;
    const atFinal = disk.fileExists(op.finalPath);
    const atOriginal = disk.fileExists(op.originalPath);
    let state: RestoreDocOp['state'];
    let skipReason: RestoreDocOp['skipReason'];
    if (atOriginal) {
      // At its legacy home already — a leftover that never moved, or a
      // previous restore run's work. Nothing to do.
      state = 'done';
    } else if (atFinal) {
      state = 'pending';
    } else {
      state = 'skipped';
      skipReason = 'not-found';
    }
    docOps.push({
      kind: 'restore-doc',
      fromPath: op.finalPath,
      toPath: op.originalPath,
      ensureFolders: ancestorsWithin(op.originalPath, projectFolderPath),
      state,
      skipReason,
    });
  }

  // Markers come off folders matched to legacy structural items. The forward
  // plan computed against today's disk already found them (action 'none'
  // with a marker-carrying name); minted-but-uncreated folders (action
  // 'create') do not exist and need nothing.
  const folderOps: RestoreFolderOp[] = [];
  for (const op of forward.folderOps) {
    if (op.action !== 'none') continue;
    const parsed = parseFolderPrefix(op.targetName);
    if (parsed.order === null) continue; // adopted plain folder — no marker to strip
    const parent = op.targetPath.split('/').slice(0, -1).join('/');
    const toPath = `${parent}/${parsed.displayName}`;
    const occupied = disk.folderExists(toPath) || disk.fileExists(toPath);
    folderOps.push({
      kind: 'restore-folder',
      fromPath: op.targetPath,
      toPath,
      state: occupied ? 'skipped' : 'pending',
      skipReason: occupied ? 'target-occupied' : undefined,
    });
  }

  return { docOps, folderOps };
}

// Ancestor folder paths of `filePath` strictly below the project root that
// do not need to exist yet — outermost first, ready for createFolder.
function ancestorsWithin(filePath: string, projectFolderPath: string): string[] {
  const out: string[] = [];
  const parts = filePath.split('/');
  parts.pop();
  let path = '';
  for (const part of parts) {
    path = path === '' ? part : `${path}/${part}`;
    if (path.length > projectFolderPath.length && path.startsWith(projectFolderPath + '/')) {
      out.push(path);
    }
  }
  return out;
}

// ─── Execution (pure orchestration over injected IO) ────────────────────────

export interface CarryOverIO {
  createFolder(path: string): Promise<void>;
  /** One atomic rename — a document move or an in-place folder rename. */
  rename(fromPath: string, toPath: string): Promise<void>;
  writeFrontmatter(path: string, mutate: (fm: Record<string, unknown>) => void): Promise<void>;
}

export interface PassFailure {
  /** Stable identity for the graduated notice ledger (R2). */
  signature: string;
  /** What the user would call the thing — basename or display name. */
  name: string;
  /** 'name-taken' for R1 leftovers; otherwise the thrown message. */
  reason: string;
  kind: 'folder' | 'move' | 'frontmatter' | 'leftover';
}

export interface PassResult {
  /** Operations that changed the vault this run. */
  changed: number;
  failures: PassFailure[];
  leftovers: number;
  missing: number;
}

const basenameOf = (path: string): string => path.split('/').pop() ?? path;

// The migration pass (R3): folders → recompute → moves → recompute →
// frontmatter. Recomputing between phases means no operation ever acts on a
// path a previous phase changed. Per-item try/catch; a failed folder skips
// its subtree this run; everything failed or skipped is pending next run.
export async function runMigrationPass(
  compute: () => { plan: CarryOverPlan; disk: DiskState },
  io: CarryOverIO,
): Promise<PassResult> {
  const result: PassResult = { changed: 0, failures: [], leftovers: 0, missing: 0 };
  const failedRoots: string[] = [];
  const underFailedRoot = (path: string): boolean =>
    failedRoots.some(root => path === root || path.startsWith(root + '/'));

  // Phase 1 — folders, parents before children (plan walk order)
  for (const op of compute().plan.folderOps) {
    if (op.action === 'none' || underFailedRoot(op.targetPath)) continue;
    try {
      if (op.action === 'create') await io.createFolder(op.targetPath);
      else await io.rename(op.currentPath as string, op.targetPath);
      result.changed += 1;
    } catch (e) {
      failedRoots.push(op.targetPath);
      result.failures.push({
        signature: `folder|${op.targetPath}`,
        name: op.displayName,
        reason: e instanceof Error ? e.message : String(e),
        kind: 'folder',
      });
    }
  }

  // Phase 2 — document moves, against post-folder reality
  const afterFolders = compute();
  for (const op of afterFolders.plan.docOps) {
    if (op.state !== 'pending') continue;
    const targetParent = op.finalPath.split('/').slice(0, -1).join('/');
    // Dependency skip: the parent's own failure already carries the notice
    if (!afterFolders.disk.folderExists(targetParent)) continue;
    try {
      await io.rename(op.originalPath, op.finalPath);
      result.changed += 1;
    } catch (e) {
      result.failures.push({
        signature: `move|${op.originalPath}`,
        name: basenameOf(op.originalPath),
        reason: e instanceof Error ? e.message : String(e),
        kind: 'move',
      });
    }
  }

  // Phase 3 — frontmatter, against post-move reality. A document that did
  // not land this run gets everything except binder-order (R1 order fix).
  const final = compute();
  for (const op of final.plan.docOps) {
    const path = docCurrentPath(op);
    if (path === null) {
      result.missing += 1;
      continue;
    }
    if (op.state === 'leftover') {
      result.leftovers += 1;
      result.failures.push({
        signature: `leftover|${op.originalPath}`,
        name: basenameOf(op.originalPath),
        reason: 'name-taken',
        kind: 'leftover',
      });
    }
    const writes = op.frontmatter.filter(e => !e.kept);
    const writeOrder = !op.orderKept && op.state !== 'pending';
    if (writes.length === 0 && !writeOrder) continue;
    try {
      await io.writeFrontmatter(path, (fm) => {
        // Live re-check (Q5): the plan's kept-flags came from a cache that
        // can be cold — the callback sees authoritative frontmatter
        for (const e of writes) {
          if (fm[e.key] === undefined || fm[e.key] === null) fm[e.key] = e.value;
        }
        if (writeOrder && (fm['binder-order'] === undefined || fm['binder-order'] === null)) {
          fm['binder-order'] = op.order;
        }
      });
      result.changed += 1;
    } catch (e) {
      result.failures.push({
        signature: `frontmatter|${path}`,
        name: basenameOf(path),
        reason: e instanceof Error ? e.message : String(e),
        kind: 'frontmatter',
      });
    }
  }

  return result;
}

export interface RestoreResult {
  moved: number;
  skipped: number;
  failures: PassFailure[];
}

// The inverse pass: legacy parents recreated, documents moved back, then
// markers stripped (moves first — their sources sit under marker names).
// Never deletes anything.
export async function runRestorePass(
  compute: () => { plan: RestorePlan; disk: DiskState },
  io: CarryOverIO,
): Promise<RestoreResult> {
  const result: RestoreResult = { moved: 0, skipped: 0, failures: [] };

  const first = compute();
  const ensured = new Set<string>();
  for (const op of first.plan.docOps) {
    if (op.state !== 'pending') {
      if (op.state === 'skipped') result.skipped += 1;
      continue;
    }
    try {
      for (const folder of op.ensureFolders) {
        if (ensured.has(folder) || first.disk.folderExists(folder)) continue;
        await io.createFolder(folder);
        ensured.add(folder);
      }
      await io.rename(op.fromPath, op.toPath);
      result.moved += 1;
    } catch (e) {
      result.failures.push({
        signature: `restore|${op.fromPath}`,
        name: basenameOf(op.fromPath),
        reason: e instanceof Error ? e.message : String(e),
        kind: 'move',
      });
    }
  }

  for (const op of compute().plan.folderOps) {
    if (op.state !== 'pending') {
      if (op.state === 'skipped') result.skipped += 1;
      continue;
    }
    try {
      await io.rename(op.fromPath, op.toPath);
      result.moved += 1;
    } catch (e) {
      result.failures.push({
        signature: `restore|${op.fromPath}`,
        name: basenameOf(op.fromPath),
        reason: e instanceof Error ? e.message : String(e),
        kind: 'folder',
      });
    }
  }

  return result;
}
