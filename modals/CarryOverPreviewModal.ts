import { App, Modal } from 'obsidian';
import { CarryOverDocOp, CarryOverFolderOp, CarryOverPlan, fmRowState } from '../src/carryOver';
import { t } from '../src/i18n';

// The carry-over dry run (#230): lists every operation the pass would
// perform, in plain vocabulary, before any consent is asked. This slice is
// read-only — the footer closes the modal; #231 adds the execute button.
//
// Rendering rules from the approved AC: the dry-run banner comes first;
// section headings are state-neutral (they name the kind, never a pending
// action) and the verb lives in each row, so a done row always reads as a
// fact about the present (Cowork addition 1).
export class CarryOverPreviewModal extends Modal {
  private projectTitle: string;
  private projectFolderPath: string;
  private plan: CarryOverPlan;

  constructor(app: App, projectTitle: string, projectFolderPath: string, plan: CarryOverPlan) {
    super(app);
    this.projectTitle = projectTitle;
    this.projectFolderPath = projectFolderPath;
    this.plan = plan;
  }

  onOpen(): void {
    const { contentEl, plan } = this;
    this.titleEl.setText(t('binder.carryOver.modalTitle', { project: this.projectTitle }));
    this.modalEl.addClass('ws-co-modal');

    contentEl.createDiv({ cls: 'ws-co-banner', text: t('binder.carryOver.dryRun') });

    const { total, done, pending, anomalies } = plan.counts;
    contentEl.createDiv({
      cls: 'ws-co-counts',
      text: [
        t('binder.carryOver.countsOperations', { count: total }),
        t('binder.carryOver.countsDone', { count: done }),
        t('binder.carryOver.countsPending', { count: pending }),
        t('binder.carryOver.countsAnomalies', { count: anomalies }),
      ].join(' · '),
    });

    if (plan.folderOps.length > 0) {
      contentEl.createDiv({ cls: 'ws-co-section', text: t('binder.carryOver.sectionFolders') });
      for (const op of plan.folderOps) this.renderFolderRow(contentEl, op);
    }

    if (plan.docOps.length > 0) {
      contentEl.createDiv({ cls: 'ws-co-section', text: t('binder.carryOver.sectionDocuments') });
      for (const op of plan.docOps) this.renderDocRow(contentEl, op);
    }

    const fmOps = plan.docOps.filter(op => fmRowState(op) !== null);
    if (fmOps.length > 0) {
      const heading = contentEl.createDiv('ws-co-section');
      heading.createSpan({ text: t('binder.carryOver.sectionFrontmatter') });
      heading.createSpan({ cls: 'ws-co-section-note', text: ` (${t('binder.carryOver.keptNote')})` });
      for (const op of fmOps) this.renderFmRow(contentEl, op);
    }

    contentEl.createDiv({ cls: 'ws-co-backup', text: t('binder.carryOver.backupNote') });

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const closeBtn = buttons.createEl('button', { text: t('binder.carryOver.close') });
    closeBtn.onclick = () => this.close();
  }

  private stateGlyph(row: HTMLElement, state: 'done' | 'pending' | 'anomaly'): void {
    const glyphs = { done: '✓', pending: '•', anomaly: '⚠' } as const;
    row.createSpan({ cls: `ws-co-glyph ws-co-glyph-${state}`, text: glyphs[state] });
  }

  private badge(row: HTMLElement, op: { suffixed: boolean; reserved: boolean; titleUnusable?: boolean }): void {
    const key = op.reserved
      ? 'binder.carryOver.badgeReserved'
      : op.suffixed
        ? 'binder.carryOver.badgeSuffixed'
        : op.titleUnusable
          ? 'binder.carryOver.badgeTitleUnusable'
          : null;
    if (key) row.createSpan({ cls: 'ws-co-badge', text: t(key) });
  }

  private relative(path: string): string {
    const prefix = this.projectFolderPath + '/';
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }

  private renderFolderRow(container: HTMLElement, op: CarryOverFolderOp): void {
    const row = container.createDiv('ws-co-row');
    this.stateGlyph(row, op.state);
    row.createSpan({ cls: 'ws-co-source', text: op.displayName });
    row.createSpan({
      cls: 'ws-co-verb',
      text: t(op.state === 'done' ? 'binder.carryOver.folderExists' : 'binder.carryOver.folderCreate'),
    });
    row.createSpan({ cls: 'ws-co-target', text: op.targetName });
    this.badge(row, op);
  }

  private renderDocRow(container: HTMLElement, op: CarryOverDocOp): void {
    const row = container.createDiv('ws-co-row');
    this.stateGlyph(row, op.state);
    row.createSpan({ cls: 'ws-co-source', text: this.relative(op.originalPath) });
    if (op.state === 'anomaly') {
      row.createSpan({
        cls: 'ws-co-verb',
        text: t(op.anomaly === 'target-occupied'
          ? 'binder.carryOver.anomalyOccupied'
          : 'binder.carryOver.anomalyMissing'),
      });
      return;
    }
    row.createSpan({
      cls: 'ws-co-verb',
      text: t(op.state === 'done' ? 'binder.carryOver.docDone' : 'binder.carryOver.docMove'),
    });
    row.createSpan({ cls: 'ws-co-target', text: this.relative(op.finalPath) });
    this.badge(row, op);
  }

  private renderFmRow(container: HTMLElement, op: CarryOverDocOp): void {
    const row = container.createDiv('ws-co-row');
    this.stateGlyph(row, fmRowState(op) === 'done' ? 'done' : 'pending');
    row.createSpan({ cls: 'ws-co-source', text: op.finalPath.split('/').pop() ?? op.finalPath });
    const parts = op.frontmatter.map(e =>
      e.kept ? t('binder.carryOver.keptKey', { key: e.key }) : `${e.key}: ${String(e.value)}`);
    row.createSpan({ cls: 'ws-co-fm', text: parts.join(' · ') });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
