import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  Setting,
  WorkspaceLeaf,
  TFile,
  TFolder,
  Menu,
  normalizePath,
  stringifyYaml,
} from 'obsidian';

import { FilesystemBinderView, BinderDrawerPref, BINDER_VIEW_TYPE } from './src/FilesystemBinderView';
import { CompilePreviewView, COMPILE_PREVIEW_VIEW_TYPE } from './src/CompilePreview';
import { OutlineView, OUTLINE_VIEW_TYPE } from './src/OutlineView';
import { LauncherView, LAUNCHER_VIEW_TYPE } from './src/LauncherView';
import { FocusMode } from './src/FocusMode';
import { TypographyMode } from './src/TypographyMode';
import { WritingModes } from './src/WritingModes';
import { SprintTimer } from './src/SprintTimer';
import { ExportEngine, type ExportFormat, type ExportUiState, type PdfEnginePreference, type CitationStyleSetting } from './src/ExportEngine';
import { buildSourceIndex } from './src/sourceIndex';
import { sourceFrontmatter, sourceFileBasename, NewSourceFields } from './src/sources';
import { InsertCitationModal } from './modals/InsertCitationModal';
import { AddSourceModal } from './modals/AddSourceModal';
import { TitlePromptModal } from './modals/TitlePromptModal';
import { MergeSectionsModal } from './modals/MergeSectionsModal';
import { FindReplaceModal } from './modals/FindReplaceModal';
import { RenameCitekeyModal } from './modals/RenameCitekeyModal';
import { splitSection, suggestSplitTitle, mergeSections } from './src/sectionEdit';
import { rewriteCitekey, countKeyUses } from './src/citekeyRename';
import type { ReplaceRecord } from './src/projectSearch';
import { inManuscriptZone, isManuscriptPath, listManuscriptDocs, listResearchDocs } from './src/manuscriptTree';
import { sortSiblings, parseBinderOrder } from './src/binderOrder';
import { planMove, MoveEntry } from './src/binderMove';
import { nameRejectionKey, renameTargetName, validateItemName } from './src/binderMenu';
import { namesInText } from './src/chicago';
import { safeHandler } from './src/safeHandler';
import type { WritingProject } from './models/Project';
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
import { runSilentMigration, runRestoreLayout, FailureLedgerEntry } from './src/carryOverBridge';

import { SprintModal } from './modals/SprintModal';
import { ExportModal } from './modals/ExportModal';
import { PublishModal } from './modals/PublishModal';
import { ProjectModal } from './modals/ProjectModal';
import { TargetsDashboardModal } from './modals/TargetsDashboardModal';
import { WritingDashboardModal } from './modals/WritingDashboardModal';

import { WordPressSite } from './models/WordPressSite';
import { WritingModeType } from './models/WritingMode';

