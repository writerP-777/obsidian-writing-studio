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
import { CompilePreviewView, COMPILE_PREVIEW_VIEW_TYPE } from './src/CompilePreview';
import { LauncherView, LAUNCHER_VIEW_TYPE } from './src/LauncherView';
import { FocusMode } from './src/FocusMode';
import { TypographyMode } from './src/TypographyMode';
import { WritingModes } from './src/WritingModes';
import { SprintTimer } from './src/SprintTimer';
import { ExportEngine } from './src/ExportEngine';
import { WordPressClient } from './src/WordPressClient';
import { ProjectManager } from './src/ProjectManager';
import { StatsTracker } from './src/StatsTracker';
import { FrontmatterManager } from './src/FrontmatterManager';
import { WritingStudioSettingsTab } from './src/SettingsTab';
import { FolderSidebarView, FolderPickerModal, FOLDER_SIDEBAR_VIEW_TYPE } from './src/FolderSidebarView';

import { SprintModal } from './modals/SprintModal';
import { ExportModal } from './modals/ExportModal';
import { PublishModal } from './modals/PublishModal';
import { ProjectModal } from './modals/ProjectModal';
import { TargetsDashboardModal } from './modals/TargetsDashboardModal';
import { WritingDashboardModal } from './modals/WritingDashboardModal';

import { WordPressSite } from './models/WordPressSite';
import { WritingModeType } from './models/WritingMode';

export interface WritingStudioSettings {
  // General
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
  defaultExportFormat: 'pdf' | 'docx' | 'rtf' | 'md' | 'html';
  defaultPaperSize: 'letter' | 'a4';
  defaultExportFont: string;
  defaultExportFontSize: number;
  pandocPath: string;
  epubLanguage: string;
  epubIncludeCover: boolean;
  // WordPress
  wordPressSites: WordPressSite[];
  wikilinkHandling: 'strip' | 'convert';
  // State
  activeProjectId: string | null;
  currentWritingMode: WritingModeType;
}

