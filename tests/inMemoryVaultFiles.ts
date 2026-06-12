import type { VaultFiles } from '../src/VaultFiles';

// In-memory VaultFiles adapter — the second adapter that makes the seam real.
// Tests seed `files` and `folders` directly and assert on them after the run.
export class InMemoryVaultFiles implements VaultFiles {
  files = new Map<string, string | ArrayBuffer>();
  folders = new Set<string>();

  async readText(path: string): Promise<string | null> {
    const value = this.files.get(path);
    return typeof value === 'string' ? value : null;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async readBinary(path: string): Promise<ArrayBuffer | null> {
    const value = this.files.get(path);
    return value instanceof ArrayBuffer ? value : null;
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, data);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  exists(path: string): boolean {
    return this.files.has(path) || this.folders.has(path);
  }

  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  listSubfolders(path: string): string[] {
    return [...this.folders].filter(f =>
      f.startsWith(path + '/') && !f.slice(path.length + 1).includes('/')
    );
  }

  absolutePath(path: string): string {
    return `/vault/${path}`;
  }
}
