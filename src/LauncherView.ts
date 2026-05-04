import { ItemView, MarkdownView, WorkspaceLeaf, TFile, Notice, setIcon } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingModeType } from '../models/WritingMode';
import { ProjectModal } from '../modals/ProjectModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { WritingDashboardModal } from '../modals/WritingDashboardModal';
import { ExportModal } from '../modals/ExportModal';
import { PublishModal } from '../modals/PublishModal';
import { SprintModal } from '../modals/SprintModal';

export const LAUNCHER_VIEW_TYPE = 'writing-studio-launcher';

export class LauncherView extends ItemView {
  private plugin: WritingStudioPlugin;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WritingStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return LAUNCHER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Writing Studio';
  }

  getIcon(): string {
    return 'feather';
  }

  async onOpen(): Promise<void> {
    await this.render();
    // Refresh every 10 seconds to update word counts / sprint timer
    this.refreshTimer = window.setInterval(() => { void this.render(); }, 10000);
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
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
    header.createEl('span', { text: 'Writing Studio', cls: 'ws-launcher-title' });

    const settingsBtn = header.createEl('button', { cls: 'ws-launcher-icon-btn', title: 'Settings' });
    setIcon(settingsBtn, 'settings');
    settingsBtn.onclick = () => {
      (this.app as any).setting?.open();
      (this.app as any).setting?.openTabById('writing-studio');
    };
  }

  // ── Project Card ─────────────────────────────────────────────────

  private async renderProjectCard(root: HTMLElement): Promise<void> {
    const project = this.plugin.projectManager.getActiveProject();
    const card = root.createDiv('ws-launcher-card');

    const cardHeader = card.createDiv('ws-launcher-card-header');
    cardHeader.createEl('span', { text: 'Project', cls: 'ws-launcher-card-label' });

    const newProjectBtn = cardHeader.createEl('button', { cls: 'ws-launcher-text-btn', text: '+ New' });
    newProjectBtn.onclick = () => {
      new ProjectModal(this.app, this.plugin, () => this.refresh()).open();
    };

    if (!project) {
      const emptyRow = card.createDiv('ws-launcher-empty');
      emptyRow.textContent = 'No project selected.';

      const projects = this.plugin.projectManager.getProjects();
      if (projects.length > 0) {
        const sel = card.createEl('select', { cls: 'ws-launcher-project-sel' });
        sel.createEl('option', { text: '— Choose project —', value: '' });
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

    // Project name + switcher
    const nameRow = card.createDiv('ws-launcher-project-name-row');
    nameRow.createEl('strong', { text: project.title, cls: 'ws-launcher-project-name' });

    const projects = this.plugin.projectManager.getProjects();
    if (projects.length > 1) {
      const sel = nameRow.createEl('select', { cls: 'ws-launcher-project-mini-sel' });
      for (const p of projects) {
        const opt = sel.createEl('option', { text: p.title, value: p.id });
        if (p.id === project.id) opt.selected = true;
      }
      sel.onchange = async () => {
        await this.plugin.projectManager.setActiveProject(sel.value);
        await this.refresh();
      };
    }

    // Word count + progress
    try {
      const totalWords = await this.plugin.statsTracker.getTotalWordCount();
      const goal = project.goals?.totalWordCount || 0;

      const wcRow = card.createDiv('ws-launcher-wc-row');
      wcRow.createEl('span', { text: `${totalWords.toLocaleString()} words`, cls: 'ws-launcher-wc-num' });
      if (goal > 0) {
        const pct = Math.min(100, Math.round((totalWords / goal) * 100));
        wcRow.createEl('span', { text: `/ ${goal.toLocaleString()} goal`, cls: 'ws-launcher-wc-goal' });
        const barWrap = card.createDiv('ws-progress-wrap ws-launcher-progress');
        const bar = barWrap.createDiv('ws-progress-bar');
        bar.setCssProps({ '--ws-bar-width': `${pct}%` });
        card.createEl('span', { text: `${pct}% complete`, cls: 'ws-launcher-pct' });
      } else {
        wcRow.createEl('span', { text: this.plugin.statsTracker.calculateReadingTime(totalWords), cls: 'ws-launcher-wc-goal' });
      }
    } catch { /* skip if project has no files yet */ }

    const binderBtn = card.createEl('button', { cls: 'ws-launcher-action-btn', text: '📖 Open binder' });
    binderBtn.onclick = () => { void this.plugin.openBinder(); };
  }

  // ── Writing Mode Selector ────────────────────────────────────────

  private renderModeSelector(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createEl('div', { text: 'Writing mode', cls: 'ws-launcher-card-label' });

    const modes: Array<{ id: WritingModeType; label: string; icon: string; desc: string }> = [
      { id: 'draft',  label: 'Draft',  icon: '✍',  desc: 'Focus + typography on, sidebars hidden' },
      { id: 'edit',   label: 'Edit',   icon: '✎',  desc: 'Binder open, full UI visible' },
      { id: 'review', label: 'Review', icon: '👁', desc: 'Reading view, no editing' },
    ];

    const btnRow = card.createDiv('ws-launcher-mode-btns');
    const current = this.plugin.writingModes.getCurrentMode();

    for (const mode of modes) {
      const btn = btnRow.createEl('button', {
        cls: `ws-launcher-mode-btn ${current === mode.id ? 'is-active' : ''}`,
        title: mode.desc,
      });
      btn.createEl('span', { text: mode.icon, cls: 'ws-mode-icon' });
      btn.createEl('span', { text: mode.label, cls: 'ws-mode-label' });
      btn.onclick = async () => {
        if (current === mode.id) {
          await this.plugin.writingModes.switchMode('none');
        } else {
          await this.plugin.writingModes.switchMode(mode.id);
        }
        await this.render();
      };
    }

    if (current !== 'none') {
      const clearBtn = card.createEl('button', { cls: 'ws-launcher-text-btn ws-launcher-clear-mode', text: '✕ Clear mode' });
      clearBtn.onclick = async () => {
        await this.plugin.writingModes.switchMode('none');
        await this.render();
      };
    }
  }

  // ── Focus & Typography Toggles ───────────────────────────────────

  private renderFocusToggles(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createEl('div', { text: 'Focus & typography', cls: 'ws-launcher-card-label' });

    const toggles: Array<{ label: string; isOn: () => boolean; toggle: () => void }> = [
      {
        label: 'Focus Mode',
        isOn: () => this.plugin.focusMode.isActive(),
        toggle: () => { this.plugin.focusMode.toggle(); this.render(); },
      },
      {
        label: 'Typography Mode',
        isOn: () => this.plugin.typographyMode.isActive(),
        toggle: () => { this.plugin.typographyMode.toggle(); this.render(); },
      },
    ];

    for (const t of toggles) {
      const row = card.createDiv('ws-launcher-toggle-row');
      row.createEl('span', { text: t.label, cls: 'ws-launcher-toggle-label' });

      const toggle = row.createEl('button', {
        cls: `ws-launcher-toggle ${t.isOn() ? 'is-on' : 'is-off'}`,
        text: t.isOn() ? 'ON' : 'OFF',
      });
      toggle.onclick = () => t.toggle();
    }
  }

  // ── Quick Actions ────────────────────────────────────────────────

  private renderQuickActions(root: HTMLElement): void {
    const card = root.createDiv('ws-launcher-card');
    card.createEl('div', { text: 'Quick actions', cls: 'ws-launcher-card-label' });

    const actions: Array<{ icon: string; label: string; action: () => void }> = [
      {
        icon: 'target',
        label: 'Targets Dashboard',
        action: () => {
          new TargetsDashboardModal(this.app, this.plugin).open();
        },
      },
      {
        icon: 'bar-chart-2',
        label: 'Writing Dashboard',
        action: () => {
          new WritingDashboardModal(this.app, this.plugin).open();
        },
      },
      {
        icon: 'layers',
        label: 'Preview Manuscript',
        action: () => this.plugin.openCompilePreview(),
      },
      {
        icon: 'download',
        label: 'Export',
        action: () => {
          new ExportModal(this.app, this.plugin).open();
        },
      },
      {
        icon: 'globe',
        label: 'Publish to WordPress',
        action: () => {
          const leaf = this.app.workspace.getMostRecentLeaf();
          const view = leaf?.view;
          const file = view instanceof MarkdownView ? view.file : null;
          if (file instanceof TFile) {
            new PublishModal(this.app, this.plugin, file.path).open();
          } else {
            new Notice('Open a document first.');
          }
        },
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
    card.createEl('div', { text: 'Sprint timer', cls: 'ws-launcher-card-label' });

    if (this.plugin.sprintTimer.isActive()) {
      const timeEl = card.createDiv('ws-launcher-sprint-time');
      timeEl.textContent = this.plugin.sprintTimer.getFormattedRemaining();

      const ctrlRow = card.createDiv('ws-launcher-sprint-ctrls');

      const pauseBtn = ctrlRow.createEl('button', { cls: 'ws-launcher-action-btn', text: '⏸ Pause' });
      pauseBtn.onclick = () => { this.plugin.sprintTimer.pause(); void this.render(); };

      const stopBtn = ctrlRow.createEl('button', { cls: 'ws-launcher-action-btn ws-launcher-stop-btn', text: '■ Stop' });
      stopBtn.onclick = () => { this.plugin.sprintTimer.stop(); void this.render(); };
    } else {
      const startBtn = card.createEl('button', { cls: 'ws-launcher-action-btn mod-cta', text: '⏱ Start sprint' });
      startBtn.onclick = () => {
        new SprintModal(this.app, this.plugin).open();
      };

      // Quick-start preset buttons
      const presets = card.createDiv('ws-launcher-sprint-presets');
      presets.createEl('span', { text: 'Quick start:', cls: 'ws-launcher-preset-label' });
      for (const mins of [10, 15, 25]) {
        const btn = presets.createEl('button', { cls: 'ws-launcher-preset-btn', text: `${mins}m` });
        btn.onclick = () => {
          this.plugin.sprintTimer.start(mins);
          void this.render();
        };
      }
    }
  }

  // ── Today Card ───────────────────────────────────────────────────

  private async renderTodayCard(root: HTMLElement): Promise<void> {
    const card = root.createDiv('ws-launcher-card');
    card.createEl('div', { text: 'Today', cls: 'ws-launcher-card-label' });

    const stats = this.plugin.statsTracker.getSessionStats();
    const streak = await this.plugin.statsTracker.getStreak();

    const grid = card.createDiv('ws-launcher-today-grid');

    const items: Array<[string, string]> = [
      ['Words', stats.wordsWritten.toLocaleString()],
      ['Sprints', String(stats.sprintsCompleted)],
      ['Minutes', String(stats.totalMinutes)],
      ['Streak', `${streak}d`],
    ];

    for (const [label, value] of items) {
      const stat = grid.createDiv('ws-launcher-today-stat');
      stat.createEl('div', { text: value, cls: 'ws-launcher-today-val' });
      stat.createEl('div', { text: label, cls: 'ws-launcher-today-label' });
    }

    const goal = this.plugin.settings.defaultDailyWordGoal;
    if (goal > 0) {
      const pct = Math.min(100, Math.round((stats.wordsWritten / goal) * 100));
      const barWrap = card.createDiv('ws-progress-wrap ws-launcher-progress');
      const bar = barWrap.createDiv('ws-progress-bar');
      bar.setCssProps({ '--ws-bar-width': `${pct}%` });
      card.createEl('span', {
        text: `Daily goal: ${stats.wordsWritten} / ${goal} words`,
        cls: 'ws-launcher-pct',
      });
    }
  }
}
