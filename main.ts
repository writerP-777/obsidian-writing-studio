import {
  App,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  Setting,
  WorkspaceLeaf,
  TFile,
  TFolder,
  Menu,
} from 'obsidian';

import { BinderView, BINDER_VIEW_TYPE } from './src/BinderView';
import { FilesystemBinderView, BinderDrawerPref } from './src/FilesystemBinderView';
import { CompilePreviewView, COMPILE_PREVIEW_VIEW_TYPE } from './src/CompilePreview';
import { LauncherView, LAUNCHER_VIEW_TYPE } from './src/LauncherView';
import { FocusMode } from './src/FocusMode';
import { TypographyMode } from './src/TypographyMode';
import { WritingModes } from './src/WritingModes';
import { SprintTimer } from './src/SprintTimer';
import { ExportEngine, type ExportFormat, type PdfEnginePreference } from './src/ExportEngine';
import { WordPressClient } from './src/WordPressClient';
import { ProjectManager } from './src/ProjectManager';
import { StatsTracker } from './src/StatsTracker';
import { FrontmatterManager } from './src/FrontmatterManager';
import { WritingStudioSettingsTab } from './src/SettingsTab';
import { FolderSidebarView, FolderPickerModal, FOLDER_SIDEBAR_VIEW_TYPE } from './src/FolderSidebarView';
import { initI18n, t } from './src/i18n';
import { WritingLogView, WRITING_LOG_VIEW_TYPE } from './src/WritingLogView';
import { registerCommands } from './src/commands';
import { StatusBar } from './src/StatusBar';
import { GoalBanner } from './src/GoalBanner';
import { ObsidianVaultFiles, type VaultFiles } from './src/VaultFiles';
import { StudioEvents } from './src/StudioEvents';
import { maybeOfferCarryOver, openCarryOverPreview } from './src/carryOverBridge';

import { AddToProjectModal } from './modals/AddToProjectModal';
import { SprintModal } from './modals/SprintModal';
import { ExportModal } from './modals/ExportModal';
import { PublishModal } from './modals/PublishModal';
import { ProjectModal } from './modals/ProjectModal';
import { TargetsDashboardModal } from './modals/TargetsDashboardModal';
import { WritingDashboardModal } from './modals/WritingDashboardModal';

import { WordPressSite } from './models/WordPressSite';
import { resolveDefaultDocumentType } from './models/Project';
import { WritingModeType } from './models/WritingMode';
import type { BinderData, BinderItem } from './models/BinderItem';

// Minimal subset of the Notebook Navigator public API (v1.2–2.x) used by Writing Studio.
// Full spec: https://github.com/johansan/notebook-navigator/blob/main/docs/api-reference.md
interface NNMenuItem {
  setTitle(title: string): this;
  setIcon(icon: string): this;
  onClick(cb: () => void): this;
}
interface NNFolderMenuContext {
  addItem: (cb: (item: NNMenuItem) => void) => void;
  folder: TFolder;
}
interface NNApi {
  getVersion(): string;
  menus?: {
    registerFolderMenu(cb: (ctx: NNFolderMenuContext) => void): () => void;
  };
}
interface NNPlugin { api?: NNApi }
type AppWithPlugins = App & { plugins: { plugins: Record<string, NNPlugin> } };

const TYPOGRAPHY_FONT_OPTIONS: { key: string; label: string }[] = [
  { key: 'mono',               label: 'Monospaced (ia writer mono)' },
  { key: 'serif',              label: 'Serif (ia writer duo serif)' },
  { key: 'sans',               label: 'Sans-serif (ia writer quattro)' },
  { key: 'cormorant-garamond', label: 'Cormorant garamond' },
  { key: 'crimson-text',       label: 'Crimson text' },
  { key: 'eb-garamond',        label: 'Eb garamond' },
  { key: 'libre-baskerville',  label: 'Libre baskerville' },
  { key: 'libre-caslon-text',  label: 'Libre caslon text' },
  { key: 'literata',           label: 'Literata' },
  { key: 'lora',               label: 'Lora' },
  { key: 'inter',              label: 'Inter' },
  { key: 'lato',               label: 'Lato' },
  { key: 'source-sans-3',      label: 'Source sans 3' },
];

