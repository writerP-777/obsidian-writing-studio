import { App, TFolder, TFile, Notice, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingProject, ProjectType } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';
import { SprintSession } from '../models/SprintSession';
import { BookTemplate } from '../templates/BookTemplate';
import { ArticleSeriesTemplate } from '../templates/ArticleSeriesTemplate';
import { BlogCollectionTemplate } from '../templates/BlogCollectionTemplate';
import { JournalArticleTemplate } from '../templates/JournalArticleTemplate';
import { MagazineArticleTemplate } from '../templates/MagazineArticleTemplate';

export class ProjectManager {
  private plugin: WritingStudioPlugin;
  private app: App;
  private projects = new Map<string, WritingProject>();
  private activeProjectId: string | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
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

    const folder = this.app.vault.getAbstractFileByPath(normalizePath(rootFolder));
    if (!(folder instanceof TFolder)) return;

    for (const child of folder.children) {
      if (child instanceof TFolder) {
        await this.loadProject(child.path);
      }
    }
  }

  async loadProject(folderPath: string): Promise<WritingProject | null> {
    const projectFilePath = normalizePath(`${folderPath}/_project.json`);
    const file = this.app.vault.getAbstractFileByPath(projectFilePath);
    if (!(file instanceof TFile)) return null;

    try {
      const content = await this.app.vault.read(file);
      const project: WritingProject = JSON.parse(content);
      this.projects.set(project.id, project);
      return project;
    } catch {
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
    const id = `project-${Date.now()}`;
    const folderName = title.replace(/[\\/:*?"<>|]/g, '-');
    const folderPath = normalizePath(`${rootFolder}/${folderName}`);

    // Create folder structure
    await this.ensureFolder(folderPath);
    await this.ensureFolder(normalizePath(`${folderPath}/Chapters`));
    await this.ensureFolder(normalizePath(`${folderPath}/Research`));
    await this.ensureFolder(normalizePath(`${folderPath}/Exports`));

    const now = new Date().toISOString().split('T')[0];
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
    let binderData: BinderData;
    switch (type) {
      case 'book':
        binderData = await BookTemplate.apply(this.app, project);
        break;
      case 'series':
        binderData = await ArticleSeriesTemplate.apply(this.app, project);
        break;
      case 'blog':
        binderData = await BlogCollectionTemplate.apply(this.app, project);
        break;
      case 'journal-article':
        binderData = await JournalArticleTemplate.apply(this.app, project);
        break;
      case 'magazine-article':
        binderData = await MagazineArticleTemplate.apply(this.app, project);
        break;
      default:
        binderData = this.createBlankBinder(project);
    }

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
    project.modified = new Date().toISOString().split('T')[0];
    const path = normalizePath(`${project.folderPath}/_project.json`);
    await this.writeJson(path, project);
    this.projects.set(project.id, project);
  }

  async loadBinder(project: WritingProject): Promise<BinderData> {
    const path = normalizePath(`${project.folderPath}/_binder.json`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return { version: '2.0', projectId: project.id, items: [] };
    }
    try {
      const content = await this.app.vault.read(file);
      return JSON.parse(content);
    } catch {
      return { version: '2.0', projectId: project.id, items: [] };
    }
  }

  async saveBinder(binder: BinderData): Promise<void> {
    const project = this.projects.get(binder.projectId);
    if (!project) return;
    const path = normalizePath(`${project.folderPath}/_binder.json`);
    await this.writeJson(path, binder);
  }

  async addDocumentToBinder(
    project: WritingProject,
    title: string,
    type: 'chapter' | 'section' | 'article' | 'note',
    parentId?: string
  ): Promise<BinderItem> {
    const binder = await this.loadBinder(project);
    const now = new Date().toISOString().split('T')[0];
    const fileName = title.replace(/[\\/:*?"<>|]/g, '-') + '.md';
    const filePath = normalizePath(`${project.folderPath}/Chapters/${fileName}`);

    const item: BinderItem = {
      id: `item-${Date.now()}`,
      title,
      filePath,
      type,
      order: this.getNextOrder(binder.items, parentId),
      status: 'draft',
      includeInExport: true,
    };

    const frontmatter = this.buildDocFrontmatter(title, type, item.order, now);
    await this.app.vault.create(filePath, frontmatter + '\n\n');

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

  private getNextOrder(items: BinderItem[], parentId?: string): number {
    if (parentId) {
      const parent = this.findItem(items, parentId);
      return parent?.children ? parent.children.length + 1 : 1;
    }
    return items.length + 1;
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

    const file = this.app.vault.getAbstractFileByPath(logPath);
    if (file instanceof TFile) {
      try {
        const content = await this.app.vault.read(file);
        log = JSON.parse(content);
      } catch { /* start fresh */ }
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
    const file = this.app.vault.getAbstractFileByPath(logPath);
    if (!(file instanceof TFile)) return [];
    try {
      const content = await this.app.vault.read(file);
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async initWritingLog(project: WritingProject): Promise<void> {
    const logPath = normalizePath(`${project.folderPath}/_writing-log.json`);
    await this.writeJson(logPath, []);
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!existing) {
      await this.app.vault.createFolder(path);
    }
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
}
