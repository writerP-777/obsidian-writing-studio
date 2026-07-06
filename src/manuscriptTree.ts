import { App, TFile, TFolder } from 'obsidian';
import { RESERVED_PROJECT_FOLDERS } from './folderRename';
import { isHiddenName, parseBinderOrder, parseFolderPrefix, sortSiblings } from './binderOrder';

// The manuscript zone as data, for consumers outside the view: the same tree
// FilesystemBinderView renders — depth-first, in binder order, hidden names
// excluded, non-markdown files dropped (they never compile). The targets
// dashboard lists the zone's documents (#229 goal single-authority); compile
// and export walk the same tree (#232) so the binder, the dashboard, and the
// compiled manuscript can never disagree on membership or order. Lives
// outside the view module so none of these consumers import each other.

export interface ManuscriptDoc {
  kind: 'doc';
  path: string;
  /** Extension-stripped filename — the document's title (ADR 0001). */
  title: string;
  /** `binder-compile: false` — excluded from every compile output. */
  compileExcluded: boolean;
}

export interface ManuscriptFolder {
  kind: 'folder';
  /** Order-marker-stripped display name. */
  title: string;
  children: ManuscriptNode[];
}

export type ManuscriptNode = ManuscriptDoc | ManuscriptFolder;

export interface ManuscriptTree {
  nodes: ManuscriptNode[];
  /** Every markdown document in binder order, compile-excluded ones included. */
  docFiles: TFile[];
}

// Research and Exports are drawer zones only at the project root; a nested
// folder that happens to share their name is ordinary manuscript, so subtree
// walks (rooted inside the zone) must not filter it.
export function buildManuscriptTree(
  app: App,
  rootPath: string,
  opts: { excludeReservedAtRoot?: boolean } = {},
): ManuscriptTree {
  const docFiles: TFile[] = [];
  const root = app.vault.getAbstractFileByPath(rootPath);
  if (!(root instanceof TFolder)) return { nodes: [], docFiles };

  const walk = (folder: TFolder, isRoot: boolean): ManuscriptNode[] => {
    const entries = folder.children
      .filter(c => !isHiddenName(c.name))
      .filter(c => !(isRoot && opts.excludeReservedAtRoot !== false && c instanceof TFolder &&
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

    const nodes: ManuscriptNode[] = [];
    for (const s of sortSiblings(entries)) {
      if (s.file instanceof TFolder) {
        nodes.push({
          kind: 'folder',
          title: parseFolderPrefix(s.file.name).displayName,
          children: walk(s.file, false),
        });
      } else if (s.file instanceof TFile && s.file.extension === 'md') {
        docFiles.push(s.file);
        const fm = app.metadataCache.getFileCache(s.file)?.frontmatter;
        nodes.push({
          kind: 'doc',
          path: s.file.path,
          title: s.file.name.slice(0, s.file.name.length - s.file.extension.length - 1),
          compileExcluded: fm?.['binder-compile'] === false,
        });
      }
    }
    return nodes;
  };

  return { nodes: walk(root, true), docFiles };
}

export function listManuscriptDocs(app: App, projectFolderPath: string): TFile[] {
  return buildManuscriptTree(app, projectFolderPath).docFiles;
}

// ─── Compile plan (#232) ─────────────────────────────────────────────────────

export interface CompilePlanOptions {
  /** The "Include folder names as headings" export option. */
  includeFolderNames: boolean;
  includeTitlesAsHeadings: boolean;
}

export type CompilePlanItem =
  | { kind: 'heading'; level: number; title: string }
  | { kind: 'doc'; path: string; title: string; headingLevel: number | null };

// Markdown has six heading levels; anything nested deeper flattens to h6.
const MAX_HEADING_LEVEL = 6;

function hasCompiledDoc(nodes: ManuscriptNode[]): boolean {
  return nodes.some(n =>
    n.kind === 'doc' ? !n.compileExcluded : hasCompiledDoc(n.children));
}

// The ordered heading/document sequence a compile emits, from a manuscript
// tree whose root is the compile root — the project folder for an
// entire-project export, the right-clicked folder for a subtree export.
// Depth is measured from that root (heading levels are rebased) and the root
// itself never emits a heading, so a subtree export is the same operation as
// an entire-project export with a different root.
//
// Folder headings sit at their folder's depth; document title headings sit
// one below their parent folder — so a document loose at the root is h1,
// exactly its level today. With folder names off, document headings stay a
// flat h1 regardless of nesting (today's output). A folder whose subtree
// contributes no compiled document emits no heading.
export function planCompile(nodes: ManuscriptNode[], opts: CompilePlanOptions): CompilePlanItem[] {
  const out: CompilePlanItem[] = [];
  const docLevel = (parentDepth: number): number | null => {
    if (!opts.includeTitlesAsHeadings) return null;
    return opts.includeFolderNames ? Math.min(parentDepth + 1, MAX_HEADING_LEVEL) : 1;
  };
  const walk = (children: ManuscriptNode[], parentDepth: number): void => {
    for (const node of children) {
      if (node.kind === 'doc') {
        if (node.compileExcluded) continue;
        out.push({ kind: 'doc', path: node.path, title: node.title, headingLevel: docLevel(parentDepth) });
      } else {
        if (opts.includeFolderNames && hasCompiledDoc(node.children)) {
          out.push({
            kind: 'heading',
            level: Math.min(parentDepth + 1, MAX_HEADING_LEVEL),
            title: node.title,
          });
        }
        walk(node.children, parentDepth + 1);
      }
    }
  };
  walk(nodes, 0);
  return out;
}
