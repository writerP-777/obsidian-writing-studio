import { App, Events, EventRef, Notice, TFile, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import type { VaultFiles } from './VaultFiles';
import { t } from './i18n';
import { localDateString } from './dates';
import { WritingProject, ProjectType, defaultDocumentFolder, resolveDocumentFolder } from '../models/Project';
import { SprintSession } from '../models/SprintSession';
import { TemplateScaffolder } from './scaffold';
import { TEMPLATE_MANIFESTS } from '../templates/manifests';
import {
  baseName,
  parentPath,
  pathAtOrUnder,
  rewritePathPrefix,
} from './folderRename';

export class ProjectManager extends Events {
  private plugin: WritingStudioPlugin;
  private app: App;
  private files: VaultFiles;
  private projects = new Map<string, WritingProject>();
  private activeProjectId: string | null = null;

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
    // would overwrite the existing project's _project.json
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

    // Apply template — folders and documents only; the filesystem is the
    // binder (#233), so no _binder.json is created
    const manifestBuilder = TEMPLATE_MANIFESTS[type];
    if (manifestBuilder) {
      await new TemplateScaffolder(this.files).apply(project, manifestBuilder(project));
    }

    await this.saveProject(project);
    await this.initWritingLog(project);

    this.projects.set(id, project);
    return project;
  }

  async saveProject(project: WritingProject): Promise<void> {
    project.modified = localDateString();
    const path = normalizePath(`${project.folderPath}/_project.json`);
    await this.writeJson(path, project);
    this.projects.set(project.id, project);
    this.trigger('projects-changed');
  }

  // Same-millisecond creations produced identical Date.now() IDs
  private uniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  // and any legacy _binder.json all stay untouched in the vault
  async deleteProject(id: string): Promise<void> {
    if (!this.projects.has(id)) return;
    this.projects.delete(id);
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

  // Follows a vault folder rename. Obsidian moved the files; this updates the
  // plugin's records to match: folderPath is repointed for projects at or
  // under the renamed path, and documentFolder is renamed along with the
  // folder it names. Idempotent — a replayed event finds nothing to change.
  // The binder needs no repair since #233 — it renders disk truth.
  async handleFolderRename(oldPath: string, newPath: string): Promise<void> {
    for (const project of this.getProjects()) {
      if (pathAtOrUnder(project.folderPath, oldPath)) {
        project.folderPath = rewritePathPrefix(project.folderPath, oldPath, newPath);
        await this.saveProject(project);
      }

      // The renamed folder is this project's document folder when it is a
      // direct child of the project folder carrying the recorded name. (The
      // stale-name heuristic died with the binder — its evidence was binder
      // entries.)
      if (parentPath(oldPath) === project.folderPath
          && baseName(oldPath).toLowerCase() === resolveDocumentFolder(project).toLowerCase()
          && project.documentFolder !== baseName(newPath)) {
        project.documentFolder = baseName(newPath);
        await this.saveProject(project);
      }
    }
  }

  // Frontmatter `word-count-goal` is the sole goal authority (#229, ungated
  // at #233). Frontmatter is user-typed — a string "500" passes the type
  // cast and produces NaN math downstream, so validate before returning.
  getWordCountGoalForFile(file: TFile): number | undefined {
    const cache = this.app.metadataCache.getFileCache(file);
    const raw: unknown = cache?.frontmatter?.['word-count-goal'];
    const goal = Number(raw);
    return Number.isFinite(goal) && goal > 0 ? goal : undefined;
  }
}
