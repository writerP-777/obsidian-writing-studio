// In-memory vault with real move semantics for migration/restore tests:
// folder renames carry their subtree, collisions and missing parents throw
// like the real vault, and every operation is logged. Shared by the engine
// suite (carryOver.test.ts) and the composed-seam suite
// (carryOverComposed.test.ts).

import { CarryOverIO, DiskState } from '../src/carryOver';

export interface MemFile {
  fm: Record<string, unknown>;
  body: string;
}

export class MemVault {
  folders = new Set<string>(['']);
  files = new Map<string, MemFile>();
  oplog: string[] = [];

  constructor(seed: { folders?: string[]; files?: Record<string, Partial<MemFile>> } = {}) {
    for (const f of seed.folders ?? []) this.folders.add(f);
    for (const [p, v] of Object.entries(seed.files ?? {})) {
      this.files.set(p, { fm: v.fm ?? {}, body: v.body ?? `body of ${p}` });
    }
  }

  private parentOf(p: string): string {
    return p.split('/').slice(0, -1).join('/');
  }

  io(): CarryOverIO {
    return {
      createFolder: async (path) => {
        this.oplog.push(`createFolder ${path}`);
        if (this.folders.has(path)) throw new Error('EEXIST: folder exists');
        if (!this.folders.has(this.parentOf(path))) throw new Error('ENOENT: parent missing');
        this.folders.add(path);
      },
      rename: async (from, to) => {
        this.oplog.push(`rename ${from} -> ${to}`);
        if (this.files.has(to) || this.folders.has(to)) throw new Error('EEXIST: target exists');
        if (!this.folders.has(this.parentOf(to))) throw new Error('ENOENT: parent missing');
        if (this.files.has(from)) {
          this.files.set(to, this.files.get(from) as MemFile);
          this.files.delete(from);
          return;
        }
        if (this.folders.has(from)) {
          const prefix = from + '/';
          for (const f of [...this.folders]) {
            if (f === from || f.startsWith(prefix)) {
              this.folders.delete(f);
              this.folders.add(to + f.slice(from.length));
            }
          }
          for (const p of [...this.files.keys()]) {
            if (p.startsWith(prefix)) {
              const v = this.files.get(p) as MemFile;
              this.files.delete(p);
              this.files.set(to + p.slice(from.length), v);
            }
          }
          return;
        }
        throw new Error('ENOENT: source missing');
      },
      writeFrontmatter: async (path, mutate) => {
        this.oplog.push(`fm ${path}`);
        const f = this.files.get(path);
        if (!f) throw new Error('ENOENT: file missing');
        mutate(f.fm);
      },
    };
  }

  disk(): DiskState {
    return {
      fileExists: p => this.files.has(p),
      folderExists: p => this.folders.has(p),
      subfolderNames: parent => [...this.folders]
        .filter(f => f !== '' && this.parentOf(f) === parent)
        .map(f => f.split('/').pop() as string),
      frontmatter: p => {
        const f = this.files.get(p);
        return f ? f.fm : null;
      },
    };
  }
}
