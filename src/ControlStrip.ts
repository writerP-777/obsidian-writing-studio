import { Menu, setIcon, setTooltip } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WritingModeType } from '../models/WritingMode';
import { ExportModal } from '../modals/ExportModal';
import { SprintModal } from '../modals/SprintModal';
import { TargetsDashboardModal } from '../modals/TargetsDashboardModal';
import { WritingDashboardModal } from '../modals/WritingDashboardModal';
import { t } from './i18n';

// The two-row control strip at the top of the binder panel — the
// high-frequency writing-environment controls, so the daily loop no longer
// needs the launcher tab. The owning view re-creates the strip on each
// render and calls sync() when a StudioEvents announcement arrives; all
// state updates patch the existing elements in place.
export class ControlStrip {
  private plugin: WritingStudioPlugin;
  private modeBtns = new Map<WritingModeType, HTMLElement>();
  private focusPill!: HTMLElement;
  private typographyPill!: HTMLElement;
  private sprintChip!: HTMLElement;

  constructor(plugin: WritingStudioPlugin, parent: HTMLElement) {
    this.plugin = plugin;
    const strip = parent.createDiv('ws-binder-strip');
    this.renderModeRow(strip);
    this.renderToggleRow(strip);
    this.sync();
  }

  // Patches every dynamic element from live plugin state
  sync(): void {
    const mode = this.plugin.writingModes.getCurrentMode();
    for (const [id, btn] of this.modeBtns) {
      btn.toggleClass('is-active', id === mode);
    }
    this.focusPill.toggleClass('is-on', this.plugin.focusMode.isActive());
    this.typographyPill.toggleClass('is-on', this.plugin.typographyMode.isActive());
    this.syncSprintChip();
  }

  private renderModeRow(strip: HTMLElement): void {
    const seg = strip.createDiv('ws-strip-modes');
    const modes: Array<{ id: WritingModeType; label: string; icon: string; desc: string }> = [
      { id: 'draft',  label: t('launcher.mode.draft'),  icon: 'pencil', desc: t('launcher.mode.draftDesc') },
      { id: 'edit',   label: t('launcher.mode.edit'),   icon: 'edit-3', desc: t('launcher.mode.editDesc') },
      { id: 'review', label: t('launcher.mode.review'), icon: 'eye',    desc: t('launcher.mode.reviewDesc') },
    ];
    for (const mode of modes) {
      const btn = seg.createEl('button', { cls: 'ws-strip-mode-btn' });
      setTooltip(btn, mode.desc);
      setIcon(btn.createSpan('ws-strip-mode-icon'), mode.icon);
      btn.createSpan({ text: mode.label, cls: 'ws-strip-mode-label' });
      btn.onclick = () => {
        // Clicking the active mode clears back to none
        const current = this.plugin.writingModes.getCurrentMode();
        void this.plugin.writingModes.switchMode(current === mode.id ? 'none' : mode.id);
      };
      this.modeBtns.set(mode.id, btn);
    }
  }

  private renderToggleRow(strip: HTMLElement): void {
    const row = strip.createDiv('ws-strip-row2');

    this.focusPill = row.createEl('button', { cls: 'ws-strip-pill', text: t('binder.strip.focus') });
    setTooltip(this.focusPill, t('launcher.focusMode'));
    this.focusPill.onclick = () => { this.plugin.focusMode.toggle(); };

    this.typographyPill = row.createEl('button', { cls: 'ws-strip-pill', text: t('binder.strip.typography') });
    setTooltip(this.typographyPill, t('launcher.typographyMode'));
    this.typographyPill.onclick = () => { void this.plugin.typographyMode.toggle(); };

    this.sprintChip = row.createEl('button', { cls: 'ws-strip-chip' });
    this.sprintChip.onclick = (e) => this.showSprintMenu(e);

    const overflow = row.createEl('button', { cls: 'ws-strip-overflow' });
    setIcon(overflow, 'more-horizontal');
    setTooltip(overflow, t('binder.strip.moreActions'));
    overflow.onclick = (e) => this.showOverflowMenu(e);
  }

  private syncSprintChip(): void {
    const timer = this.plugin.sprintTimer;
    this.sprintChip.empty();
    setIcon(this.sprintChip.createSpan('ws-strip-chip-icon'), 'timer');
    let label = t('binder.strip.sprint');
    if (timer.isActive()) {
      const minutes = timer.getDurationMinutes();
      label = timer.isReady()
        ? t('binder.strip.sprintReady', { minutes })
        : t('binder.strip.sprintRunning');
    }
    this.sprintChip.createSpan({ text: label });
    this.sprintChip.toggleClass('is-armed', timer.isActive() && timer.isReady());
    this.sprintChip.toggleClass('is-running', timer.isActive() && !timer.isReady());
  }

  private showSprintMenu(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(i => i.setTitle(t('sprintModal.setupTitle')).setIcon('settings-2').onClick(() => {
      new SprintModal(this.plugin.app, this.plugin).open();
    }));
    menu.addSeparator();
    for (const mins of [10, 15, 25]) {
      menu.addItem(i => i.setTitle(t('binder.strip.quickStart', { minutes: mins })).setIcon('timer').onClick(() => {
        this.plugin.sprintTimer.setup(mins);
      }));
    }
    menu.showAtMouseEvent(e);
  }

  // The occasional actions — each opens the same surface as its launcher
  // counterpart (the labels are shared too)
  private showOverflowMenu(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(i => i.setTitle(t('launcher.action.export')).setIcon('download').onClick(() => {
      new ExportModal(this.plugin.app, this.plugin, 'project').open();
    }));
    menu.addItem(i => i.setTitle(t('launcher.action.publishToWordPress')).setIcon('globe').onClick(() => {
      this.plugin.publishCurrentFile();
    }));
    menu.addItem(i => i.setTitle(t('launcher.action.previewManuscript')).setIcon('layers').onClick(() => {
      void this.plugin.openCompilePreview();
    }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('launcher.action.targetsDashboard')).setIcon('target').onClick(() => {
      new TargetsDashboardModal(this.plugin.app, this.plugin).open();
    }));
    menu.addItem(i => i.setTitle(t('launcher.action.writingDashboard')).setIcon('bar-chart-2').onClick(() => {
      new WritingDashboardModal(this.plugin.app, this.plugin).open();
    }));
    menu.addItem(i => i.setTitle(t('launcher.action.writingLog')).setIcon('calendar-days').onClick(() => {
      void this.plugin.openWritingLog();
    }));
    menu.showAtMouseEvent(e);
  }
}