// Minimal subset of the Notebook Navigator public API used by Writing Studio.
// Versions here are NN's API version (currently 2.0.0), which is numbered
// independently of the NN plugin release version — the plugin is on 3.x while
// the API contract is still 2.x.
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
  // Directory holding the PDF engine binaries, or a path to one engine binary,
  // for installs the process PATH does not cover (#344)
  pdfEnginePath: string;
  // How citations print: the built-in Chicago author-date or notes style, or
  // a CSL file of the writer's own (Pandoc formats only)
  citationStyle: CitationStyleSetting;
  cslPath: string;
  epubLanguage: string;
  epubIncludeCover: boolean;
  // WordPress
  wordPressSites: WordPressSite[];
  wikilinkHandling: 'strip' | 'convert';
  // Resources-drawer open state and active tab, per project id — a view
  // preference, deliberately kept out of the vault
  binderDrawer: Record<string, BinderDrawerPref>;
  // Whether the one-time "binder and folders now stay in sync" modal has
  // shown (#233) — set after the first migration that performs work
  binderUpdateNoticeSeen: boolean;
  // Graduated migration-failure ledger (#231 R2): signature → consecutive
  // fail count + whether its one notice fired; success clears the entry
  carryOverFailures: Record<string, FailureLedgerEntry>;
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
  pdfEnginePath: '',
  citationStyle: 'author-date',
  cslPath: '',
  epubLanguage: 'en',
  epubIncludeCover: true,
  wordPressSites: [],
  wikilinkHandling: 'strip',
  binderDrawer: {},
  binderUpdateNoticeSeen: false,
  carryOverFailures: {},
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

  // The last project-wide replace, held for "Undo last replace" until the
  // next replace or a restart (snapshots are not yet in the set).
  replaceLedger: ReplaceRecord[] | null = null;
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
    // The project word-count total tracks the manuscript zone, so vault
    // membership changes invalidate it (#233 — membership lives on disk now)
    this.registerEvent(this.app.vault.on('create', () => { this.statsTracker.invalidateWordCountCache(); }));
    this.registerEvent(this.app.vault.on('delete', () => { this.statsTracker.invalidateWordCountCache(); }));
    // Goal/title edits and project switches refresh the status bar goal bar.
    // Gated on launch — before activateStudio() the status bar stays untouched.
    this.registerEvent(this.projectManager.onProjectsChanged(() => {
      if (this.studioActivated) void this.statusBar.updateProjectGoalBar();
    }));
    this.registerEvent(this.projectManager.onActiveProjectChanged(() => {
      if (this.studioActivated) void this.statusBar.updateProjectGoalBar();
      void runSilentMigration(this);
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
    this.registerView(BINDER_VIEW_TYPE, (leaf) => new FilesystemBinderView(leaf, this));
    this.registerView(COMPILE_PREVIEW_VIEW_TYPE, (leaf) => new CompilePreviewView(leaf, this));
    this.registerView(OUTLINE_VIEW_TYPE, (leaf) => new OutlineView(leaf, this));
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
        menu.addItem(i => i.setTitle(t('citations.insertMenu')).setIcon('quote').setSection('writing-studio').onClick(() => this.insertCitation(_editor)));
        // Split is offered only where it applies: a manuscript section of
        // the active project, never a research note or a stray file
        if (this.manuscriptProjectFor(view.file)) {
          menu.addItem(i => i.setTitle(t('main.menu.splitSection')).setIcon('scissors').setSection('writing-studio').onClick(() => this.splitSectionAtCursor(_editor, view.file)));
        }
        menu.addItem(i => i.setTitle(t('main.menu.switchMode')).setIcon('layout-dashboard').setSection('writing-studio').onClick((e: MouseEvent | KeyboardEvent) => this.showModeSwitcher(e)));
        if (this.typographyMode.isActive()) {
          menu.addItem(i => i.setTitle(t('main.menu.typographyFont')).setIcon('type').setSection('writing-studio').onClick((e: MouseEvent | KeyboardEvent) => this.showFontPicker(e)));
        }
      })
    );

    // File-context menu (file explorer)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
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

    // Keep project records in sync when folders are renamed outside the
    // plugin — folderPath and documentFolder in _project.json follow the
    // folder they name. Documents need no following since #233: the binder
    // renders disk truth, and per-document state travels in frontmatter.
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.statsTracker.invalidateWordCountCache();
        if (file instanceof TFolder) {
          void this.projectManager.handleFolderRename(oldPath, file.path);
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
      // so silent migration (#231) needs its own check here
      void runSilentMigration(this);

      // Register folder context menu item in Notebook Navigator if installed.
      // getVersion() returns NN's API version, NOT the NN plugin version. Guard on
      // API major <= 2 per NN's stability policy: API 2.x is additive-only, and
      // breaking changes to documented members require an API major bump. An NN
      // plugin major bump on its own does not affect this guard.
      const nn = (this.app as AppWithPlugins).plugins.plugins['notebook-navigator']?.api;
      if (nn?.menus?.registerFolderMenu) {
        const nnApiMajor = parseInt(nn.getVersion().split('.')[0]);
        if (nnApiMajor <= 2) {
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

  async openCompilePreview(state?: ExportUiState): Promise<void> {
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
      await leaf.view.loadContent(state);
    }
  }

  // The outline lives in the main pane as a tab: one per workspace, revealed
  // and refreshed on every open so it always shows the active project.
  // The citation picker: every source in the vault, inserted at the cursor
  // in Pandoc's spelling so it exports everywhere.
  insertCitation(editor: Editor): void {
    const project = this.projectManager.getActiveProject();
    const sources = buildSourceIndex(this.app, project?.folderPath ?? null).all();
    new InsertCitationModal(this.app, sources, text => {
      editor.replaceSelection(text);
      editor.focus();
    }).open();
  }

  // The Add source form writes a note into the project's Research folder
  // with the properties the citation engine reads, then opens it so the
  // writer can add their own notes under the properties.
  addSource(): void {
    const project = this.projectManager.getActiveProject();
    if (!project) {
      new Notice(t('binder.selectProjectFirst'));
      return;
    }
    const taken = new Set(buildSourceIndex(this.app, project.folderPath).all().map(s => s.citekey));
    new AddSourceModal(this.app, taken, async (fields: NewSourceFields) => {
      const folder = normalizePath(`${project.folderPath}/Research`);
      await this.vaultFiles.ensureFolder(folder);
      const base = sourceFileBasename(fields);
      let path = normalizePath(`${folder}/${base}.md`);
      for (let n = 2; this.vaultFiles.exists(path); n++) {
        path = normalizePath(`${folder}/${base} ${n}.md`);
      }
      const content = `---\n${stringifyYaml(sourceFrontmatter(fields))}---\n\n`;
      const file = await this.app.vault.create(path, content);
      new Notice(t('citations.sourceAdded', { key: fields.citekey }));
      await this.app.workspace.getLeaf('tab').openFile(file);
    }).open();
  }

  async openOutline(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE);

    let leaf: WorkspaceLeaf;
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: OUTLINE_VIEW_TYPE, active: true });
    }

    void this.app.workspace.revealLeaf(leaf);

    if (leaf.view instanceof OutlineView) {
      await leaf.view.refresh();
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

  // ─── Sections: split, merge, find and replace, citation keys ──────────────

  // The active project when `file` is one of its manuscript documents.
  private manuscriptProjectFor(file: TFile | null): WritingProject | null {
    const project = this.projectManager.getActiveProject();
    if (!file || !project || !isManuscriptPath(file.path, project.folderPath)) return null;
    return project;
  }

  private docTitle(file: TFile): string {
    return file.name.slice(0, file.name.length - file.extension.length - 1);
  }

  // A folder's manuscript-zone children in binder order, as the drag
  // planner sees them.
  private manuscriptSiblings(parent: TFolder, projectFolder: string): MoveEntry[] {
    const isRoot = parent.path === projectFolder;
    const entries: MoveEntry[] = [];
    for (const c of parent.children) {
      if (!inManuscriptZone(c.name, c instanceof TFolder, isRoot)) continue;
      entries.push({
        name: c.name,
        isFolder: c instanceof TFolder,
        path: c.path,
        extension: c instanceof TFile ? c.extension : undefined,
        binderOrder: c instanceof TFile && c.extension === 'md'
          ? parseBinderOrder(this.app.metadataCache.getFileCache(c)?.frontmatter?.['binder-order'])
          : null,
      });
    }
    return sortSiblings(entries);
  }

  // Split at the cursor: the text from the cursor on becomes a new section
  // placed right after this one, with the same status and type, its own
  // binder-order (the drag planner decides the value), and the footnote
  // definitions it uses. The head stays in the editor, so Undo there still
  // works on the text it kept.
  splitSectionAtCursor(editor: Editor, file: TFile | null): void {
    const project = this.manuscriptProjectFor(file);
    const parent = file?.parent;
    if (!file || !project || !parent) {
      new Notice(t('sections.splitNotManuscript'));
      return;
    }
    const text = editor.getValue();
    const offset = editor.posToOffset(editor.getCursor());
    const split = splitSection(text, offset);
    if (!split) {
      new Notice(t('sections.splitInFrontmatter'));
      return;
    }
    const title = this.docTitle(file);
    new TitlePromptModal(
      this.app,
      t('sections.splitTitle'),
      suggestSplitTitle(text, offset, title),
      t('sections.splitBtn'),
      t('synopsis.cancel'),
      async (typed) => {
        const target = renameTargetName({ name: '', isFolder: false, extension: 'md', binderOrder: null }, typed);
        const verdict = validateItemName(typed, target, parent.children.map(c => c.name));
        if (!verdict.ok) {
          new Notice(t(nameRejectionKey(verdict.reason), { name: target }));
          return;
        }
        const newPath = normalizePath(`${parent.path}/${target}`);
        const siblings = this.manuscriptSiblings(parent, project.folderPath);
        const idx = siblings.findIndex(s => s.path === file.path);
        const source: MoveEntry = { name: target, isFolder: false, extension: 'md', binderOrder: null, path: newPath };
        const ops = planMove(source, parent.path, siblings, idx + 1, true);

        const fm: Record<string, unknown> = {};
        const cache = this.app.metadataCache.getFileCache(file)?.frontmatter;
        for (const key of ['binder-status', 'binder-type']) {
          const v: unknown = cache?.[key];
          if (v !== undefined && v !== null) fm[key] = v;
        }
        const own = ops.find(o => o.kind === 'set-order' && o.path === newPath);
        if (own?.kind === 'set-order') fm['binder-order'] = own.order;
        const content = (Object.keys(fm).length ? `---\n${stringifyYaml(fm)}---\n\n` : '') + split.tail;

        editor.setValue(split.head);
        editor.setCursor({ line: editor.lastLine(), ch: 0 });
        const created = await this.app.vault.create(newPath, content);
        for (const op of ops) {
          if (op.path === newPath) continue;
          const f = this.app.vault.getAbstractFileByPath(op.path);
          if (!f) continue;
          if (op.kind === 'rename') {
            await this.app.fileManager.renameFile(f, normalizePath(op.newPath));
          } else if (f instanceof TFile) {
            await this.app.fileManager.processFrontMatter(f, (m: Record<string, unknown>) => { m['binder-order'] = op.order; });
          }
        }
        new Notice(t('sections.splitDone', { name: this.docTitle(created) }));
        await this.app.workspace.getLeaf('tab').openFile(created);
      },
      t('sections.splitHint', { name: title }),
    ).open();
  }

  // Merge the next section into this one. The second file goes to the
  // trash by the user's "Deleted files" setting — never deleted outright.
  mergeWithNext(first: TFile, second: TFile): void {
    const secondTitle = this.docTitle(second);
    new MergeSectionsModal(this.app, this.docTitle(first), secondTitle, async (addHeading) => {
      const a = await this.app.vault.read(first);
      const b = await this.app.vault.read(second);
      await this.app.vault.modify(first, mergeSections(a, b, { headingTitle: addHeading ? secondTitle : null }));
      await this.app.fileManager.trashFile(second);
      new Notice(t('sections.mergeDone', { second: secondTitle }));
    }).open();
  }

  openFindReplace(): void {
    const project = this.projectManager.getActiveProject();
    if (!project) {
      new Notice(t('binder.selectProjectFirst'));
      return;
    }
    new FindReplaceModal(this.app, this, project.folderPath).open();
  }

  // Rename a source's citation key everywhere in the project: the key on
  // the note, and every @key citation in manuscript and research notes.
  // Wikilink citations name the file, so they need nothing.
  renameCitationKey(file: TFile | null): void {
    const project = this.projectManager.getActiveProject();
    if (!project) {
      new Notice(t('binder.selectProjectFirst'));
      return;
    }
    const key: unknown = file ? this.app.metadataCache.getFileCache(file)?.frontmatter?.citekey : undefined;
    if (!file || typeof key !== 'string' || !key) {
      new Notice(t('citations.notASource'));
      return;
    }
    const index = buildSourceIndex(this.app, project.folderPath);
    const source = index.byKey(key);
    const who = source ? (source.authors.length ? namesInText(source.authors) : namesInText(source.editors)) : '';
    const label = source
      ? [who, source.year ? `(${source.year})` : '', source.title].filter(s => s.length > 0).join(' ')
      : this.docTitle(file);
    const taken = new Set(index.all().map(s => s.citekey));

    safeHandler(async () => {
      const uses = new Map<TFile, number>();
      let citations = 0;
      let sections = 0;
      let notes = 0;
      for (const f of listManuscriptDocs(this.app, project.folderPath)) {
        const n = countKeyUses(await this.app.vault.cachedRead(f), key);
        if (n > 0) { uses.set(f, n); citations += n; sections++; }
      }
      for (const f of listResearchDocs(this.app, project.folderPath)) {
        const n = countKeyUses(await this.app.vault.cachedRead(f), key);
        if (n > 0) { uses.set(f, n); citations += n; notes++; }
      }
      new RenameCitekeyModal(this.app, label, key, taken, { citations, sections, notes }, async (newKey) => {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => { fm.citekey = newKey; });
        let count = 0;
        for (const f of uses.keys()) {
          await this.app.vault.process(f, (data) => {
            const r = rewriteCitekey(data, key, newKey);
            count += r.count;
            return r.text;
          });
        }
        new Notice(t('citations.renameKeyDone', { key: newKey, count }));
      }).open();
    })();
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

  // The migration's road back (#231 inverse pass) — layout-only by ruling:
  // documents return to their legacy paths, markers come off, frontmatter
  // stays. The one-time upgrade modal names this command (#233).
  async restoreBinderLayout(): Promise<void> {
    await runRestoreLayout(this);
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

    const goal = file ? this.projectManager.getWordCountGoalForFile(file) : undefined;
    this.statusBar.showWordCount(wc, goal, sessionDelta);
    this.focusMode.updateToolbarWordCount(wc);

    if (file) {
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

  constructor(app: App, plugin: WritingStudioPlugin, file: TFile) {
    super(app);
    this.plugin = plugin;
    this.file = file;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-goal-modal');
    contentEl.createEl('h2', { text: t('wordCountGoal.title') });

    // Frontmatter word-count-goal is the sole goal authority (#229/#233)
    const cache = this.app.metadataCache.getFileCache(this.file);
    this.goal = Number(cache?.frontmatter?.['word-count-goal']) || 0;

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
      await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => {
        fm['word-count-goal'] = this.goal;
      });
      // The banner re-resolves the goal; binder rows re-render on the
      // metadata change event
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
