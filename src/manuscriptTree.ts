import { App, TFile, TFolder } from 'obsidian';
import { RESERVED_PROJECT_FOLDERS } from './folderRename';
import { isHiddenName, parseBinderOrder, sortSiblings } from './binderOrder';

// The manuscript zone's markdown documents in binder order (depth-first) —
// the same tree FilesystemBinderView renders, for consumers outside the
// view. The targets dashboard lists exactly these when the experimental
// binder is on (#229 goal single-authority). Lives outside the view module
// so the dashboard modal and the view don't import each other.
export function listManuscriptDocs(app: App, projectFolderPath: string): TFile[] {
  const root = app.vault.getAbstractFileByPath(projectFolderPath);
  if (!(root instanceof TFolder)) return [];
  const docs: TFile[] = [];
  const walk = (folder: TFolder, isRoot: boolean): void => {
    const entries = folder.children
      .filter(c => !isHiddenName(c.name))
      .filter(c => !(isRoot && c instanceof TFolder &&
        RESERVED_PROJECT_FOLDERS.some(r => r.toLowerCase() === c.name.toLowerCase())))
      .map(file => ({
        file,
        name: file.name,
        isFolder: file instanceof TFolder,
        extension: file instanceof TFile ? file.extension : undefined,
        binderOrder: file instanceof TFile && file.extension === 'md'
          ? parseBinderOrder(app.metadataCache.getFileCache(file)?.frontmatter?.['binder-order'])
          : null,
      }));
    for (const s of sortSiblings(entries)) {
      if (s.file instanceof TFolder) walk(s.file, false);
      else if (s.file instanceof TFile && s.file.extension === 'md') docs.push(s.file);
    }
  };
  walk(root, true);
  return docs;
}
