import { normalizePath } from 'obsidian';
import type { VaultFiles } from './VaultFiles';
import { WritingProject } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';

// A project template as data: the folders and documents to scaffold and the
// binder tree they produce. Templates build one of these; TemplateScaffolder
// is the only code that touches the vault.
export interface ManifestNode {
  id: string;
  title: string;
  type: BinderItem['type'];
  // Path relative to the project's Chapters folder, without the .md
  // extension. Structural nodes (group/part) omit it and carry no file.
  fileName?: string;
  // Full file content; required when fileName is present.
  content?: string;
  wordCountGoal?: number;
  includeInExport?: boolean; // default true
  children?: ManifestNode[];
}

export interface TemplateManifest {
  // Extra folders relative to the Chapters folder (e.g. a year folder).
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

// The one place the template document format lives.
export function templateDoc(f: DocFields): string {
  const extra = Object.entries(f.extraFields ?? {})
    .map(([k, v]) => `\n${k}: "${v}"`)
    .join('');
  const goalLine = f.goal && f.goal > 0 ? `\nword-count-goal: ${f.goal}` : '';
  const exportLine = f.exportExcluded ? '\ninclude-in-export: false' : '';
  const tags = (f.tags ?? ['writing-studio']).join(', ');
  return `---
title: "${f.title}"${extra}
type: ${f.fmType}
order: ${f.order}
status: draft${goalLine}${exportLine}
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

  async apply(project: WritingProject, manifest: TemplateManifest): Promise<BinderData> {
    const chapters = normalizePath(`${project.folderPath}/Chapters`);
    for (const folder of manifest.folders ?? []) {
      await this.files.ensureFolder(normalizePath(`${chapters}/${folder}`));
    }
    const items = await this.buildItems(manifest.items, chapters);
    return { version: '2.0', projectId: project.id, items };
  }

  private async buildItems(nodes: ManifestNode[], chapters: string): Promise<BinderItem[]> {
    const items: BinderItem[] = [];
    let order = 1;
    for (const node of nodes) {
      let filePath = '';
      if (node.fileName) {
        filePath = normalizePath(`${chapters}/${node.fileName}.md`);
        // Never overwrite — a user file with the same name wins.
        if (!this.files.exists(filePath)) {
          await this.files.writeText(filePath, node.content ?? '');
        }
      }
      const item: BinderItem = {
        id: node.id,
        title: node.title,
        filePath,
        type: node.type,
        order: order++,
        status: 'draft',
        includeInExport: node.includeInExport ?? true,
      };
      if (node.wordCountGoal) item.wordCountGoal = node.wordCountGoal;
      if (node.children) item.children = await this.buildItems(node.children, chapters);
      items.push(item);
    }
    return items;
  }
}