export interface WritingStudioSettings {
  // General
  openOnStartup: boolean;
  defaultProjectFolder: string;
  authorName: string;
  defaultDocumentType: 'chapter' | 'section' | 'article' | 'note';
  frontmatterAutoUpdate: boolean;
  // Focus Mode
  focusUnit: 'paragraph' | 'sentence';
  dimOpacity: number;
  focusFontSize: number;
  focusAutoHideSidebars: boolean;
  typewriterScroll: boolean;
  // Typography Mode
  typographyModeActive: boolean;
  typographyFont: string;
  customFontName: string;
  maxLineLength: number;
  typographyFontSize: number;
  lineHeight: number;
  letterSpacing: string;
  persistTypography: boolean;
  // Sprint & Goals
  defaultSprintDuration: number;
  defaultDailyWordGoal: number;
  soundNotifications: boolean;
  sprintHistoryRetention: number;
  inlineGoalBanner: boolean;
  // Daily Writing Log
  appendToDailyNote: boolean;
  // Export
  defaultExportFormat: ExportFormat;
  defaultPaperSize: 'letter' | 'a4';
  defaultExportFont: string;
  defaultExportFontSize: number;
  pandocPath: string;
  pdfEngine: PdfEnginePreference;
  epubLanguage: string;
  epubIncludeCover: boolean;
  // WordPress
  wordPressSites: WordPressSite[];
  wikilinkHandling: 'strip' | 'convert';
  // Experimental
  // ADR 0001 preview: the binder renders the project folder tree read-only
  // instead of _binder.json. Off = the shipped binder, untouched.
  filesystemBinder: boolean;
  // Resources-drawer open state and active tab, per project id — a view
  // preference, deliberately kept out of the vault
  binderDrawer: Record<string, BinderDrawerPref>;
  // Projects whose one-time carry-over notice has been shown (#230) — the
  // command and the binder's project-row button re-offer it any time
  carryOverNoticeSeen: Record<string, boolean>;
  // State
  activeProjectId: string | null;
  currentWritingMode: WritingModeType;
  // Projects are discovered by folder scan, so a deleted project's id is
  // tombstoned here to keep it out of the registry while its files stay put
  removedProjectIds: string[];
}

const DEFAULT_SETTINGS: WritingStudioSettings = {
  openOnStartup: true,
  defaultProjectFolder: 'Writing Projects',
  authorName: '',
  defaultDocumentType: 'chapter',
  frontmatterAutoUpdate: true,
  focusUnit: 'paragraph',
  dimOpacity: 20,
  focusFontSize: 0,
  focusAutoHideSidebars: true,
  typewriterScroll: true,
  typographyModeActive: false,
  typographyFont: 'serif',
  customFontName: '',
  maxLineLength: 65,
  typographyFontSize: 18,
  lineHeight: 1.7,
  letterSpacing: 'normal',
  persistTypography: false,
  defaultSprintDuration: 25,
  defaultDailyWordGoal: 1000,
  soundNotifications: true,
  sprintHistoryRetention: 90,
  inlineGoalBanner: true,
  appendToDailyNote: true,
  defaultExportFormat: 'md',
  defaultPaperSize: 'letter',
  defaultExportFont: 'Georgia',
  defaultExportFontSize: 12,
  pandocPath: 'pandoc',
  pdfEngine: 'auto',
  epubLanguage: 'en',
  epubIncludeCover: true,
  wordPressSites: [],
  wikilinkHandling: 'strip',
  filesystemBinder: false,
  binderDrawer: {},
  carryOverNoticeSeen: {},
  activeProjectId: null,
  currentWritingMode: 'none',
  removedProjectIds: [],
};

export default class WritingStudioPlugin extends Plugin {
  settings!: WritingStudioSettings;

  focusMode!: FocusMode;
  typographyMode!: TypographyMode;
  writingModes!: WritingModes;
  sprintTimer!: SprintTimer;
  exportEngine!: ExportEngine;
  wpClient!: WordPressClient;
  projectManager!: ProjectManager;
  statsTracker!: StatsTracker;
  fmManager!: FrontmatterManager;
  statusBar!: StatusBar;
  goalBanner!: GoalBanner;
  vaultFiles!: VaultFiles;
  studioEvents!: StudioEvents;

