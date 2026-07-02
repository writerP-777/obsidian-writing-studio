import { App, ItemView, Menu, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingModeType } from '../models/WritingMode';
import { ProjectModal } from '../modals/ProjectModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { WritingDashboardModal } from '../modals/WritingDashboardModal';
import { ExportModal } from '../modals/ExportModal';
import { SprintModal } from '../modals/SprintModal';
import { confirmDeleteProject } from '../modals/confirmDeleteProject';
import { t } from './i18n';

export const LAUNCHER_VIEW_TYPE = 'writing-studio-launcher';

export class LauncherView extends ItemView {
  private plugin: WritingStudioPlugin;
  private refreshTimer: number | null = null;
  private todayVals: HTMLElement[] = [];
  private renderedSprintActive = false;

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return LAUNCHER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('launcher.displayText');
  }

  getIcon(): string {
    return 'feather';
  }

  async onOpen(): Promise<void> {
    // The launcher opening IS the studio launch — including a leaf restored
    // by the workspace at startup, which never goes through openLauncher()
    this.plugin.activateStudio();
    // No binder-changed subscription — binder content is not shown here, and a
    // full re-render per binder save would snap open dropdowns shut (see below)
    this.registerEvent(this.plugin.projectManager.onActiveProjectChanged(() => {
      void this.refresh();
    }));
    this.registerEvent(this.plugin.projectManager.onProjectsChanged(() => {
      void this.refresh();
    }));
    // Environment changes re-render the whole panel — they may originate in
    // the binder control strip, commands, or the ribbon, and the mode/toggle
    // cards have no patch-in-place path
    this.registerEvent(this.plugin.studioEvents.onModeChanged(() => { void this.refresh(); }));
    this.registerEvent(this.plugin.studioEvents.onFocusChanged(() => { void this.refresh(); }));
    this.registerEvent(this.plugin.studioEvents.onTypographyChanged(() => { void this.refresh(); }));
    this.registerEvent(this.plugin.studioEvents.onSprintChanged(() => { void this.refresh(); }));
    await this.render();
    // Patch dynamic values in place every 10 seconds — a full re-render here
    // rebuilt the whole panel, snapping open dropdowns shut mid-selection and
    // re-reading the writing log from disk on every tick
    this.refreshTimer = window.setInterval(() => { void this.tickRefresh(); }, 10000);
  }

  private async tickRefresh(): Promise<void> {
    // Sprint card layout depends on sprint state — full render only when it flips
    const sprintActive = this.plugin.sprintTimer.isActive();
    if (sprintActive !== this.renderedSprintActive) {
      await this.render();
      return;
    }
    await this.patchTodayCard();
  }

  private async patchTodayCard(): Promise<void> {
    if (this.todayVals.length < 4) return;
    const vals = this.todayVals;
    const stats = this.plugin.statsTracker.getSessionStats();
    const streak = await this.plugin.statsTracker.getStreak();
    // A full render during the await replaces todayVals with a fresh array —
    // these elements are detached by then and the new array may still be empty
    if (vals !== this.todayVals) return;
    vals[0].textContent = stats.wordsWritten.toLocaleString();
    vals[1].textContent = String(stats.sprintsCompleted);
    vals[2].textContent = String(stats.totalMinutes);
    vals[3].textContent = t('launcher.stat.streakDays', { streak });
  }

  onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    return Promise.resolve();
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    this.todayVals = [];
    this.renderedSprintActive = this.plugin.sprintTimer.isActive();
    root.addClass('ws-launcher');

    this.renderHeader(root);
    await this.renderProjectCard(root);
    this.renderModeSelector(root);
    this.renderFocusToggles(root);
    this.renderQuickActions(root);
    this.renderSprintCard(root);
    await this.renderTodayCard(root);
  }

  // ── Header ──────────────────────────────────────────────────────

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv('ws-launcher-header');
    header.createSpan({ text: t('launcher.title'), cls: 'ws-launcher-title' });

    const settingsBtn = header.createEl('button', { cls: 'ws-launcher-icon-btn', title: t('launcher.settings') });
    setIcon(settingsBtn, 'settings');
    settingsBtn.onclick = () => {
      type AppWithSetting = App & { setting?: { open(): void; openTabById(id: string): void } };
      (this.app as AppWithSetting).setting?.open();
      (this.app as AppWithSetting).setting?.openTabById('writing-studio');
    };
  }

  // ── Project Card ─────────────────────────────────────────────────

  private async renderProjectCard(root: HTMLElement): Promise<void> {
    const project = this.plugin.projectManager.getActiveProject();
    const card = root.createDiv('ws-launcher-card');

    const cardHeader = card.createDiv('ws-launcher-card-header');
    cardHeader.createSpan({ text: t('launcher.project'), cls: 'ws-launcher-card-label' });

    // First run: the empty-state CTA below replaces the small "+ new" button
    if (this.plugin.projectManager.getProjects().length > 0) {
      const newProjectBtn = cardHeader.createEl('button', { cls: 'ws-launcher-text-btn', text: t('launcher.newProject') });
      newProjectBtn.onclick = () => {
        new ProjectModal(this.app, this.plugin).open();
      };
    }

    if (project) {
      const editBtn = cardHeader.createEl('button', { cls: 'ws-launcher-icon-btn', title: t('projectModal.editTitle') });
      setIcon(editBtn, 'pencil');
      editBtn.onclick = () => {
        new ProjectModal(this.app, this.plugin, undefined, project).open();
      };

      const deleteBtn = cardHeader.createEl('button', { cls: 'ws-launcher-icon-btn', title: t('projectModal.deleteTitle') });
      setIcon(deleteBtn, 'trash');
      deleteBtn.onclick = () => {
        confirmDeleteProject(this.app, this.plugin, project);
      };
    }

    if (!project) {
      const projects = this.plugin.projectManager.getProjects();

      // Fresh install — orient toward the create → binder → write loop
      if (projects.length === 0) {
        const intro = card.createDiv('ws-launcher-first-run');
        intro.createDiv({ text: t('launcher.firstRun.intro'), cls: 'ws-launcher-first-run-text' });
        intro.createDiv({ text: t('launcher.firstRun.hint'), cls: 'ws-launcher-first-run-text' });
        const cta = card.createEl('button', { cls: 'ws-launcher-action-btn mod-cta', text: t('launcher.firstRun.cta') });
        cta.onclick = () => {
          new ProjectModal(this.app, this.plugin).open();
        };
        return;
      }

      const emptyRow = card.createDiv('ws-launcher-empty');
      emptyRow.textContent = t('launcher.noProjectSelected');

      if (projects.length > 0) {
        const sel = card.createEl('select', { cls: 'ws-launcher-project-sel' });
        sel.createEl('option', { text: t('launcher.chooseProject'), value: '' });
        for (const p of projects) {
          sel.createEl('option', { text: p.title, value: p.id });
        }
        sel.onchange = async () => {
          if (sel.value) {
            await this.plugin.projectManager.setActiveProject(sel.value);
            await this.refresh();
          }
        };
      }
      return;
    }

    // Project name + switcher — the name renders once; with multiple
    // projects an icon-only menu handles switching (a select here echoed
    // the title a second time)
    const nameRow = card.createDiv('ws-launcher-project-name-row');
    nameRow.createEl('strong', { text: project.title, cls: 'ws-launcher-project-name' });

    const projects = this.plugin.projectManager.getProjects();
    if (projects.length > 1) {
      const switchBtn = nameRow.createEl('button', { cls: 'ws-launcher-icon-btn' });
      setIcon(switchBtn, 'chevrons-up-down');
      setTooltip(switchBtn, t('launcher.switchProject'));
      switchBtn.onclick = (e) => {
        const menu = new Menu();
        for (const p of projects) {
          menu.addItem(i => {
            i.setTitle(p.title).setChecked(p.id === project.id).onClick(async () => {
              // The active-project-changed event re-renders this panel
              await this.plugin.projectManager.setActiveProject(p.id);
            });
          });
        }
        menu.showAtMouseEvent(e);
      };
    }

    // Word count + progress
    try {
      const totalWords = await this.plugin.statsTracker.getTotalWordCount();
      const goal = project.goals?.totalWordCount || 0;

      const wcRow = card.createDiv('ws-launcher-wc-row');
      wcRow.createSpan({ text: t('launcher.wordCount', { n: totalWords.toLocaleString() }), cls: 'ws-launcher-wc-num' });
      if (goal > 0) {
        const pct = Math.min(100, Math.round((totalWords / goal) * 100));
        wcRow.createSpan({ text: t('launcher.wordGoal', { n: goal.toLocaleString() }), cls: 'ws-launcher-wc-goal' });
        const barWrap = card.createDiv('ws-progress-wrap ws-launcher-progress');
        const bar = barWrap.createDiv('ws-progress-bar');
        bar.setCssProps({ '--ws-bar-width': `${pct}%` });
        card.createSpan({ text: t('launcher.pctComplete', { pct }), cls: 'ws-launcher-pct' });
      } else {
        wcRow.createSpan({ text: this.plugin.statsTracker.calculateReadingTime(totalWords), cls: 'ws-launcher-wc-goal' });
      }
    } catch (e) {
      // Card stays minimal when stats can't load, but don't swallow real bugs
      console.error('[Writing Studio] project card stats', e);
    }

    const binderBtn = card.createEl('button', { cls: 'ws-launcher-action-btn', text: t('launcher.openBinder') });
    binderBtn.onclick = () => { void this.plugin.openBinder(); };
  }

  // ── Writing Mode Selector ────────────────────────────────────────

  private renderModeSelector(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createDiv({ text: t('launcher.writingMode'), cls: 'ws-launcher-card-label' });

    // Lucide icon names — same icons the mode-switcher context menu uses
    const modes: Array<{ id: WritingModeType; label: string; icon: string; desc: string }> = [
      { id: 'draft',  label: t('launcher.mode.draft'),  icon: 'pencil', desc: t('launcher.mode.draftDesc') },
      { id: 'edit',   label: t('launcher.mode.edit'),   icon: 'edit-3', desc: t('launcher.mode.editDesc') },
      { id: 'review', label: t('launcher.mode.review'), icon: 'eye',    desc: t('launcher.mode.reviewDesc') },
    ];

    const btnRow = card.createDiv('ws-launcher-mode-btns');
    const current = this.plugin.writingModes.getCurrentMode();

    for (const mode of modes) {
      const btn = btnRow.createEl('button', {
        cls: `ws-launcher-mode-btn ${current === mode.id ? 'is-active' : ''}`,
        title: mode.desc,
      });
      setIcon(btn.createSpan('ws-mode-icon'), mode.icon);
      btn.createSpan({ text: mode.label, cls: 'ws-mode-label' });
      // The mode-changed event re-renders this panel — no manual refresh
      btn.onclick = () => {
        void this.plugin.writingModes.switchMode(current === mode.id ? 'none' : mode.id);
      };
    }

    if (current !== 'none') {
      const clearBtn = card.createEl('button', { cls: 'ws-launcher-text-btn ws-launcher-clear-mode', text: t('launcher.mode.clearMode') });
      clearBtn.onclick = () => {
        void this.plugin.writingModes.switchMode('none');
      };
    }
  }

  // ── Focus & Typography Toggles ───────────────────────────────────

  private renderFocusToggles(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createDiv({ text: t('launcher.focusTypography'), cls: 'ws-launcher-card-label' });

    // The focus/typography-changed events re-render this panel
    const toggles: Array<{ label: string; isOn: () => boolean; toggle: () => void }> = [
      {
        label: t('launcher.focusMode'),
        isOn: () => this.plugin.focusMode.isActive(),
        toggle: () => { this.plugin.focusMode.toggle(); },
      },
      {
        label: t('launcher.typographyMode'),
        isOn: () => this.plugin.typographyMode.isActive(),
        toggle: () => { void this.plugin.typographyMode.toggle(); },
      },
    ];

    for (const tog of toggles) {
      const row = card.createDiv('ws-launcher-toggle-row');
      row.createSpan({ text: tog.label, cls: 'ws-launcher-toggle-label' });

      const toggle = row.createEl('button', {
        cls: `ws-launcher-toggle ${tog.isOn() ? 'is-on' : 'is-off'}`,
        text: tog.isOn() ? t('launcher.on') : t('launcher.off'),
      });
      toggle.onclick = () => tog.toggle();
    }
  }

  // ── Quick Actions ────────────────────────────────────────────────

  private renderQuickActions(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createDiv({ text: t('launcher.quickActions'), cls: 'ws-launcher-card-label' });

    const actions: Array<{ icon: string; label: string; action: () => void }> = [
      {
        icon: 'target',
        label: t('launcher.action.targetsDashboard'),
        action: () => {
          new TargetsDashboardModal(this.app, this.plugin).open();
        },
      },
      {
        icon: 'bar-chart-2',
        label: t('launcher.action.writingDashboard'),
        action: () => {
          new WritingDashboardModal(this.app, this.plugin).open();
        },
      },
      {
        icon: 'layers',
        label: t('launcher.action.previewManuscript'),
        action: () => { void this.plugin.openCompilePreview(); },
      },
      {
        icon: 'download',
        label: t('launcher.action.export'),
        action: () => {
          new ExportModal(this.app, this.plugin, 'project').open();
        },
      },
      {
        icon: 'calendar-days',
        label: t('launcher.action.writingLog'),
        action: () => { void this.plugin.openWritingLog(); },
      },
      {
        icon: 'globe',
        label: t('launcher.action.publishToWordPress'),
        action: () => { this.plugin.publishCurrentFile(); },
      },
    ];

    const grid = card.createDiv('ws-launcher-actions-grid');
    for (const a of actions) {
      const btn = grid.createEl('button', { cls: 'ws-launcher-action-grid-btn', title: a.label });
      const iconEl = btn.createDiv('ws-launcher-grid-icon');
      setIcon(iconEl, a.icon);
      btn.createDiv({ text: a.label, cls: 'ws-launcher-grid-label' });
      btn.onclick = a.action;
    }
  }

  // ── Sprint Card ──────────────────────────────────────────────────

  private renderSprintCard(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createDiv({ text: t('launcher.sprintTimer'), cls: 'ws-launcher-card-label' });

    if (this.plugin.sprintTimer.isActive()) {
      card.createDiv({ text: t('launcher.sprintInProgress'), cls: 'ws-launcher-sprint-status' });
      return;
    }

    const startBtn = card.createEl('button', { cls: 'ws-launcher-action-btn mod-cta', text: t('launcher.startSprint') });
    startBtn.onclick = () => {
      new SprintModal(this.app, this.plugin).open();
    };

    const presets = card.createDiv('ws-launcher-sprint-presets');
    presets.createSpan({ text: t('launcher.quickStart'), cls: 'ws-launcher-preset-label' });
    for (const mins of [10, 15, 25]) {
      const btn = presets.createEl('button', { cls: 'ws-launcher-preset-btn', text: `${mins}m` });
      // The sprint-changed event re-renders this panel
      btn.onclick = () => { this.plugin.sprintTimer.setup(mins); };
    }
  }

  // ── Today Card ───────────────────────────────────────────────────

  private async renderTodayCard(root: HTMLElement): Promise<void> {
    const card = root.createDiv('ws-launcher-card');
    card.createDiv({ text: t('launcher.today'), cls: 'ws-launcher-card-label' });

    const stats = this.plugin.statsTracker.getSessionStats();
    const streak = await this.plugin.statsTracker.getStreak();
    const sessionWords = this.plugin.statsTracker.getTotalSessionWords();

    const grid = card.createDiv('ws-launcher-today-grid');

    const items: Array<[string, string]> = [
      [t('launcher.stat.words'), stats.wordsWritten.toLocaleString()],
      [t('launcher.stat.sprints'), String(stats.sprintsCompleted)],
      [t('launcher.stat.minutes'), String(stats.totalMinutes)],
      [t('launcher.stat.streak'), t('launcher.stat.streakDays', { streak })],
    ];

    for (const [label, value] of items) {
      const stat = grid.createDiv('ws-launcher-today-stat');
      this.todayVals.push(stat.createDiv({ text: value, cls: 'ws-launcher-today-val' }));
      stat.createDiv({ text: label, cls: 'ws-launcher-today-label' });
    }

    if (sessionWords > 0) {
      card.createDiv({
        text: t('launcher.sessionWordsTyped', { n: sessionWords.toLocaleString() }),
        cls: 'ws-launcher-session-words',
      });
    }

    const goal = this.plugin.settings.defaultDailyWordGoal;
    if (goal > 0) {
      const pct = Math.min(100, Math.round((stats.wordsWritten / goal) * 100));
      const barWrap = card.createDiv('ws-progress-wrap ws-launcher-progress');
      const bar = barWrap.createDiv('ws-progress-bar');
      bar.setCssProps({ '--ws-bar-width': `${pct}%` });
      card.createSpan({
        text: t('launcher.dailyGoal', { written: stats.wordsWritten, goal }),
        cls: 'ws-launcher-pct',
      });
    }
  }
}
