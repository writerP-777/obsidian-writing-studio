import { BinderItem } from '../models/BinderItem';

// Folders every project reserves for non-document content. createProject
// scaffolds these next to the document folder; template manifests create
// nothing else at that level, so this list is complete.
export const RESERVED_PROJECT_FOLDERS = ['Research', 'Exports'];

export function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

// Segment-boundary prefix test: 'A/Chapters' covers 'A/Chapters/Ch 1.md' and
// itself, but never 'A/Chapters-old/x.md'.
export function pathAtOrUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

export function rewritePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length);
  return path;
}

// Batch-rewrites every binder filePath under a renamed folder, in place.
// Returns whether anything changed so the caller saves once per affected
// binder — and not at all when a replayed event finds nothing left to do.
export function rewriteBinderPaths(items: BinderItem[], oldPrefix: string, newPrefix: string): boolean {
  let changed = false;
  for (const item of items) {
    if (item.filePath && pathAtOrUnder(item.filePath, oldPrefix)) {
      item.filePath = rewritePathPrefix(item.filePath, oldPrefix, newPrefix);
      changed = true;
    }
    if (item.children && rewriteBinderPaths(item.children, oldPrefix, newPrefix)) {
      changed = true;
    }
  }
  return changed;
}

export function anyBinderPathUnder(items: BinderItem[], prefix: string): boolean {
  return items.some(item =>
    (item.filePath !== '' && pathAtOrUnder(item.filePath, prefix)) ||
    (item.children ? anyBinderPathUnder(item.children, prefix) : false)
  );
}

export type FolderNameRejection = 'empty' | 'invalid-chars' | 'trailing' | 'reserved' | 'exists';

export interface FolderNameVerdict {
  ok: boolean;
  reason?: FolderNameRejection;
}

// Validates a document-folder rename target. `targetExists` reports whether
// `name` already exists inside the project folder. A target differing from
// the current name only by case is the same folder on the case-insensitive
// filesystems vaults usually live on, so a case-only rename proceeds even
// though the target "exists".
export function validateDocumentFolderName(
  name: string,
  currentName: string,
  targetExists: boolean,
): FolderNameVerdict {
  if (name.trim() === '') return { ok: false, reason: 'empty' };
  if (/[\\/:*?"<>|]/.test(name)) return { ok: false, reason: 'invalid-chars' };
  if (/[. ]$/.test(name)) return { ok: false, reason: 'trailing' };
  if (RESERVED_PROJECT_FOLDERS.some(r => r.toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: 'reserved' };
  }
  const caseOnly = name !== currentName && name.toLowerCase() === currentName.toLowerCase();
  if (targetExists && !caseOnly) return { ok: false, reason: 'exists' };
  return { ok: true };
}
