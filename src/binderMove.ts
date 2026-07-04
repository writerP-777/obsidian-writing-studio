// Pure structural-move engine for the filesystem-owned binder (ADR 0001,
// tracer slice 4 — #228).
//
// A structural move is a physical filesystem move: the planner turns a drop
// gesture into rename and order-write operations, and the view executes them
// only through fileManager.renameFile (links heal) and processFrontMatter.
// Zone rules live here so every refusal is unit-testable: Exports is
// output-only, folders never cross zones, a folder never enters its own
// subtree, and only markdown documents cross between manuscript and Research.

import { SiblingEntry, canCarryOrder, planReorder, folderNameWithPrefix } from './binderOrder';

export type BinderZone = 'manuscript' | 'research' | 'exports';
export type DropRegion = 'before' | 'after' | 'into';

// What a drag carries, captured at dragstart — plain data, so a mid-drag
// re-render (hover-to-expand) cannot invalidate it.
export interface DragSource extends SiblingEntry {
  /** Vault path of the dragged file or folder. */
  path: string;
  zone: BinderZone;
}

// refuse = no affordance at all (the gesture never looks possible);
// notice = a plausible-looking gesture that must be explained when refused.
export type DropVerdict =
  | { kind: 'accept' }
  | { kind: 'refuse' }
  | { kind: 'notice'; messageKey: string };

// Folder rows split into three regions so a drop can nest as well as
// position. Document rows split in half — nesting under a document is not
// offered anywhere, so it needs no refusal path.
export function dropRegion(targetIsFolder: boolean, offsetY: number, height: number): DropRegion {
  if (!targetIsFolder) return offsetY < height / 2 ? 'before' : 'after';
  if (offsetY < height * 0.25) return 'before';
  if (offsetY >= height * 0.75) return 'after';
  return 'into';
}

// Drags start only where a drop could ever be valid: markdown documents in
// the manuscript or Research (two-way for .md), folders in the manuscript
// only (folders never cross zones), nothing in Exports (output-only), and
// never a non-markdown file.
export function canStartDrag(entry: SiblingEntry, zone: BinderZone): boolean {
  if (zone === 'exports') return false;
  if (entry.isFolder) return zone === 'manuscript';
  return entry.extension === 'md';
}

export function evaluateDrop(source: DragSource, destParentPath: string, destZone: BinderZone): DropVerdict {
  if (destZone === 'exports') return { kind: 'notice', messageKey: 'binder.fs.exportsDropBlocked' };
  if (source.isFolder && destZone !== source.zone) {
    return { kind: 'notice', messageKey: 'binder.fs.folderZoneBlocked' };
  }
  if (source.isFolder && (destParentPath === source.path || destParentPath.startsWith(source.path + '/'))) {
    return { kind: 'refuse' };
  }
  return { kind: 'accept' };
}

export interface MoveEntry extends SiblingEntry {
  /** Vault path of the entry. */
  path: string;
}

export type MoveOp =
  | { kind: 'rename'; path: string; newPath: string }
  | { kind: 'set-order'; path: string; order: number };

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

// Turns a drop into the minimal operation list. destSiblings is the
// destination group in binder order, excluding the source; insertAt is the
// source's index in that sequence ('end' for drop-into, root, and zone
// drops). writeOrder is false for Research, where order is never written.
//
// The source's move and any prefix it receives fold into ONE rename —
// no intermediate location ever exists. A document's order write targets
// its post-move path. Same-parent drops with a holding position plan to
// nothing at all.
export function planMove(
  source: MoveEntry,
  destParentPath: string,
  destSiblings: MoveEntry[],
  insertAt: number | 'end',
  writeOrder: boolean,
): MoveOp[] {
  const index = insertAt === 'end' ? destSiblings.length : insertAt;
  const seq: MoveEntry[] = [...destSiblings];
  seq.splice(index, 0, source);

  const writes = writeOrder ? planReorder(seq, index) : [];
  const ops: MoveOp[] = [];

  const sourceWrite = writes.find(w => w.index === index) ?? null;
  const sourceName = source.isFolder && sourceWrite
    ? folderNameWithPrefix(source.name, sourceWrite.order)
    : source.name;
  const sourceNewPath = joinPath(destParentPath, sourceName);
  if (sourceNewPath !== source.path) {
    ops.push({ kind: 'rename', path: source.path, newPath: sourceNewPath });
  }
  if (!source.isFolder && sourceWrite) {
    ops.push({ kind: 'set-order', path: sourceNewPath, order: sourceWrite.order });
  }

  // The rest of the group — only the materialization case reaches here.
  for (const w of writes) {
    if (w.index === index) continue;
    const entry = seq[w.index];
    if (!canCarryOrder(entry)) continue;
    if (entry.isFolder) {
      const newName = folderNameWithPrefix(entry.name, w.order);
      if (newName === entry.name) continue;
      ops.push({ kind: 'rename', path: entry.path, newPath: joinPath(parentOf(entry.path), newName) });
    } else {
      ops.push({ kind: 'set-order', path: entry.path, order: w.order });
    }
  }
  return ops;
}
