import { App, TFile, normalizePath } from 'obsidian';
import { localDateString } from './dates';
import { countWords } from './words';
import type WritingStudioPlugin from '../main';

export class FrontmatterManager {
  private plugin: WritingStudioPlugin;
  private app: App;
  private pendingUpdates = new Map<string, number>();
  private writingFiles = new Set<string>();
  private suppressNextModify = new Set<string>();

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  scheduleUpdate(file: TFile): void {
    if (!this.plugin.settings.frontmatterAutoUpdate) return;
    if (!this.isWritingProjectFile(file)) return;
    if (this.writingFiles.has(file.path)) return;

    // Guard against the modify event fired by processFrontMatter itself.
    // One-shot: consume the flag and skip exactly one event — a fixed time
    // window also swallowed real user edits made right after a plugin write.
    if (this.suppressNextModify.delete(file.path)) return;

    const existing = this.pendingUpdates.get(file.path);
    if (existing) window.clearTimeout(existing);

    const timer = window.setTimeout(() => {
      this.pendingUpdates.delete(file.path);
      void this.updateFrontmatter(file);
    }, 5000);

    this.pendingUpdates.set(file.path, timer);
  }

  private isWritingProjectFile(file: TFile): boolean {
    if (file.extension !== 'md') return false;
    const projectFolder = this.plugin.settings.defaultProjectFolder;
    if (!projectFolder) return false;
    // Trailing slash so a project folder of "Writing" cannot match sibling
    // folders like "Writing Archive/" and auto-edit unrelated notes
    return file.path.startsWith(normalizePath(projectFolder) + '/');
  }

  async updateFrontmatter(file: TFile): Promise<void> {
    this.writingFiles.add(file.path);
    try {
      const content = await this.app.vault.read(file);
      const wordCount = this.countWords(content);
      const now = localDateString();

      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm['word-count'] = wordCount;
        fm['modified'] = now;
      });

      // Arm the one-shot guard AFTER processFrontMatter so it blocks the modify
      // event that write fires; clear it eventually in case no event arrives
      // (processFrontMatter skips the write when nothing changed)
      this.suppressNextModify.add(file.path);
      window.setTimeout(() => this.suppressNextModify.delete(file.path), 2000);
    } catch {
      // File may have been deleted or locked
    } finally {
      // Keep the file in writingFiles briefly so any synchronously-delivered
      // modify event from processFrontMatter is still caught by the set guard.
      window.setTimeout(() => this.writingFiles.delete(file.path), 500);
    }
  }

  countWords(content: string): number {
    return countWords(content);
  }

  destroy(): void {
    for (const timer of this.pendingUpdates.values()) {
      window.clearTimeout(timer);
    }
    this.pendingUpdates.clear();
  }
}