  private wordCountUpdateTimer: number | null = null;
  private launcherRefreshTimer: number | null = null;
  private nnFolderMenuDispose: (() => void) | undefined;
  private studioActivated = false;
  private isReady = false;

  async onload(): Promise<void> {
    await initI18n();
    await this.loadSettings();

    // Initialize modules
    this.studioEvents = new StudioEvents();
    this.vaultFiles = new ObsidianVaultFiles(this.app);
    this.fmManager = new FrontmatterManager(this);
    this.projectManager = new ProjectManager(this, this.vaultFiles);
    this.statsTracker = new StatsTracker(this);
    this.registerEvent(this.projectManager.onBinderChanged(() => {
      this.statsTracker.invalidateWordCountCache();
    }));
    // Goal/title edits and project switches refresh the status bar goal bar.
    // Gated on launch — before activateStudio() the status bar stays untouched.
    this.registerEvent(this.projectManager.onProjectsChanged(() => {
      if (this.studioActivated) void this.statusBar.updateProjectGoalBar();
    }));
    this.registerEvent(this.projectManager.onActiveProjectChanged(() => {
      if (this.studioActivated) void this.statusBar.updateProjectGoalBar();
      void maybeOfferCarryOver(this);
    }));
    this.focusMode = new FocusMode(this);
    this.typographyMode = new TypographyMode(this);
    this.writingModes = new WritingModes(this);
    this.sprintTimer = new SprintTimer(this);
    this.exportEngine = new ExportEngine(this, this.vaultFiles);
    this.wpClient = new WordPressClient();
    this.goalBanner = new GoalBanner(this);

    // Register CM6 editor extension for focus mode
    this.registerEditorExtension(this.focusMode.getEditorExtension());

    // Register views
    this.registerView(LAUNCHER_VIEW_TYPE, (leaf) => new LauncherView(leaf, this));
    // The experimental setting picks the binder implementation at leaf
    // creation; both classes share the view type so every entry point
    // (ribbon, commands, launcher, workspace restore) works unchanged
    this.registerView(BINDER_VIEW_TYPE, (leaf) =>
      this.settings.filesystemBinder ? new FilesystemBinderView(leaf, this) : new BinderView(leaf, this));
    this.registerView(COMPILE_PREVIEW_VIEW_TYPE, (leaf) => new CompilePreviewView(leaf, this));
    this.registerView(FOLDER_SIDEBAR_VIEW_TYPE, (leaf) => new FolderSidebarView(leaf));
    this.registerView(WRITING_LOG_VIEW_TYPE, (leaf) => new WritingLogView(leaf, this));

    // Status bar items
    this.statusBar = new StatusBar(this);
    this.statusBar.init((e) => this.showModeSwitcher(e));

    // Register sprint complete handler
    this.sprintTimer.setOnComplete(async (session) => {
      this.statsTracker.recordSprint(session);
      const project = this.projectManager.getActiveProject();
      if (project) {
        await this.projectManager.logSprintSession(project, session);
      }
      new SprintSummaryModal(this.app, session).open();
    });

    // Ribbon icons — launcher only; all other features are accessible via the launcher panel, commands, or context menu
    this.addRibbonIcon('feather', t('main.ribbonTitle'), () => this.openLauncher());

    // Commands — the full palette surface lives in src/commands.ts
    registerCommands(this);

    // Keyboard: Escape to exit focus mode
    this.registerDomEvent(activeDocument, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.focusMode.isActive()) {
        this.focusMode.disable();
      }
    });

    // Editor context menu
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, _editor, view) => {
        menu.addItem(i => i.setTitle(t('main.menu.studioOptions')).setSection('writing-studio').setDisabled(true));
        menu.addItem(i => i.setTitle(t('main.menu.exportDoc')).setIcon('download').setSection('writing-studio').onClick(() => new ExportModal(this.app, this).open()));
        menu.addItem(i => i.setTitle(t('main.menu.publish')).setIcon('globe').setSection('writing-studio').onClick(() => this.publishCurrentFile()));
        menu.addItem(i => i.setTitle(t('main.menu.setGoal')).setIcon('target').setSection('writing-studio').onClick(() => this.setWordCountGoal(view.file)));
        menu.addItem(i => i.setTitle(t('main.menu.switchMode')).setIcon('layout-dashboard').setSection('writing-studio').onClick((e: MouseEvent | KeyboardEvent) => this.showModeSwitcher(e)));
        if (this.typographyMode.isActive()) {
          menu.addItem(i => i.setTitle(t('main.menu.typographyFont')).setIcon('type').setSection('writing-studio').onClick((e: MouseEvent | KeyboardEvent) => this.showFontPicker(e)));
        }
      })
    );

    // File-context menu (file explorer)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem(i => i.setTitle(t('main.menu.studioOptions')).setSection('writing-studio').setDisabled(true));
          menu.addItem(i =>
            i.setTitle(t('main.menu.addToProject'))
              .setIcon('book-open')
              .setSection('writing-studio')
              .onClick(() => { void this.addFileToProject(file); })
          );
        }
        if (file instanceof TFolder) {
          menu.addItem(i => i.setTitle(t('main.menu.studioOptions')).setSection('writing-studio').setDisabled(true));
          menu.addItem(i =>
            i.setTitle(t('main.menu.openSidebar'))
              .setIcon('folder')
              .setSection('writing-studio')
              .onClick(() => { void this.openFolder(file); })
          );
        }
      })
    );

    // Frontmatter auto-update on file modify
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) {
          this.fmManager.scheduleUpdate(file);
          this.statsTracker.invalidateWordCountCache();
          // Status bar surfaces stay dormant until the studio has launched
          if (this.studioActivated) {
            this.scheduleWordCountUpdate();
            this.statusBar.scheduleProjectGoalUpdate();
          }
        }
      })
    );

    // Keep project records in sync when files or folders are renamed outside
    // the plugin. A folder rename fires one TFolder event plus one TFile
    // event per child; both handlers are idempotent, so the outcome is the
    // same whichever order Obsidian delivers them in.
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFolder) {
          void this.projectManager.handleFolderRename(oldPath, file.path);
        } else if (file instanceof TFile && file.extension === 'md') {
          void this.projectManager.repairBinderPaths(oldPath, file.path, file.basename);
        }
      })
    );

    // Word count update when active leaf changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        if (!this.isReady || !this.studioActivated) return;
        void this.updateWordCount();
        void this.goalBanner.show();
        this.scheduleLauncherRefresh();
      })
    );

    // Settings tab
    this.addSettingTab(new WritingStudioSettingsTab(this.app, this));

    // Initialize project manager and open launcher once vault is fully indexed.
    // Session restore (mode, typography, status bar) happens in
    // activateStudio() — triggered by the launcher opening, never directly by
    // Obsidian's startup, so a disabled startup toggle means a clean launch.
    this.app.workspace.onLayoutReady(async () => {
      await this.projectManager.initialize();
      if (this.settings.openOnStartup) await this.openLauncher();

      // Startup restores the active project without firing the change event,
      // so the carry-over offer (#230) needs its own check here
      void maybeOfferCarryOver(this);

      // Register folder context menu item in Notebook Navigator if installed.
      // Guard on major version <= 2 per NN's stability policy (breaking changes require v3+).
      const nn = (this.app as AppWithPlugins).plugins.plugins['notebook-navigator']?.api;
      if (nn?.menus?.registerFolderMenu) {
        const nnMajor = parseInt(nn.getVersion().split('.')[0]);
        if (nnMajor <= 2) {
          this.nnFolderMenuDispose = nn.menus.registerFolderMenu(({ addItem, folder }) => {
            addItem(item => {
              item.setTitle(t('main.menu.openSidebar')).setIcon('folder').onClick(() => { void this.openFolder(folder); });
            });
          });
        }
      }

      // Plugin is fully ready — allow active-leaf-change handlers to fire.
      this.isReady = true;
    });

  }

  onunload(): void {
    this.focusMode.destroy();
    this.typographyMode.destroy();
    this.writingModes.destroy();
    this.sprintTimer.destroy();
    this.fmManager.destroy();
    this.statusBar.destroy();
    this.goalBanner.destroy();

    if (this.wordCountUpdateTimer) {
      window.clearTimeout(this.wordCountUpdateTimer);
    }

    if (this.launcherRefreshTimer) {
      window.clearTimeout(this.launcherRefreshTimer);
    }

    this.nnFolderMenuDispose?.();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<WritingStudioSettings>;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!Array.isArray(this.settings.wordPressSites)) {
      this.settings.wordPressSites = [];
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // Writing Studio "launches" when the launcher opens — automatically at
  // startup when openOnStartup is on, manually via the ribbon or command, or
  // when a workspace-restored launcher leaf reopens — or when the user
  // invokes a writing mode directly. Launch reveals the status bar and
  // restores the previous session's mode and typography. It must never run
  // on Obsidian startup by itself: with the toggle off, Obsidian opens clean.
  activateStudio(): void {
    if (this.studioActivated) return;
    this.studioActivated = true;
    this.app.workspace.onLayoutReady(() => {
      this.statusBar.reveal();
      // Skip the mode restore when launch came from an explicit mode
      // switch — the user's fresh choice beats the saved session.
      if (this.writingModes.getCurrentMode() === 'none'
          && this.settings.currentWritingMode
          && this.settings.currentWritingMode !== 'none') {
        this.writingModes.restore();
      }
      this.typographyMode.restorePersisted();
      void this.updateWordCount();
      void this.goalBanner.show();
      void this.statusBar.updateProjectGoalBar();
    });
  }

  async openLauncher(): Promise<void> {
    this.activateStudio();
    const existing = this.app.workspace.getLeavesOfType(LAUNCHER_VIEW_TYPE);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      await this.refreshLauncher();
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: LAUNCHER_VIEW_TYPE, active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  async refreshLauncher(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(LAUNCHER_VIEW_TYPE)) {
      if (leaf.view instanceof LauncherView) {
        await leaf.view.refresh();
      }
    }
  }

  // Rebuilds open binder leaves so the experimental-binder toggle takes
  // effect immediately — the view class is chosen at leaf creation
  async reopenBinderViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(BINDER_VIEW_TYPE);
    if (leaves.length === 0) return;
    for (const leaf of leaves) leaf.detach();
    await this.openBinder();
  }

  async openBinder(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(BINDER_VIEW_TYPE);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: BINDER_VIEW_TYPE, active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  async openCompilePreview(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(COMPILE_PREVIEW_VIEW_TYPE);

    let leaf: WorkspaceLeaf;
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: COMPILE_PREVIEW_VIEW_TYPE, active: true });
    }

    void this.app.workspace.revealLeaf(leaf);

    if (leaf.view instanceof CompilePreviewView) {
      await leaf.view.loadContent();
    }
  }

  async openFolder(folder: TFolder): Promise<void> {
    const leaf = await this.app.workspace.ensureSideLeaf(
      FOLDER_SIDEBAR_VIEW_TYPE,
      'right',
      { active: true, reveal: true }
    );
    const view = leaf.view as unknown as FolderSidebarView;
    if (view.rootFolder?.path !== folder.path) {
      view.setRootFolder(folder);
    }
  }

  async openWritingLog(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(WRITING_LOG_VIEW_TYPE);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: WRITING_LOG_VIEW_TYPE, active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  // ─── Feature entry points (used by src/commands.ts and context menus) ─────

  publishCurrentFile(): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    const view = leaf?.view;
    const file = view instanceof MarkdownView ? view.file : null;
    if (!(file instanceof TFile)) {
      new Notice(t('main.notice.noMarkdownOpen'));
      return;
    }
    new PublishModal(this.app, this, file.path).open();
  }

  setWordCountGoal(file: TFile | null): void {
    if (!file) return;
    new WordCountGoalModal(this.app, this, file).open();
  }

  startSprint(): void {
    new SprintModal(this.app, this).open();
  }

  exportDocument(): void {
    new ExportModal(this.app, this).open();
  }

  exportProject(): void {
    new ExportModal(this.app, this, 'project').open();
  }

  // Re-offers the carry-over preview (#230) regardless of the one-time
  // notice flag. The dry run is part of the experimental binder surface.
  async previewCarryOver(): Promise<void> {
    const project = this.projectManager.getActiveProject();
    if (!this.settings.filesystemBinder || !project) {
      new Notice(t('binder.carryOver.unavailable'));
      return;
    }
    await openCarryOverPreview(this, project);
  }

  newProject(): void {
    new ProjectModal(this.app, this).open();
  }

  openWritingDashboard(): void {
    new WritingDashboardModal(this.app, this).open();
  }

  openTargetsDashboard(): void {
    new TargetsDashboardModal(this.app, this).open();
  }

  openFolderPicker(): void {
    new FolderPickerModal(this.app, (folder) => { void this.openFolder(folder); }).open();
  }

  async addFilesToBinder(): Promise<void> {
    await this.openBinder();
    for (const leaf of this.app.workspace.getLeavesOfType(BINDER_VIEW_TYPE)) {
      if (leaf.view instanceof BinderView) {
        await leaf.view.scanProjectFolder();
        break;
      }
    }
  }

  private showModeSwitcher(e: MouseEvent | KeyboardEvent): void {
    const menu = new Menu();
    menu.addItem(i => i.setTitle(t('main.menu.draftMode')).setIcon('pencil').onClick(() => this.writingModes.switchMode('draft')));
    menu.addItem(i => i.setTitle(t('main.menu.editMode')).setIcon('edit-3').onClick(() => this.writingModes.switchMode('edit')));
    menu.addItem(i => i.setTitle(t('main.menu.reviewMode')).setIcon('eye').onClick(() => this.writingModes.switchMode('review')));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('main.menu.normalMode')).onClick(() => this.writingModes.switchMode('none')));
    if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
  }

  private showFontPicker(e: MouseEvent | KeyboardEvent): void {
    const menu = new Menu();
    TYPOGRAPHY_FONT_OPTIONS.forEach(({ key }) => {
      menu.addItem(i => {
        i.setTitle(t(`settings.typography.font.${key}`)).onClick(() => {
          this.settings.typographyFont = key;
          void this.saveSettings();
          this.typographyMode.refreshStyles();
        });
        if (this.settings.typographyFont === key) { i.setIcon('check'); }
      });
    });
    if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
  }

  private addFileToProject(file: TFile): void {
    const projects = this.projectManager.getProjects();
    if (projects.length === 0) {
      new Notice(t('addToProject.noProjects'));
      return;
    }

    new AddToProjectModal(this.app, this, file, async (projectId) => {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const binder = await this.projectManager.loadBinder(project);
      const item = {
        id: `item-${Date.now()}`,
        title: file.basename,
        filePath: file.path,
        type: resolveDefaultDocumentType(project.type, this.settings.defaultDocumentType),
        order: binder.items.length + 1,
        status: 'draft' as const,
        includeInExport: true,
      };

      binder.items.push(item);
      await this.projectManager.saveBinder(binder);
      new Notice(t('main.notice.addedToProject', { file: file.basename, project: project.title }));
    }).open();
  }

  private scheduleLauncherRefresh(): void {
    if (this.launcherRefreshTimer) window.clearTimeout(this.launcherRefreshTimer);
    this.launcherRefreshTimer = window.setTimeout(() => { void this.refreshLauncher(); }, 300);
  }

  private scheduleWordCountUpdate(): void {
    if (this.wordCountUpdateTimer) window.clearTimeout(this.wordCountUpdateTimer);
    this.wordCountUpdateTimer = window.setTimeout(() => {
      void this.updateWordCount();
    }, 1000);
  }

  // Compute the live word count once, then fan it out to every surface that
  // shows it: status bar, focus-mode toolbar, binder rows, and the goal banner.
  private async updateWordCount(): Promise<void> {
    const leaf = this.app.workspace.getMostRecentLeaf();
    const view = leaf?.view;
    if (!(view instanceof MarkdownView) || !view.editor) {
      this.statusBar.clearWordCount();
      return;
    }

    const content = view.editor.getValue();
    const wc = this.fmManager.countWords(content);
    const file = view.file;

    // Session word count tracking
    let sessionDelta = 0;
    if (file) {
      this.statsTracker.updateFileWordCount(file.path, wc);
      sessionDelta = this.statsTracker.getSessionDelta(file.path);
    }

    const goal = file ? await this.projectManager.getWordCountGoalForFile(file) : undefined;
    this.statusBar.showWordCount(wc, goal, sessionDelta);
    this.focusMode.updateToolbarWordCount(wc);

    // Push the fresh count to the binder panel (O(1) map lookup, no re-render).
    if (file) {
      for (const bl of this.app.workspace.getLeavesOfType(BINDER_VIEW_TYPE)) {
        if (bl.view instanceof BinderView) {
          bl.view.updateWordCount(file.path, wc);
        }
      }
      this.goalBanner.patch(wc);
    }
  }
}

