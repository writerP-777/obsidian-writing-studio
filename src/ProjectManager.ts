import { App, Events, EventRef, Notice, TFile, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import type { VaultFiles } from './VaultFiles';
import { t } from './i18n';
import { localDateString } from './dates';
import { WritingProject, ProjectType, defaultDocumentFolder, resolveDocumentFolder } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';
import { SprintSession } from '../models/SprintSession';
import { TemplateScaffolder } from './scaffold';
import { TEMPLATE_MANIFESTS } from '../templates/manifests';
import {
  anyBinderPathUnder,
  baseName,
  parentPath,
  pathAtOrUnder,
  rewriteBinderPaths,
  rewritePathPrefix,
} from './folderRename';

export class ProjectManager extends Events {
  private plugin: WritingStudioPlugin;
  private app: App;
  private files: VaultFiles;
  private projects = new Map<string, WritingProject>();
  private activeProjectId: string | null = null;
  private binderCache = new Map<string, BinderData>();

  constructor(plugin: WritingStudioPlugin, files: VaultFiles) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
    this.files = files;
  }

  // Project state is announced here, not pulled — subscribe instead of
  // reaching into views to refresh them after a mutation. Returned refs work
  // with Component.registerEvent for automatic cleanup.
  onActiveProjectChanged(cb: (project: WritingProject | null) => void): EventRef {
    return this.on('active-project-changed', (...data: unknown[]) => {
      cb(data[0] as WritingProject | null);
    });
  }

  onBinderChanged(cb: (binder: BinderData) => void): EventRef {
    return this.on('binder-changed', (...data: unknown[]) => {
      cb(data[0] as BinderData);
    });
  }

  onProjectsChanged(cb: () => void): EventRef {
    return this.on('projects-changed', () => {
      cb();
    });
  }

  async initialize(): Promise<void> {
    await this.loadAllProjects();
    if (this.plugin.settings.activeProjectId) {
      this.activeProjectId = this.plugin.settings.activeProjectId;
    }
  }

  async loadAllProjects(): Promise<void> {
    this.projects.clear();
    const rootFolder = this.plugin.settings.defaultProjectFolder;
    if (!rootFolder) return;

    const subfolders = this.files.listSubfolders(normalizePath(rootFolder));
    await Promise.all(subfolders.map(f => this.loadProject(f)));
  }

  async loadProject(folderPath: string): Promise<WritingProject | null> {
    const content = await this.files.readText(normalizePath(`${folderPath}/_project.json`));
    if (content === null) return null;

    try {
      const project = JSON.parse(content) as WritingProject;
      // Deleted projects keep their files in the vault, so the folder scan
      // still finds them — the tombstone list is what keeps them out
      if (this.plugin.settings.removedProjectIds.includes(project.id)) return null;
      this.projects.set(project.id, project);
      return project;
    } catch {
      new Notice(t('projectManager.corruptProject', { folder: folderPath }));
      return null;
    }
  }

  async createProject(
    title: string,
    type: ProjectType,
    author: string,
    description: string
  ): Promise<WritingProject> {
    const rootFolder = this.plugin.settings.defaultProjectFolder || 'Writing Projects';
    const id = this.uniqueId('project');
    const folderName = title.replace(/[\\/:*?"<>|]/g, '-');
    const folderPath = normalizePath(`${rootFolder}/${folderName}`);

    // Refuse rather than scaffold into an existing folder — writing into one
    // would overwrite the existing project's _project.json and _binder.json
    if (this.files.exists(folderPath)) {
      throw new Error(t('projectManager.errorFolderExists', { folder: folderName }));
    }

    // Create folder structure
    const documentFolder = defaultDocumentFolder(type);
    await this.files.ensureFolder(folderPath);
    await this.files.ensureFolder(normalizePath(`${folderPath}/${documentFolder}`));
    await this.files.ensureFolder(normalizePath(`${folderPath}/Research`));
    await this.files.ensureFolder(normalizePath(`${folderPath}/Exports`));

    const now = localDateString();
    const project: WritingProject = {
      id,
      title,
      type,
      author: author || this.plugin.settings.authorName,
      created: now,
      modified: now,
      description,
      folderPath,
      documentFolder,
      goals: {},
    };

    // Apply template
    const manifestBuilder = TEMPLATE_MANIFESTS[type];
    const binderData: BinderData = manifestBuilder
      ? await new TemplateScaffolder(this.files).apply(project, manifestBuilder(project))
      : this.createBlankBinder(project);

    await this.saveProject(project);
    await this.saveBinder(binderData);
    await this.initWritingLog(project);

    this.projects.set(id, project);
    return project;
  }

  private createBlankBinder(project: WritingProject): BinderData {
    return {
      version: '2.0',
      projectId: project.id,
      items: [],
    };
  }

  async saveProject(project: WritingProject): Promise<void> {
    project.modified = localDateString();
    const path = normalizePath(`${project.folderPath}/_project.json`);
    await this.writeJson(path, project);
    this.projects.set(project.id, project);
    this.trigger('projects-changed');
  }

  async loadBinder(project: WritingProject): Promise<BinderData> {
    const cached = this.binderCache.get(project.id);
    if (cached) return cached;

    const path = normalizePath(`${project.folderPath}/_binder.json`);
    let content: string | null;
    try {
      content = await this.files.readText(path);
    } catch {
      return { version: '2.0', projectId: project.id, items: [] };
    }
    if (content === null) {
      return { version: '2.0', projectId: project.id, items: [] };
    }
    try {
      const data = JSON.parse(content) as BinderData;
      this.binderCache.set(project.id, data);
      return data;
    } catch {
      // Preserve the corrupt file for manual repair; the returned empty binder
      // is deliberately not cached so a repaired file is picked up on next load
      await this.files.writeText(normalizePath(`${project.folderPath}/_binder.json.bak`), content);
      new Notice(t('projectManager.corruptBinder', { project: project.title }));
      return { version: '2.0', projectId: project.id, items: [] };
    }
  }

  // Same-millisecond creations produced identical Date.now() IDs
  private uniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async saveBinder(binder: BinderData): Promise<void> {
    const project = this.projects.get(binder.projectId);
    if (!project) return;
    // Keep the cache pointing at the saved object so every surface keeps
    // sharing one BinderData — deleting the entry forced a disk re-read that
    // created diverging copies and a last-writer-wins race between views
    this.binderCache.set(binder.projectId, binder);
    const path = normalizePath(`${project.folderPath}/_binder.json`);
    await this.writeJson(path, binder);
    this.trigger('binder-changed', binder);
  }

  async addDocumentToBinder(
    project: WritingProject,
    title: string,
    type: 'chapter' | 'section' | 'article' | 'note',
    parentId?: string,
    content?: string
  ): Promise<BinderItem> {
    const binder = await this.loadBinder(project);
    const now = localDateString();
    const baseName = title.replace(/[\\/:*?"<>|]/g, '-');
    const docFolder = resolveDocumentFolder(project);
    let filePath = normalizePath(`${project.folderPath}/${docFolder}/${baseName}.md`);
    for (let n = 2; this.files.exists(filePath); n++) {
      filePath = normalizePath(`${project.folderPath}/${docFolder}/${baseName} ${n}.md`);
    }

    const item: BinderItem = {
      id: this.uniqueId('item'),
      title,
      filePath,
      type,
      order: this.getNextOrder(binder.items, parentId),
      status: 'draft',
      includeInExport: true,
    };

    // Callers that already have the full document body (duplicate) pass it in
    // so the file is written once instead of template-then-overwrite
    const frontmatter = this.buildDocFrontmatter(title, type, item.order, now);
    await this.files.writeText(filePath, content ?? frontmatter + '\n\n');

    this.insertIntoBinder(binder, item, parentId);
    await this.saveBinder(binder);
    return item;
  }

  // Structural items (group/part) organize the binder tree only — they have
  // no backing file, so nothing is written to the vault
  async addStructuralItem(
    project: WritingProject,
    title: string,
    type: 'group' | 'part',
    parentId?: string
  ): Promise<BinderItem> {
    const binder = await this.loadBinder(project);
    const item: BinderItem = {
      id: this.uniqueId('item'),
      title,
      filePath: '',
      type,
      order: this.getNextOrder(binder.items, parentId),
      status: 'draft',
      includeInExport: true,
    };
    this.insertIntoBinder(binder, item, parentId);
    await this.saveBinder(binder);
    return item;
  }

  // Document items only — structural items (group/part) keep their type,
  // and document items can never become structural
  async updateItemType(
    project: WritingProject,
    itemId: string,
    type: 'chapter' | 'section' | 'article' | 'note'
  ): Promise<void> {
    const binder = await this.loadBinder(project);
    const item = this.findItem(binder.items, itemId);
    if (item && item.type !== 'group' && item.type !== 'part' && item.type !== type) {
      item.type = type;
      await this.saveBinder(binder);
    }
  }

  private insertIntoBinder(binder: BinderData, item: BinderItem, parentId?: string): void {
    if (parentId) {
      const parent = this.findItem(binder.items, parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(item);
        return;
      }
    }
    binder.items.push(item);
  }

  private buildDocFrontmatter(title: string, type: string, order: number, date: string): string {
    return `---
title: "${title}"
type: ${type}
order: ${order}
status: draft
word-count-goal: 0
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---`;
  }

  // Max + 1, not length + 1 — after drag reordering, sibling counts no longer
  // track the highest assigned order, so length-based values could collide
  private getNextOrder(items: BinderItem[], parentId?: string): number {
    const siblings = parentId
      ? this.findItem(items, parentId)?.children ?? []
      : items;
    return siblings.reduce((max, i) => Math.max(max, i.order), 0) + 1;
  }

  findItem(items: BinderItem[], id: string): BinderItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = this.findItem(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  async removeItemFromBinder(project: WritingProject, itemId: string): Promise<void> {
    const binder = await this.loadBinder(project);
    binder.items = this.removeFromTree(binder.items, itemId);
    await this.saveBinder(binder);
  }

  // The inverse of "Add to writing project" — drops the binder entry and
  // leaves the file untouched. The removed item's children are promoted into
  // its position so no entries are orphaned.
  async removeFromBinderPromoteChildren(project: WritingProject, itemId: string): Promise<void> {
    const binder = await this.loadBinder(project);
    binder.items = this.promoteAndRemove(binder.items, itemId);
    this.renumberOrders(binder.items);
    await this.saveBinder(binder);
  }

  private promoteAndRemove(items: BinderItem[], id: string): BinderItem[] {
    const result: BinderItem[] = [];
    for (const item of items) {
      if (item.id === id) {
        result.push(...(item.children ?? []));
      } else {
        result.push({
          ...item,
          children: item.children ? this.promoteAndRemove(item.children, id) : undefined,
        });
      }
    }
    return result;
  }

  // Array position is the rendering order; keep the order fields in step the
  // same way drag reordering does
  private renumberOrders(items: BinderItem[]): void {
    items.forEach((item, i) => {
      item.order = i + 1;
      if (item.children) this.renumberOrders(item.children);
    });
  }

  private removeFromTree(items: BinderItem[], id: string): BinderItem[] {
    return items
      .filter(item => item.id !== id)
      .map(item => ({
        ...item,
        children: item.children ? this.removeFromTree(item.children, id) : undefined,
      }));
  }

  async updateItemStatus(project: WritingProject, itemId: string, status: BinderItem['status']): Promise<void> {
    const binder = await this.loadBinder(project);
    const item = this.findItem(binder.items, itemId);
    if (item) {
      item.status = status;
      await this.saveBinder(binder);
    }
  }

  async logSprintSession(project: WritingProject, session: SprintSession): Promise<void> {
    const logPath = normalizePath(`${project.folderPath}/_writing-log.json`);
    let log: SprintSession[] = [];

    const content = await this.files.readText(logPath);
    if (content !== null) {
      try {
        log = JSON.parse(content) as SprintSession[];
      } catch {
        // Surface the reset — silently starting fresh hid sprint-history loss
        new Notice(t('projectManager.corruptLog', { project: project.title }));
      }
    }

    log.push(session);

    // Trim old entries based on retention setting
    const retentionDays = this.plugin.settings.sprintHistoryRetention;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    log = log.filter(s => new Date(s.date) >= cutoff);

    await this.writeJson(logPath, log);
  }

  async getWritingLog(project: WritingProject): Promise<SprintSession[]> {
    const logPath = normalizePath(`${project.folderPath}/_writing-log.json`);
    try {
      const content = await this.files.readText(logPath);
      return content === null ? [] : JSON.parse(content) as SprintSession[];
    } catch {
      return [];
    }
  }

  private async initWritingLog(project: WritingProject): Promise<void> {
    const logPath = normalizePath(`${project.folderPath}/_writing-log.json`);
    await this.writeJson(logPath, []);
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    await this.files.writeText(path, JSON.stringify(data, null, 2));
  }

  getProjects(): WritingProject[] {
    return Array.from(this.projects.values());
  }

  getProject(id: string): WritingProject | undefined {
    return this.projects.get(id);
  }

  getActiveProject(): WritingProject | null {
    if (!this.activeProjectId) return null;
    return this.projects.get(this.activeProjectId) || null;
  }

  // Registry-only removal — the project folder, its documents, _project.json,
  // and _binder.json all stay untouched in the vault
  async deleteProject(id: string): Promise<void> {
    if (!this.projects.has(id)) return;
    this.projects.delete(id);
    this.binderCache.delete(id);
    if (!this.plugin.settings.removedProjectIds.includes(id)) {
      this.plugin.settings.removedProjectIds.push(id);
    }
    if (this.activeProjectId === id) {
      await this.setActiveProject(null); // also persists settings
    } else {
      await this.plugin.saveSettings();
    }
    this.trigger('projects-changed');
  }

  async setActiveProject(id: string | null): Promise<void> {
    this.activeProjectId = id;
    this.plugin.settings.activeProjectId = id;
    await this.plugin.saveSettings();
    this.trigger('active-project-changed', this.getActiveProject());
  }

  flattenBinder(items: BinderItem[]): BinderItem[] {
    const result: BinderItem[] = [];
    for (const item of items) {
      result.push(item);
      if (item.children) {
        result.push(...this.flattenBinder(item.children));
      }
    }
    return result;
  }

  private findBinderItemByPath(items: BinderItem[], filePath: string): BinderItem | undefined {
    for (const item of items) {
      if (item.filePath === filePath) return item;
      if (item.children) {
        const found = this.findBinderItemByPath(item.children, filePath);
        if (found) return found;
      }
    }
    return undefined;
  }

  // Follows a vault folder rename. Obsidian moved the files; this updates the
  // plugin's records to match: binder filePaths under the old prefix are
  // batch-rewritten (one save per affected binder), folderPath is repointed
  // for projects at or under the renamed path, and documentFolder is renamed
  // along with the folder it names. Idempotent — a replayed event, or one
  // arriving after the per-child TFile events already repaired the paths,
  // finds nothing left to rewrite.
  async handleFolderRename(oldPath: string, newPath: string): Promise<void> {
    for (const project of this.getProjects()) {
      // Repoint folderPath before touching the binder — when the project
      // folder itself or an ancestor moved, the binder file now lives at the
      // new location and must be read from and saved to it. documentFolder
      // is a bare name relative to folderPath, so it is untouched here.
      const folderPathChanged = pathAtOrUnder(project.folderPath, oldPath);
      if (folderPathChanged) {
        project.folderPath = rewritePathPrefix(project.folderPath, oldPath, newPath);
        await this.saveProject(project);
      }

      const binder = await this.loadBinder(project);
      const binderChanged = rewriteBinderPaths(binder.items, oldPath, newPath);
      // A moved project folder needs its binder written at the new location
      // even when per-child TFile events already repaired the paths.
      if (binderChanged || folderPathChanged) await this.saveBinder(binder);

      if (this.isDocumentFolderRename(project, oldPath, newPath, binder.items, binderChanged)
          && project.documentFolder !== baseName(newPath)) {
        project.documentFolder = baseName(newPath);
        await this.saveProject(project);
      }
    }
  }

  // The renamed folder is a project's document folder when it is a direct
  // child of the project folder and either carries the recorded name, or —
  // when the recorded name is stale (renamed while the plugin was off) — it
  // held binder documents and the recorded folder no longer exists.
  private isDocumentFolderRename(
    project: WritingProject,
    oldPath: string,
    newPath: string,
    items: BinderItem[],
    binderChanged: boolean,
  ): boolean {
    if (parentPath(oldPath) !== project.folderPath) return false;
    const recorded = resolveDocumentFolder(project);
    if (baseName(oldPath).toLowerCase() === recorded.toLowerCase()) return true;
    // The rewrite pass already moved matching paths under newPath, so a
    // binder that held this folder's documents shows it either way.
    const heldDocuments = binderChanged || anyBinderPathUnder(items, newPath);
    return heldDocuments && !this.files.exists(normalizePath(`${project.folderPath}/${recorded}`));
  }

  // A single .md rename or move. Only rewrite the title when the basename
  // actually changed — a folder rename fires this once per child with the
  // basename intact, and user-set titles must survive that.
  async repairBinderPaths(oldPath: string, newPath: string, newBasename: string): Promise<void> {
    const oldBasename = baseName(oldPath).replace(/\.md$/, '');
    for (const project of this.getProjects()) {
      const binder = await this.loadBinder(project);
      const item = this.findBinderItemByPath(binder.items, oldPath);
      if (item) {
        item.filePath = newPath;
        if (oldBasename !== newBasename) item.title = newBasename;
        await this.saveBinder(binder);
        break;
      }
    }
  }

  // The goal modal needs the writable binder entry, not just the resolved
  // number — null when the file is not in the active project's binder.
  async findBinderEntryForFile(filePath: string): Promise<{ binder: BinderData; item: BinderItem } | null> {
    const project = this.getActiveProject();
    if (!project) return null;
    const binder = await this.loadBinder(project);
    const item = this.findBinderItemByPath(binder.items, filePath);
    return item ? { binder, item } : null;
  }

  async getWordCountGoalForFile(file: TFile): Promise<number | undefined> {
    const project = this.getActiveProject();
    if (project) {
      const binder = await this.loadBinder(project);
      const item = this.findBinderItemByPath(binder.items, file.path);
      if (item?.wordCountGoal && item.wordCountGoal > 0) return item.wordCountGoal;
    }
    // Frontmatter is user-typed — a string "500" passes the type cast and
    // produces NaN math downstream, so validate before returning
    const cache = this.app.metadataCache.getFileCache(file);
    const raw: unknown = cache?.frontmatter?.['word-count-goal'];
    const goal = Number(raw);
    return Number.isFinite(goal) && goal > 0 ? goal : undefined;
  }
}
