// The vault's sources, read from the metadata cache: every markdown note with
// a `citekey` property, wherever it lives, so literature notes from Zotero
// Integration or the Citations plugin count without being moved. When two
// notes claim one citekey the project's own Research folder wins, and the
// loser is reported so the writer can fix it.

import { App, TFile, normalizePath } from 'obsidian';
import { parseSource, Source } from './sources';
import type { SourceLookup } from './citeRender';

export interface SourceIndex extends SourceLookup {
  all(): Source[];
  // "citekey (path)" for each note that lost a citekey collision.
  collisions: string[];
}

export function buildSourceIndex(app: App, projectFolderPath: string | null): SourceIndex {
  const byKey = new Map<string, Source>();
  const byPath = new Map<string, Source>();
  const collisions: string[] = [];
  const researchPrefix = projectFolderPath ? `${normalizePath(`${projectFolderPath}/Research`)}/` : null;
  const preferred = (path: string): boolean => researchPrefix !== null && path.startsWith(researchPrefix);

  for (const file of app.vault.getMarkdownFiles()) {
    const source = parseSource(app.metadataCache.getFileCache(file)?.frontmatter, file.path);
    if (!source) continue;
    const existing = byKey.get(source.citekey);
    if (existing && (preferred(existing.path) || !preferred(source.path))) {
      collisions.push(`${source.citekey} (${source.path})`);
      continue;
    }
    if (existing) {
      collisions.push(`${existing.citekey} (${existing.path})`);
      byPath.delete(existing.path);
    }
    byKey.set(source.citekey, source);
    byPath.set(source.path, source);
  }

  // Wikilinks resolve the way Obsidian resolves them, from the project
  // folder, so a short link to a note anywhere in the vault still lands.
  const resolveFrom = projectFolderPath ? normalizePath(`${projectFolderPath}/_compile.md`) : '';

  return {
    collisions,
    all: () => [...byKey.values()],
    byKey: (key: string) => byKey.get(key) ?? null,
    hasKey: (key: string) => byKey.has(key),
    keyForLink: (target: string) => {
      const file = app.metadataCache.getFirstLinkpathDest(target, resolveFrom);
      return file instanceof TFile ? (byPath.get(file.path)?.citekey ?? null) : null;
    },
  };
}
