import { parseFolderPrefix } from './binderOrder';
import { renameTargetName } from './binderMenu';

// Folders every project reserves for non-document content. createProject
// scaffolds these next to the document folder; template manifests create
// nothing else at that level, so this list is complete.
export const RESERVED_PROJECT_FOLDERS = ['Research', 'Exports'];

export function isReservedFolderName(name: string): boolean {
  return RESERVED_PROJECT_FOLDERS.some(r => r.toLowerCase() === name.toLowerCase());
}

// The edit-project modal's Document folder field works in display names:
// the order marker migration or a reorder attached to the folder is never
// shown, and a typed name re-attaches the existing marker — the same engine
// as a binder rename — so an edit there can never cost the folder its order
// (#233 audit ruling).
export function documentFolderDisplayName(onDiskName: string): string {
  return parseFolderPrefix(onDiskName).displayName;
}

export function documentFolderRenameTarget(onDiskName: string, typed: string): string {
  return renameTargetName({ name: onDiskName, isFolder: true, binderOrder: null }, typed);
}

export function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

// Segment-boundary prefix test: 'A/Chapters' covers 'A/Chapters/Ch 1.md' and
// itself, but never 'A/Chapters-old/x.md'.
export function pathAtOrUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

// Same boundary, but the prefix itself does not count.
export function pathStrictlyUnder(path: string, prefix: string): boolean {
  return path.startsWith(prefix + '/');
}

export function rewritePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length);
  return path;
}

// The Windows-illegal filename character class — single home (#276). A test
// regex and a global replace regex kept separate so .test() never carries
// lastIndex state.
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/;
const ILLEGAL_NAME_CHARS_ALL = /[\\/:*?"<>|]/g;

export function hasIllegalNameChars(name: string): boolean {
  return ILLEGAL_NAME_CHARS.test(name);
}

export function replaceIllegalNameChars(name: string, replacement: string): string {
  return name.replace(ILLEGAL_NAME_CHARS_ALL, replacement);
}

// Windows also rejects names ending in a dot or space.
export function hasTrailingDotOrSpace(name: string): boolean {
  return /[. ]$/.test(name);
}

export function stripTrailingDotsAndSpaces(name: string): string {
  return name.replace(/[. ]+$/, '');
}

export type NameTextRejection = 'empty' | 'invalid-chars' | 'trailing';

// The text checks every typed name passes before any context rule (reserved
// names, sibling collisions) applies — the shared core of validateItemName
// and validateDocumentFolderName (#276).
export function rejectNameText(name: string): NameTextRejection | null {
  if (name.trim() === '') return 'empty';
  if (hasIllegalNameChars(name)) return 'invalid-chars';
  if (hasTrailingDotOrSpace(name)) return 'trailing';
  return null;
}

export type FolderNameRejection = NameTextRejection | 'reserved' | 'exists';

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
  const text = rejectNameText(name);
  if (text !== null) return { ok: false, reason: text };
  if (isReservedFolderName(name)) {
    return { ok: false, reason: 'reserved' };
  }
  const caseOnly = name !== currentName && name.toLowerCase() === currentName.toLowerCase();
  if (targetExists && !caseOnly) return { ok: false, reason: 'exists' };
  return { ok: true };
}

// The folder name a project title maps to — the single derivation shared by
// createProject and the edit-project modal's title rename (#391). Illegal
// filename characters become "-" so a title keeps its punctuation
// ("My Book: A Novel") while its folder stays legal ("My Book- A Novel");
// trailing dots and spaces are dropped because Windows refuses them.
export function projectFolderNameForTitle(title: string): string {
  return stripTrailingDotsAndSpaces(replaceIllegalNameChars(title.trim(), '-'));
}

export interface ProjectFolderPlan {
  // The on-disk name the title maps to.
  name: string;
  // True when the folder name differs from the current one — a save renames.
  renames: boolean;
  // True when the derivation changed the typed text — the UI explains why.
  substituted: boolean;
}

// What saving `title` means for a project living in a folder currently
// named `currentFolderName`. Pure: the modal shows this as a live hint and
// acts on it at save time.
export function planProjectFolderForTitle(title: string, currentFolderName: string): ProjectFolderPlan {
  const name = projectFolderNameForTitle(title);
  return {
    name,
    renames: name !== currentFolderName,
    substituted: name !== title.trim(),
  };
}

export type ProjectFolderRejection = 'empty' | 'exists';

export interface ProjectFolderVerdict {
  ok: boolean;
  reason?: ProjectFolderRejection;
}

// Validates a derived project-folder name before the rename. The text
// rules of validateDocumentFolderName do not apply — derivation already
// made the name legal — so only emptiness and a collision can refuse it.
// A case-only change is the same folder on case-insensitive filesystems
// and proceeds even though the target "exists".
export function validateProjectFolderName(
  name: string,
  currentName: string,
  targetExists: boolean,
): ProjectFolderVerdict {
  if (name === '') return { ok: false, reason: 'empty' };
  const caseOnly = name !== currentName && name.toLowerCase() === currentName.toLowerCase();
  if (targetExists && !caseOnly) return { ok: false, reason: 'exists' };
  return { ok: true };
}