// ─── Sprint Summary Modal ────────────────────────────────────────────────────

class SprintSummaryModal extends Modal {
  private session: import('./models/SprintSession').SprintSession;

  constructor(app: App, session: import('./models/SprintSession').SprintSession) {
    super(app);
    this.session = session;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-sprint-summary-modal');
    contentEl.createEl('h2', { text: t('sprintSummary.title') });

    const s = this.session;
    const wpm = s.duration > 0 ? Math.round(s.wordsWritten / s.duration) : 0;

    const grid = contentEl.createDiv('ws-dash-grid');
    this.addStat(grid, t('sprintSummary.wordsWritten'), String(s.wordsWritten));
    this.addStat(grid, t('sprintSummary.duration'), t('sprintSummary.durationValue', { count: s.duration }));
    this.addStat(grid, t('sprintSummary.wpm'), String(wpm));
    if (s.wordCountGoal) {
      const pct = Math.min(100, Math.round((s.wordsWritten / s.wordCountGoal) * 100));
      this.addStat(grid, t('sprintSummary.goalProgress'), `${pct}%`);
    }

    contentEl.createEl('button', { text: t('sprintSummary.close'), cls: 'mod-cta' }).onclick = () => this.close();
  }

  private addStat(container: HTMLElement, label: string, value: string): void {
    const stat = container.createDiv('ws-dash-stat');
    stat.createDiv({ text: value, cls: 'ws-dash-stat-value' });
    stat.createDiv({ text: label, cls: 'ws-dash-stat-label' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ─── Word Count Goal Modal ───────────────────────────────────────────────────

class WordCountGoalModal extends Modal {
  private plugin: WritingStudioPlugin;
  private file: TFile;
  private goal = 0;
  // Non-null when the file is in the active project's binder — the binder
  // item is then the authoritative goal store (CONTEXT.md invariant 1) and
  // frontmatter is neither read nor written. With the experimental
  // filesystem binder on, frontmatter is the sole authority instead (#229)
  // and this stays null.
  private binderEntry: { binder: BinderData; item: BinderItem } | null = null;

  constructor(app: App, plugin: WritingStudioPlugin, file: TFile) {
    super(app);
    this.plugin = plugin;
    this.file = file;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-goal-modal');
    contentEl.createEl('h2', { text: t('wordCountGoal.title') });

    this.binderEntry = this.plugin.settings.filesystemBinder
      ? null
      : await this.plugin.projectManager.findBinderEntryForFile(this.file.path);
    if (this.binderEntry) {
      this.goal = this.binderEntry.item.wordCountGoal ?? 0;
    } else {
      const cache = this.app.metadataCache.getFileCache(this.file);
      this.goal = Number(cache?.frontmatter?.['word-count-goal']) || 0;
    }

    new Setting(contentEl)
      .setName(t('wordCountGoal.name'))
      .setDesc(t('wordCountGoal.desc'))
      .addText(tx => tx
        .setValue(String(this.goal || ''))
        .setPlaceholder(t('wordCountGoal.placeholder'))
        .onChange(v => { this.goal = parseInt(v) || 0; }));

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const saveBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('wordCountGoal.save') });
    saveBtn.onclick = async () => {
      if (this.binderEntry) {
        this.binderEntry.item.wordCountGoal = this.goal;
        await this.plugin.projectManager.saveBinder(this.binderEntry.binder);
      } else {
        await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => {
          fm['word-count-goal'] = this.goal;
        });
      }
      // The banner re-resolves the goal — binder rows update via binder-changed
      void this.plugin.goalBanner.show();
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: t('wordCountGoal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
