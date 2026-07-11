// In-memory Obsidian app facade with real vault-tree semantics, for tests
// that drive view-level code (the binder's move executor, model building):
// a live TFile/TFolder object tree, fileManager.renameFile that carries a
// folder's subtree and throws on collisions like the real vault, frontmatter
// that rides the file object across renames, and vault/metadataCache events.

import { App, Events, TFile, TFolder } from 'obsidian';

export class FakeVaultApp {
  byPath = new Map<string, TFile | TFolder>();
  fm = new Map<TFile, Record<string, unknown>>();
  /** Every fileManager.renameFile call, as `from -> to`. */
  renameLog: string[] = [];
  vaultEvents = new Events();
  metaEvents = new Events();

  private root = new TFolder('');

  private parentFolder(path: string): TFolder {
    const i = path.lastIndexOf('/');
    if (i === -1) return this.root;
    const parent = this.byPath.get(path.slice(0, i));
    if (!(parent instanceof TFolder)) throw new Error(`ENOENT: parent missing for ${path}`);
    return parent;
  }

  folder(path: string): TFolder {
    const existing = this.byPath.get(path);
    if (existing instanceof TFolder) return existing;
    if (existing) throw new Error(`EEXIST: file at ${path}`);
    const i = path.lastIndexOf('/');
    if (i !== -1) this.folder(path.slice(0, i));
    const created = new TFolder(path);
    this.byPath.set(path, created);
    this.parentFolder(path).children.push(created);
    return created;
  }

  file(path: string, fm: Record<string, unknown> = {}): TFile {
    if (this.byPath.has(path)) throw new Error(`EEXIST: ${path}`);
    const i = path.lastIndexOf('/');
    if (i !== -1) this.folder(path.slice(0, i));
    const name = i === -1 ? path : path.slice(i + 1);
    const dot = name.lastIndexOf('.');
    const created = new TFile(path, dot === -1 ? '' : name.slice(dot + 1));
    this.byPath.set(path, created);
    this.parentFolder(path).children.push(created);
    this.fm.set(created, fm);
    return created;
  }

  frontmatterAt(path: string): Record<string, unknown> | undefined {
    const f = this.byPath.get(path);
    return f instanceof TFile ? this.fm.get(f) : undefined;
  }

  private repath(entry: TFile | TFolder, newPath: string): void {
    this.byPath.delete(entry.path);
    if (entry instanceof TFolder) {
      for (const child of entry.children) {
        this.repath(child, `${newPath}/${child.name}`);
      }
    }
    entry.path = newPath;
    entry.name = newPath.slice(newPath.lastIndexOf('/') + 1);
    this.byPath.set(newPath, entry);
  }

  app(): App {
    const facade = {
      vault: {
        getAbstractFileByPath: (path: string) => this.byPath.get(path) ?? null,
        on: (name: string, cb: (...data: unknown[]) => unknown) => this.vaultEvents.on(name, cb),
      },
      metadataCache: {
        getFileCache: (file: TFile) => {
          const fm = this.fm.get(file);
          return fm === undefined ? null : { frontmatter: fm };
        },
        on: (name: string, cb: (...data: unknown[]) => unknown) => this.metaEvents.on(name, cb),
      },
      fileManager: {
        renameFile: async (file: TFile | TFolder, newPath: string) => {
          this.renameLog.push(`${file.path} -> ${newPath}`);
          if (this.byPath.has(newPath)) throw new Error(`EEXIST: target exists at ${newPath}`);
          const oldPath = file.path;
          const parent = this.parentFolder(newPath); // throws ENOENT like the vault
          const oldParent = this.parentFolder(oldPath);
          oldParent.children.splice(oldParent.children.indexOf(file), 1);
          this.repath(file, newPath);
          parent.children.push(file);
          this.vaultEvents.trigger('rename', file, oldPath);
        },
        processFrontMatter: async (file: TFile, mutate: (fm: Record<string, unknown>) => void) => {
          const fm = this.fm.get(file);
          if (!fm) throw new Error(`ENOENT: no file at ${file.path}`);
          mutate(fm);
          this.metaEvents.trigger('changed', file);
        },
      },
    };
    return facade as unknown as App;
  }
}
