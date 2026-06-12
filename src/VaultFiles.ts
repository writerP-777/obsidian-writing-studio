import { App, FileSystemAdapter, TFile, TFolder } from 'obsidian';

// The narrow seam over vault file I/O. Engines and the project manager
// consume this interface instead of app.vault, so their behavior is testable
// against the in-memory adapter in tests/inMemoryVaultFiles.ts.
// Paths are vault-relative and already normalized by callers.
export interface VaultFiles {
  // Resolves to null when the file does not exist.
  readText(path: string): Promise<string | null>;
  // Creates the file, or overwrites it if it exists.
  writeText(path: string, content: string): Promise<void>;
  // Resolves to null when the file does not exist.
  readBinary(path: string): Promise<ArrayBuffer | null>;
  // Creates the file, or overwrites it if it exists.
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  // Permanent removal — not moved to trash.
  remove(path: string): Promise<void>;
  exists(path: string): boolean;
  ensureFolder(path: string): Promise<void>;
  // Paths of the immediate child folders, or [] if path is not a folder.
  listSubfolders(path: string): string[];
  // Absolute filesystem path for external tools (pandoc). Falls back to the
  // vault-relative path on platforms without filesystem access.
  absolutePath(path: string): string;
}

export class ObsidianVaultFiles implements VaultFiles {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async readText(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.read(file) : null;
  }

  async writeText(path: string, content: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  async readBinary(path: string): Promise<ArrayBuffer | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.readBinary(file) : null;
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, data);
    } else {
      await this.app.vault.createBinary(path, data);
    }
  }

  async remove(path: string): Promise<void> {
    if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) {
      await this.app.vault.adapter.remove(path);
    }
  }

  exists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }

  async ensureFolder(path: string): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      await this.app.vault.createFolder(path);
    }
  }

  listSubfolders(path: string): string[] {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter((c): c is TFolder => c instanceof TFolder).map(c => c.path);
  }

  absolutePath(path: string): string {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getFullPath(path) : path;
  }
}
