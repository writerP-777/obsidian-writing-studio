import { App, TFile } from 'obsidian';
import { WPPostMeta } from '../models/WordPressSite';
import type WritingStudioPlugin from '../main';

export class FrontmatterManager {
  private plugin: WritingStudioPlugin;
  private app: App;
  private pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();
  private writingFiles = new Set<string>();
  private lastPluginWrite = new Map<string, number>();

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  scheduleUpdate(file: TFile): void {
    if (!this.plugin.settings.frontmatterAutoUpdate) return;
    if (!this.isWritingProjectFile(file)) return;
    if (this.writingFiles.has(file.path)) return;

    // Guard against the modify event fired by processFrontMatter itself.
    // The event arrives after the finally block clears writingFiles, so we
    // track the write timestamp and ignore modify events within 2 seconds.
    const lastWrite = this.lastPluginWrite.get(file.path) ?? 0;
    if (Date.now() - lastWrite < 2000) return;

    const existing = this.pendingUpdates.get(file.path);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingUpdates.delete(file.path);
      this.updateFrontmatter(file);
    }, 5000);

    this.pendingUpdates.set(file.path, timer);
  }

  private isWritingProjectFile(file: TFile): boolean {
    if (file.extension !== 'md') return false;
    const projectFolder = this.plugin.settings.defaultProjectFolder;
    if (!projectFolder) return false;
    return file.path.startsWith(projectFolder);
  }

  async updateFrontmatter(file: TFile): Promise<void> {
    this.writingFiles.add(file.path);
    try {
      const content = await this.app.vault.read(file);
      const wordCount = this.countWords(content);
      const now = new Date().toISOString().split('T')[0];

      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm['word-count'] = wordCount;
        fm['modified'] = now;
      });

      // Record write time AFTER processFrontMatter so the timestamp-based guard
      // in scheduleUpdate blocks the modify event that processFrontMatter fires.
      this.lastPluginWrite.set(file.path, Date.now());
    } catch {
      // File may have been deleted or locked
    } finally {
      // Keep the file in writingFiles briefly so any synchronously-delivered
      // modify event from processFrontMatter is still caught by the set guard.
      window.setTimeout(() => this.writingFiles.delete(file.path), 500);
    }
  }

  private setFrontmatterFields(content: string, fields: Record<string, string | number>): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return content;

    let fm = fmMatch[1];
    for (const [key, value] of Object.entries(fields)) {
      const lineRegex = new RegExp(`^${key}:.*$`, 'm');
      const newLine = `${key}: ${value}`;
      if (lineRegex.test(fm)) {
        fm = fm.replace(lineRegex, newLine);
      } else {
        fm += `\n${newLine}`;
      }
    }

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  }

  countWords(content: string): number {
    // Strip frontmatter
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    // Strip markdown syntax
    const stripped = body
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_~`]/g, '')
      .replace(/\n/g, ' ')
      .trim();

    if (!stripped) return 0;
    return stripped.split(/\s+/).filter(w => w.length > 0).length;
  }

  buildFrontmatter(fields: Record<string, unknown>): string {
    const lines = ['---'];
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.map(v => `${v}`).join(', ')}]`);
      } else if (typeof value === 'string') {
        const needsQuotes = value.includes(':') || value.includes('#') || value.includes('"');
        lines.push(`${key}: ${needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value}`);
      } else {
        lines.push(`${key}: ${String(value)}`);
      }
    }
    lines.push('---');
    return lines.join('\n');
  }

  parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const result: Record<string, unknown> = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const key = line.slice(0, colonIdx).trim();
      let val: string = line.slice(colonIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      if (val.startsWith('[') && val.endsWith(']')) {
        result[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else if (!isNaN(Number(val)) && val !== '') {
        result[key] = Number(val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  setFrontmatterField(content: string, key: string, value: unknown): string {
    return this.setFrontmatterFields(content, { [key]: value as string | number });
  }

  setWpMeta(content: string, meta: WPPostMeta): string {
    const fields: Record<string, string | number | null> = {
      'wp-site': meta.wpSite,
      'wp-post-id': meta.wpPostId,
      'wp-url': meta.wpUrl,
      'wp-status': meta.wpStatus,
      'wp-published': meta.wpPublished || null,
      'wp-scheduled': meta.wpScheduled || null,
    };

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      // No frontmatter — prepend
      const lines = ['---'];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== null) lines.push(`${k}: "${v}"`);
      }
      lines.push('---');
      return lines.join('\n') + '\n' + content;
    }

    let fm = fmMatch[1];
    for (const [k, v] of Object.entries(fields)) {
      const regex = new RegExp(`^${k}:.*$`, 'm');
      if (v === null) {
        fm = fm.replace(regex, `${k}: null`);
      } else if (regex.test(fm)) {
        fm = fm.replace(regex, `${k}: "${v}"`);
      } else {
        fm += `\n${k}: "${v}"`;
      }
    }

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  }

  destroy(): void {
    for (const timer of this.pendingUpdates.values()) {
      clearTimeout(timer);
    }
    this.pendingUpdates.clear();
  }
}