const DEFAULT_SETTINGS: WritingStudioSettings = {
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
  epubLanguage: 'en',
  epubIncludeCover: true,
  wordPressSites: [],
  wikilinkHandling: 'strip',
  activeProjectId: null,
  currentWritingMode: 'none',
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

  private statusBarMode!: HTMLElement;
  private statusBarWordCount!: HTMLElement;
  private statusBarSprint!: HTMLElement;
  private wordCountUpdateTimer: number | null = null;
  private bannerGeneration = 0;
  private currentBannerGoal = 0;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register custom icons
    this.registerIcons();

    // Initialize modules
    this.fmManager = new FrontmatterManager(this);
    this.projectManager = new ProjectManager(this);
    this.statsTracker = new StatsTracker(this);
    this.focusMode = new FocusMode(this);
    this.typographyMode = new TypographyMode(this);
    this.writingModes = new WritingModes(this);
    this.sprintTimer = new SprintTimer(this);
    this.exportEngine = new ExportEngine(this);
    this.wpClient = new WordPressClient();

    // Register CM6 editor extension for focus mode
    this.registerEditorExtension(this.focusMode.getEditorExtension());

    // Register views
    this.registerView(LAUNCHER_VIEW_TYPE, (leaf) => new LauncherView(leaf, this));
    this.registerView(BINDER_VIEW_TYPE, (leaf) => new BinderView(leaf, this));
    this.registerView(COMPILE_PREVIEW_VIEW_TYPE, (leaf) => new CompilePreviewView(leaf, this));
    this.registerView(FOLDER_SIDEBAR_VIEW_TYPE, (leaf) => new FolderSidebarView(leaf));

    // Status bar items
    this.statusBarMode = this.addStatusBarItem();
    this.statusBarMode.addClass('ws-status-mode');
    this.statusBarMode.addClass('ws-hidden');
    this.writingModes.setStatusBar(this.statusBarMode);

    this.statusBarWordCount = this.addStatusBarItem();
    this.statusBarWordCount.addClass('ws-status-wordcount');

    this.statusBarSprint = this.addStatusBarItem();
    this.statusBarSprint.addClass('ws-status-sprint');
    this.sprintTimer.setStatusBar(this.statusBarSprint);

    // Register sprint complete handler
    this.sprintTimer.setOnComplete(async (session) => {
      this.statsTracker.recordSprint(session);
      const project = this.projectManager.getActiveProject();
      if (project) {
        await this.projectManager.logSprintSession(project, session);
      }
      new SprintSummaryModal(this.app, session).open();
    });

    // Ribbon icons
    this.addRibbonIcon('feather', 'Open Writing Studio', () => this.openLauncher());
    this.addRibbonIcon('book-open', 'Open writing binder', () => this.openBinder());
    this.addRibbonIcon('timer', 'Start writing sprint', () => new SprintModal(this.app, this).open());
    this.addRibbonIcon('eye', 'Toggle focus mode', () => this.focusMode.toggle());
    this.addRibbonIcon('layout-dashboard', 'Switch writing mode', (e) => this.showModeSwitcher(e));
    this.addRibbonIcon('globe', 'Publish to WordPress', () => this.publishCurrentFile());
    this.addRibbonIcon('bar-chart-2', 'Writing dashboard', () => new WritingDashboardModal(this.app, this).open());
    this.addRibbonIcon('folder', 'Open folder in sidebar explorer', () => {
      new FolderPickerModal(this.app, (folder) => { void this.openFolder(folder); }).open();
    });

    // Commands
    this.addCommand({
      id: 'open-launcher',
      name: 'Open launcher',
      callback: () => { void this.openLauncher(); },
    });

    this.addCommand({
      id: 'open-binder',
      name: 'Open binder',
      callback: () => { void this.openBinder(); },
    });

    this.addCommand({
      id: 'toggle-focus-mode',
      name: 'Toggle focus mode',
      callback: () => this.focusMode.toggle(),
    });

    this.addCommand({
      id: 'toggle-typography-mode',
      name: 'Toggle typography mode',
      callback: () => this.typographyMode.toggle(),
    });

    this.addCommand({
      id: 'switch-draft-mode',
      name: 'Switch to draft mode',
      callback: () => { void this.writingModes.switchMode('draft'); },
    });

    this.addCommand({
      id: 'switch-edit-mode',
      name: 'Switch to edit mode',
      callback: () => { void this.writingModes.switchMode('edit'); },
    });

    this.addCommand({
      id: 'switch-review-mode',
      name: 'Switch to review mode',
      callback: () => { void this.writingModes.switchMode('review'); },
    });

    this.addCommand({
      id: 'start-sprint',
      name: 'Start writing sprint',
      callback: () => new SprintModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'export-document',
      name: 'Export document',
      callback: () => new ExportModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'export-project',
      name: 'Export project',
      callback: () => new ExportModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'preview-manuscript',
      name: 'Preview compiled manuscript',
      callback: () => { void this.openCompilePreview(); },
    });

    this.addCommand({
      id: 'publish-wordpress',
      name: 'Publish to WordPress',
      callback: () => this.publishCurrentFile(),
    });

    this.addCommand({
      id: 'new-project',
      name: 'New writing project',
      callback: () => new ProjectModal(this.app, this, () => { void this.refreshBinder(); }).open(),
    });

    this.addCommand({
      id: 'open-dashboard',
      name: 'Open writing dashboard',
      callback: () => new WritingDashboardModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'open-targets-dashboard',
      name: 'Open targets dashboard',
      callback: () => new TargetsDashboardModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'set-word-count-goal',
      name: 'Set word count goal',
      editorCallback: (editor, view) => this.setWordCountGoal(view.file),
    });

    this.addCommand({
      id: 'open-folder-sidebar',
      name: 'Open folder in sidebar explorer',
      callback: () => {
        new FolderPickerModal(this.app, (folder) => { void this.openFolder(folder); }).open();
      },
    });

    // Keyboard: Escape to exit focus mode
    this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.focusMode.isActive()) {
        this.focusMode.disable();
      }
    });

    // Editor context menu
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, view) => {
        menu.addItem(i => i.setTitle('Export this document').setIcon('download').onClick(() => new ExportModal(this.app, this).open()));
        menu.addItem(i => i.setTitle('Publish to WordPress').setIcon('globe').onClick(() => this.publishCurrentFile()));
        menu.addItem(i => i.setTitle('Set word count goal').setIcon('target').onClick(() => this.setWordCountGoal(view.file)));
        menu.addItem(i => i.setTitle('Switch writing mode →').setIcon('layout-dashboard').onClick((e: MouseEvent) => this.showModeSwitcher(e)));
      })
    );

    // File-context menu (file explorer)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem(i =>
            i.setTitle('Add to writing project')
              .setIcon('book-open')
              .onClick(() => { void this.addFileToProject(file); })
          );
        }
        if (file instanceof TFolder) {
          menu.addItem(item =>
            item
              .setTitle('Open in sidebar explorer')
              .setIcon('folder')
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
          this.scheduleWordCountUpdate();
        }
      })
    );

    // Word count update when active leaf changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.updateWordCount();
        void this.showInlineGoalBanner();
        void this.refreshLauncher();
      })
    );

    // Settings tab
    this.addSettingTab(new WritingStudioSettingsTab(this.app, this));

    // Initialize project manager and open launcher once vault is fully indexed
    this.app.workspace.onLayoutReady(async () => {
      await this.projectManager.initialize();
      await this.openLauncher();
      if (this.settings.currentWritingMode && this.settings.currentWritingMode !== 'none') {
        this.writingModes.restore();
      }
    });

    console.debug('Obsidian Writing Studio loaded');
  }

  onunload(): void {
    this.focusMode.destroy();
    this.typographyMode.destroy();
    this.writingModes.destroy();
    this.sprintTimer.destroy();
    this.fmManager.destroy();

    if (this.wordCountUpdateTimer) {
      clearTimeout(this.wordCountUpdateTimer);
    }

    // Remove inline goal banners
    document.querySelectorAll('.ws-inline-goal-banner').forEach(el => el.remove());

    console.debug('Obsidian Writing Studio unloaded');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openLauncher(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(LAUNCHER_VIEW_TYPE);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
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

  async refreshBinder(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(BINDER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof BinderView) {
        await leaf.view.refresh();
      }
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
    const leaves = this.app.workspace.getLeavesOfType(FOLDER_SIDEBAR_VIEW_TYPE);

    if (leaves.length > 0) {
      const leaf = leaves[0];
      const view = leaf.view as unknown as FolderSidebarView;
      if (view.rootFolder?.path === folder.path) {
        void this.app.workspace.revealLeaf(leaf);
        return;
      }
      view.setRootFolder(folder);
      void this.app.workspace.revealLeaf(leaf);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;

    await leaf.setViewState({ type: FOLDER_SIDEBAR_VIEW_TYPE, active: true });
    (leaf.view as unknown as FolderSidebarView).setRootFolder(folder);
    void this.app.workspace.revealLeaf(leaf);
  }

  private publishCurrentFile(): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    const view = leaf?.view;
    const file = view instanceof MarkdownView ? view.file : null;
    if (!(file instanceof TFile)) {
      new Notice('No markdown file is currently open.');
      return;
    }
    new PublishModal(this.app, this, file.path).open();
  }

  private setWordCountGoal(file: TFile | null): void {
    if (!file) return;
    new WordCountGoalModal(this.app, this, file).open();
  }

  private showModeSwitcher(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(i => i.setTitle('✍ Draft mode').setIcon('pencil').onClick(() => this.writingModes.switchMode('draft')));
    menu.addItem(i => i.setTitle('✎ Edit mode').setIcon('edit-3').onClick(() => this.writingModes.switchMode('edit')));
    menu.addItem(i => i.setTitle('👁 Review mode').setIcon('eye').onClick(() => this.writingModes.switchMode('review')));
    menu.addSeparator();
    menu.addItem(i => i.setTitle('Normal (no mode)').onClick(() => this.writingModes.switchMode('none')));
    menu.showAtMouseEvent(e);
  }

  private async addFileToProject(file: TFile): Promise<void> {
    const project = this.projectManager.getActiveProject();
    if (!project) {
      new Notice('No active project. Create or select a project first.');
      return;
    }

    const binder = await this.projectManager.loadBinder(project);
    const item = {
      id: `item-${Date.now()}`,
      title: file.basename,
      filePath: file.path,
      type: this.settings.defaultDocumentType,
      order: binder.items.length + 1,
      status: 'draft' as const,
      includeInExport: true,
    };

    binder.items.push(item);
    await this.projectManager.saveBinder(binder);
    await this.refreshBinder();
    new Notice(`Added "${file.basename}" to ${project.title}`);
  }

  private scheduleWordCountUpdate(): void {
    if (this.wordCountUpdateTimer) clearTimeout(this.wordCountUpdateTimer);
    this.wordCountUpdateTimer = window.setTimeout(() => {
      this.updateWordCount();
    }, 1000);
  }

  private updateWordCount(): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) { this.statusBarWordCount.textContent = ''; return; }

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) { this.statusBarWordCount.textContent = ''; return; }

    const editor = view.editor;
    if (!editor) { this.statusBarWordCount.textContent = ''; return; }

    const content = editor.getValue();
    const wc = this.fmManager.countWords(content);

    // Status bar: read goal from frontmatter (acceptable for status bar only)
    const fm = this.fmManager.parseFrontmatter(content);
    const fmGoal = fm?.['word-count-goal'] as number | undefined;
    if (fmGoal && fmGoal > 0) {
      this.statusBarWordCount.textContent = `${wc} / ${fmGoal} words`;
    } else {
      this.statusBarWordCount.textContent = `${wc} words`;
    }

    this.focusMode.updateToolbarWordCount(wc);

    // Push the fresh count to the binder panel (O(1) map lookup, no re-render).
    const file = view.file;
    if (file) {
      for (const bl of this.app.workspace.getLeavesOfType(BINDER_VIEW_TYPE)) {
        if (bl.view instanceof BinderView) {
          bl.view.updateWordCount(file.path, wc);
        }
      }
      // Patch the goal banner in-place so it updates while the user types.
      this.updateBannerWordCount(wc);
    }
  }

  private updateBannerWordCount(wc: number): void {
    if (this.currentBannerGoal <= 0) return;
    const banner = document.querySelector('.ws-inline-goal-banner');
    if (!banner) return;
    const pct = Math.min(100, Math.round((wc / this.currentBannerGoal) * 100));
    const textEl = banner.querySelector('.ws-goal-text');
    const barEl = banner.querySelector<HTMLElement>('.ws-goal-bar');
    if (textEl) textEl.textContent = `${wc} / ${this.currentBannerGoal} words — ${pct}%`;
    if (barEl) barEl.setCssProps({ '--ws-bar-width': `${pct}%` });
  }

  private async showInlineGoalBanner(): Promise<void> {
    // Increment generation so any stale in-flight call abandons its result.
    const gen = ++this.bannerGeneration;

    document.querySelectorAll('.ws-inline-goal-banner').forEach(el => el.remove());

    if (!this.settings.inlineGoalBanner) return;

    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;

    const file = view.file;
    if (!file) return;

    // Primary goal source: BinderItem.wordCountGoal — the value the Targets Dashboard
    // and Binder both write to and display. The frontmatter field word-count-goal is a
    // separate store that the Targets Dashboard never touches, so reading frontmatter
    // alone produces the wrong value when goals are managed via the dashboard.
    let goal: number | undefined;
    const project = this.projectManager.getActiveProject();
    if (project) {
      const binder = await this.projectManager.loadBinder(project);
      if (gen !== this.bannerGeneration) return;
      const flat = this.projectManager.flattenBinder(binder.items);
      const item = flat.find(i => i.filePath === file.path);
      goal = item?.wordCountGoal;
    }
    // Frontmatter fallback for files not tracked in any binder.
    if (!goal || goal <= 0) {
      const cache = this.app.metadataCache.getFileCache(file);
      goal = cache?.frontmatter?.['word-count-goal'] as number | undefined;
    }
    if (!goal || goal <= 0) return;

    // Store so updateBannerWordCount() can refresh the bar without an async lookup.
    this.currentBannerGoal = goal;

    const content = view.editor.getValue();
    const wc = this.fmManager.countWords(content);
    const pct = Math.min(100, Math.round((wc / goal) * 100));

    if (gen !== this.bannerGeneration) return;

    // Position: find .view-header (the toolbar row) inside the leaf container and
    // insert the banner immediately after it. This places the banner between the
    // bottom edge of the toolbar and the top of the document content area,
    // regardless of which child element the CM6 editor happens to live in.
    const viewHeader = leaf.view.containerEl.querySelector(':scope > .view-header');
    if (!viewHeader) return;

    // Final duplicate guard after all async work is done.
    leaf.view.containerEl.querySelectorAll('.ws-inline-goal-banner').forEach(el => el.remove());

    const banner = createEl('div', { cls: 'ws-inline-goal-banner' });
    banner.createEl('span', { cls: 'ws-goal-text', text: `${wc} / ${goal} words — ${pct}%` });
    const barWrap = banner.createEl('div', { cls: 'ws-goal-bar-wrap' });
    const barEl = barWrap.createEl('div', { cls: 'ws-goal-bar' });
    barEl.setCssProps({ '--ws-bar-width': `${pct}%` });
    const dismissBtn = banner.createEl('button', { cls: 'ws-goal-dismiss', title: 'Dismiss', text: '✕' });
    dismissBtn.addEventListener('click', () => banner.remove());
    viewHeader.insertAdjacentElement('afterend', banner);
  }

  private registerIcons(): void {
    // Icons are registered via Obsidian's setIcon — no custom SVG needed for built-in names
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
    contentEl.createEl('h2', { text: 'Sprint complete!' });

    const s = this.session;
    const wpm = s.duration > 0 ? Math.round(s.wordsWritten / s.duration) : 0;

    const grid = contentEl.createDiv('ws-dash-grid');
    this.addStat(grid, 'Words written', String(s.wordsWritten));
    this.addStat(grid, 'Duration', `${s.duration} min`);
    this.addStat(grid, 'Words/minute', String(wpm));
    if (s.wordCountGoal) {
      const pct = Math.min(100, Math.round((s.wordsWritten / s.wordCountGoal) * 100));
      this.addStat(grid, 'Goal progress', `${pct}%`);
    }

    contentEl.createEl('button', { text: 'Close', cls: 'mod-cta' }).onclick = () => this.close();
  }

  private addStat(container: HTMLElement, label: string, value: string): void {
    const stat = container.createDiv('ws-dash-stat');
    stat.createEl('div', { text: value, cls: 'ws-dash-stat-value' });
    stat.createEl('div', { text: label, cls: 'ws-dash-stat-label' });
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

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-goal-modal');
    contentEl.createEl('h2', { text: 'Set word count goal' });

    const content = await this.app.vault.read(this.file);
    const fm = this.plugin.fmManager.parseFrontmatter(content);
    this.goal = (fm?.['word-count-goal'] as number) || 0;

    new Setting(contentEl)
      .setName('Word count goal')
      .setDesc('Target word count for this document. Set to 0 to remove.')
      .addText(t => t
        .setValue(String(this.goal || ''))
        .setPlaceholder('e.g. 1500')
        .onChange(v => { this.goal = parseInt(v) || 0; }));

    const btnRow = contentEl.createDiv('ws-modal-btn-row');

    const saveBtn = btnRow.createEl('button', { cls: 'mod-cta', text: 'Save' });
    saveBtn.onclick = async () => {
      await this.app.vault.process(this.file, (data) => {
        return this.plugin.fmManager.setFrontmatterField(data, 'word-count-goal', this.goal);
      });
      this.close();
    };

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
