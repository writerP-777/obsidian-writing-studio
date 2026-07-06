import { normalizePath } from 'obsidian';
import type { VaultFiles } from './VaultFiles';
import { WritingProject, resolveDocumentFolder } from '../models/Project';
import { BinderItem } from '../models/BinderItem';
import { folderNameWithPrefix } from './binderOrder';

// A project template as data: the folders and documents to scaffold.
// Templates build one of these; TemplateScaffolder is the only code that
// touches the vault. Since the cutover (#233) the filesystem is the binder:
// structural nodes become real folders carrying an order marker, documents
// carry binder-* frontmatter, and no _binder.json is written.
export interface ManifestNode {
  id: string;
  title: string;
  type: BinderItem['type'];
  // Path relative to the project's document folder, without the .md
  // extension. Structural nodes (group/part) omit it and carry no file.
  fileName?: string;
  // Full file content; required when fileName is present.
  content?: string;
  wordCountGoal?: number;
  includeInExport?: boolean; // default true
  children?: ManifestNode[];
}

export interface TemplateManifest {
  // Extra folders relative to the document folder (e.g. a year folder).
  folders?: string[];
  items: ManifestNode[];
}

export interface DocFields {
  title: string;
  // Frontmatter `type:` — may differ from the binder item type
  // (e.g. 'abstract' in frontmatter, 'section' in the binder).
  fmType: string;
  order: number;
  goal?: number;
  date: string;
  // Emits `include-in-export: false` for reference documents.
  exportExcluded?: boolean;
  tags?: string[];
  // Extra frontmatter fields, emitted directly after the title.
  extraFields?: Record<string, string>;
  // Defaults to title.
  heading?: string;
  body: string;
}

// The one place the template document format lives. Frontmatter keys are the
// binder's own (#233): binder-order/binder-status/binder-type/binder-compile,
// with word-count-goal the sole goal authority. No title key — the filename
// is the title.
export function templateDoc(f: DocFields): string {
  const extra = Object.entries(f.extraFields ?? {})
    .map(([k, v]) => `\n${k}: "${v}"`)
    .join('');
  const goalLine = f.goal && f.goal > 0 ? `\nword-count-goal: ${f.goal}` : '';
  const exportLine = f.exportExcluded ? '\nbinder-compile: false' : '';
  const tags = (f.tags ?? ['writing-studio']).join(', ');
  return `---${extra}
binder-type: ${f.fmType}
binder-order: ${f.order}
binder-status: draft${goalLine}${exportLine}
word-count: 0
created: ${f.date}
modified: ${f.date}
tags: [${tags}]
---

# ${f.heading ?? f.title}

${f.body}
`;
}

export function placeholderHint(text: string): string {
  return `> [!note] Placeholder\n> *${text}*`;
}

export class TemplateScaffolder {
  private files: VaultFiles;

  constructor(files: VaultFiles) {
    this.files = files;
  }

  async apply(project: WritingProject, manifest: TemplateManifest): Promise<void> {
    const container = normalizePath(`${project.folderPath}/${resolveDocumentFolder(project)}`);
    for (const folder of manifest.folders ?? []) {
      await this.files.ensureFolder(normalizePath(`${container}/${folder}`));
    }
    await this.buildItems(manifest.items, container);
  }

  // Sibling orders are minted with gaps of 10, the same scheme reordering
  // uses, so a scaffolded group has room for insertions before any renumber.
  private async buildItems(nodes: ManifestNode[], container: string): Promise<void> {
    let order = 10;
    for (const node of nodes) {
      if (node.fileName) {
        const filePath = normalizePath(`${container}/${node.fileName}.md`);
        // Never overwrite — a user file with the same name wins.
        if (!this.files.exists(filePath)) {
          await this.files.writeText(filePath, node.content ?? '');
        }
      } else {
        // Structural node: a real folder ordered by its name marker (#233)
        const folderPath = normalizePath(`${container}/${folderNameWithPrefix(node.title, order)}`);
        await this.files.ensureFolder(folderPath);
        if (node.children) await this.buildItems(node.children, folderPath);
      }
      order += 10;
    }
  }
}
