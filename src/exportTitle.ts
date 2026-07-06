// Export title resolution (#260): the export dialog offers one title dropdown
// and the choice resolves to a single string that names the export everywhere —
// filename, title page, and file metadata. Pure module, no Obsidian imports.

export type ExportTitleChoice = 'folder' | 'project-folder' | 'project' | 'custom';

export interface ExportTitleContext {
  projectTitle: string;
  /** Display name of the exported folder — only present for a folder export. */
  folderName?: string;
  customTitle?: string;
}

// The dropdown's choices: the two folder-based titles only exist where there
// is a folder (a subtree export opened from a folder's context menu).
export function exportTitleChoices(hasFolder: boolean): ExportTitleChoice[] {
  return hasFolder
    ? ['folder', 'project-folder', 'project', 'custom']
    : ['project', 'custom'];
}

// Resolves the dropdown choice to the export's title. Returns null only when
// a custom title was chosen but not yet typed — the dialog keeps Export
// disabled rather than inventing a fallback.
export function resolveExportTitle(choice: ExportTitleChoice, ctx: ExportTitleContext): string | null {
  switch (choice) {
    case 'folder':
      return ctx.folderName ?? ctx.projectTitle;
    case 'project-folder':
      return ctx.folderName ? `${ctx.projectTitle} — ${ctx.folderName}` : ctx.projectTitle;
    case 'project':
      return ctx.projectTitle;
    case 'custom': {
      const typed = (ctx.customTitle ?? '').trim();
      return typed.length > 0 ? typed : null;
    }
  }
}

// The title as it appears in the export's filename — reserved path characters
// become hyphens; the title is otherwise kept verbatim.
export function sanitizeTitleForFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-');
}
