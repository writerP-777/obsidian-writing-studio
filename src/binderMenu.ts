// Pure decision logic for the filesystem binder's mutation surface (#229):
// which context-menu actions a row offers, what the rename prompt shows,
// what on-disk name a typed value produces, and how names validate.

import { SiblingEntry, parseFolderPrefix, folderNameWithPrefix, entryDisplayName } from './binderOrder';
import { BinderZone } from './binderMove';
import { DocumentStatus, STATUS_COLORS } from '../models/BinderItem';

export type MenuAction =
  | 'rename' | 'status' | 'goal' | 'type' | 'compile'
  | 'export' | 'newDoc' | 'newFolder' | 'delete';

// The optional `binder-type` document types — group/part are structural
// legacy concepts with no place in a filesystem-owned binder.
export const BINDER_TYPES = ['chapter', 'section', 'article', 'note'] as const;
export type BinderDocType = (typeof BINDER_TYPES)[number];

export function parseBinderType(value: unknown): BinderDocType | null {
  return typeof value === 'string' && (BINDER_TYPES as readonly string[]).includes(value)
    ? (value as BinderDocType)
    : null;
}

export function parseBinderStatus(value: unknown): DocumentStatus | null {
  return typeof value === 'string' && value in STATUS_COLORS
    ? (value as DocumentStatus)
    : null;
}

// Rulings on #229: Exports rows are delete-only (the zone is output-only);
// Research rows offer rename/delete/new-document/new-folder but never the
// manuscript metadata actions; non-markdown files are rename+delete wherever
// they are mutable at all. Manuscript folders additionally offer subtree
// export (#232) — Research folders never do, the zone never compiles.
export function menuActionsFor(entry: SiblingEntry, zone: BinderZone): MenuAction[] {
  if (zone === 'exports') return ['delete'];
  if (!entry.isFolder && entry.extension !== 'md') return ['rename', 'delete'];
  if (entry.isFolder && zone === 'manuscript') {
    return ['rename', 'export', 'newDoc', 'newFolder', 'delete'];
  }
  if (zone === 'research' || entry.isFolder) {
    return ['rename', 'newDoc', 'newFolder', 'delete'];
  }
  return ['rename', 'status', 'goal', 'type', 'compile', 'newDoc', 'newFolder', 'delete'];
}

// What the rename prompt prefills: folders show their display name (order
// marker stripped), markdown documents their basename, and every other file
// its name with the extension stripped — the extension is not editable from
// the binder (ruling on #229).
export function renamePrefill(entry: SiblingEntry): string {
  if (entry.isFolder || entry.extension === 'md') return entryDisplayName(entry);
  return entry.extension
    ? entry.name.slice(0, entry.name.length - entry.extension.length - 1)
    : entry.name;
}

// The on-disk name a typed value produces. Folders re-attach their existing
// order marker so order survives the rename — unless the typed value is
// itself marker syntax, which (per the #239 residual ruling) reads as a
// deliberate order and is kept byte-for-byte. Files re-attach their original
// extension; a typed value that already ends with it is not doubled.
export function renameTargetName(entry: SiblingEntry, typed: string): string {
  if (entry.isFolder) {
    if (parseFolderPrefix(typed).order !== null) return typed;
    const order = parseFolderPrefix(entry.name).order;
    return order !== null ? folderNameWithPrefix(typed, order) : typed;
  }
  if (!entry.extension) return typed;
  const suffix = '.' + entry.extension;
  return typed.toLowerCase().endsWith(suffix.toLowerCase()) ? typed : typed + suffix;
}

export type ItemNameRejection = 'empty' | 'invalid-chars' | 'trailing' | 'exists';

export interface ItemNameVerdict {
  ok: boolean;
  reason?: ItemNameRejection;
}

// Validates a typed name against its destination sibling group. `targetName`
// is the on-disk name the rename or creation would produce; `siblingNames`
// the destination's existing on-disk names with the renamed entry itself
// excluded, so a case-only self-rename proceeds while a case-insensitive
// collision with any other sibling is rejected (vaults usually live on
// case-insensitive filesystems).
export function validateItemName(
  typed: string,
  targetName: string,
  siblingNames: string[],
): ItemNameVerdict {
  if (typed.trim() === '') return { ok: false, reason: 'empty' };
  if (/[\\/:*?"<>|]/.test(typed)) return { ok: false, reason: 'invalid-chars' };
  if (/[. ]$/.test(typed)) return { ok: false, reason: 'trailing' };
  const lower = targetName.toLowerCase();
  if (siblingNames.some(n => n.toLowerCase() === lower)) return { ok: false, reason: 'exists' };
  return { ok: true };
}
