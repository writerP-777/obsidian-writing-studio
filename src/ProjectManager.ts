import { App, Events, EventRef, Notice, TFile, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import type { VaultFiles } from './VaultFiles';
import { t } from './i18n';
import { localDateString } from './dates';
import { WritingProject, ProjectType } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';
import { SprintSession } from '../models/SprintSession';
import { TemplateScaffolder } from './scaffold';
import { TEMPLATE_MANIFESTS } from '../templates/manifests';

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
    await this.files.ensureFolder(folderPath);
    await this.files.ensureFolder(normalizePath(`${folderPath}/Chapters`));
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
    let filePath = normalizePath(`${project.folderPath}/Chapters/${baseName}.md`);
    for (let n = 2; this.files.exists(filePath); n++) {
      filePath = normalizePath(`${project.folderPath}/Chapters/${baseName} ${n}.md`);
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

    if (parentId) {
      const parent = this.findItem(binder.items, parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(item);
      } else {
        binder.items.push(item);
      }
    } else {
      binder.items.push(item);
    }

    await this.saveBinder(binder);
    return item;
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
