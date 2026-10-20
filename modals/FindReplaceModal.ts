import { App, Modal, Notice, TFile, setIcon } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { findMatches, replaceMatches, planUndo, ReplaceRecord, SearchQuery, TextMatch } from '../src/projectSearch';
import { listManuscriptDocs, listResearchDocs } from '../src/manuscriptTree';
import { safeHandler } from '../src/safeHandler';
import { t } from '../src/i18n';

interface SearchFile {
  file: TFile;
  title: string;
  research: boolean;
  /** The content the matches were found in; a replace is refused if the file has moved on. */
  text: string;
}

interface Group {
  sf: SearchFile;
  matches: TextMatch[];
  selected: boolean[];
  collapsed: boolean;
}

// Project-wide find and replace as a dialog: matches listed by section with
// a checkbox each, replace the ticked ones or all, and one undo that puts
// every touched file back exactly — the safety net for an operation that
// changes many files at once. Properties and code are never searched.
export class FindReplaceModal extends Modal {
  private readonly plugin: WritingStudioPlugin;
  private readonly projectFolder: string;
  private query: SearchQuery = { find: '', matchCase: false, wholeWord: false };
  private includeResearch = false;
  private replacement = '';
  private files: SearchFile[] = [];
  private groups: Group[] = [];
  private summaryEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private replaceSelectedBtn: HTMLButtonElement | null = null;
  private replaceAllBtn: HTMLButtonElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private searchTimer: number | null = null;
  private loading = false;

  constructor(app: App, plugin: WritingStudioPlugin, projectFolder: string) {
    super(app);
    this.plugin = plugin;
    this.projectFolder = projectFolder;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    // Width belongs on the dialog itself (the Add source lesson)
    this.modalEl.addClass('ws-find-dialog');
    contentEl.addClass('ws-find-modal');
    this.titleEl.setText(t('findReplace.title'));

    const fields = contentEl.createDiv('ws-find-fields');
    const findRow = fields.createDiv('ws-find-row');
    findRow.createEl('label', { text: t('findReplace.findLabel'), attr: { for: 'ws-find-input' } });
    const findInput = findRow.createEl('input', { type: 'text', cls: 'ws-find-input', attr: { id: 'ws-find-input' } });
    findInput.addEventListener('input', () => {
      this.query = { ...this.query, find: findInput.value };
      this.scheduleSearch();
    });

    const replaceRow = fields.createDiv('ws-find-row');
    replaceRow.createEl('label', { text: t('findReplace.replaceLabel'), attr: { for: 'ws-replace-input' } });
    const replaceInput = replaceRow.createEl('input', { type: 'text', cls: 'ws-find-input', attr: { id: 'ws-replace-input' } });
    replaceInput.addEventListener('input', () => { this.replacement = replaceInput.value; });

    const options = contentEl.createDiv('ws-find-options');
    const option = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
      const wrap = options.createEl('label', { cls: 'ws-find-option' });
      const box = wrap.createEl('input', { type: 'checkbox' });
      box.checked = get();
      box.addEventListener('change', () => { set(box.checked); this.scheduleSearch(); });
      wrap.createSpan({ text: label });
    };
    option(t('findReplace.matchCase'), () => this.query.matchCase, v => { this.query = { ...this.query, matchCase: v }; });
    option(t('findReplace.wholeWord'), () => this.query.wholeWord, v => { this.query = { ...this.query, wholeWord: v }; });
    option(t('findReplace.includeResearch'), () => this.includeResearch, v => { this.includeResearch = v; });

    this.summaryEl = contentEl.createDiv('ws-find-summary');
    this.resultsEl = contentEl.createDiv('ws-find-results');

    const buttons = contentEl.createDiv('ws-find-buttons');
    this.replaceSelectedBtn = buttons.createEl('button', { cls: 'mod-cta' });
    this.replaceSelectedBtn.onclick = safeHandler(() => this.replace(false));
    this.replaceAllBtn = buttons.createEl('button', { text: t('findReplace.replaceAll') });
    this.replaceAllBtn.onclick = safeHandler(() => this.replace(true));
    this.undoBtn = buttons.createEl('button', { cls: 'ws-find-undo', text: t('findReplace.undo') });
    this.undoBtn.onclick = safeHandler(() => this.undo());
    const closeBtn = buttons.createEl('button', { cls: 'ws-find-close', text: t('findReplace.close') });
    closeBtn.onclick = () => this.close();

    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); replaceInput.focus(); }
    });
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void this.replace(false); }
    });

    this.renderResults();
    findInput.focus();
    void this.loadFiles();
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  private async loadFiles(): Promise<void> {
    this.loading = true;
    const title = (f: TFile): string => f.name.slice(0, f.name.length - f.extension.length - 1);
    const docs = listManuscriptDocs(this.app, this.projectFolder).map(f => ({ file: f, research: false }));
    const research = listResearchDocs(this.app, this.projectFolder).map(f => ({ file: f, research: true }));
    const loaded: SearchFile[] = [];
    for (const { file, research: r } of [...docs, ...research]) {
      loaded.push({ file, title: title(file), research: r, text: await this.app.vault.cachedRead(file) });
    }
    this.files = loaded;
    this.loading = false;
    this.search();
  }

  private scheduleSearch(): void {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => {
      this.searchTimer = null;
      this.search();
    }, 150);
  }

  private search(): void {
    const prior = new Map(this.groups.map(g => [g.sf.file.path, g.collapsed]));
    this.groups = [];
    if (this.query.find) {
      for (const sf of this.files) {
        if (sf.research && !this.includeResearch) continue;
        const matches = findMatches(sf.text, this.query);
        if (matches.length === 0) continue;
        this.groups.push({ sf, matches, selected: matches.map(() => true), collapsed: prior.get(sf.file.path) ?? false });
      }
    }
    this.renderResults();
  }

  private counts(): { matches: number; sections: number; selected: number } {
    let matches = 0;
    let selected = 0;
    for (const g of this.groups) {
      matches += g.matches.length;
      selected += g.selected.filter(Boolean).length;
    }
    return { matches, sections: this.groups.length, selected };
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private renderResults(): void {
    const results = this.resultsEl;
    const summary = this.summaryEl;
    if (!results || !summary) return;
    results.empty();

    const { matches, sections } = this.counts();
    if (!this.query.find) {
      summary.setText(this.loading ? t('findReplace.loading') : t('findReplace.typeToFind'));
    } else if (matches === 0) {
      summary.setText(t('findReplace.noMatches'));
    } else {
      summary.setText(t('findReplace.summary', { count: matches, sections: t('findReplace.sections', { count: sections }) }));
    }

    for (const g of this.groups) {
      const groupEl = results.createDiv('ws-find-group');
      const head = groupEl.createDiv('ws-find-group-head');
      const chevron = head.createSpan('ws-find-chevron');
      setIcon(chevron, g.collapsed ? 'chevron-right' : 'chevron-down');
      chevron.onclick = () => { g.collapsed = !g.collapsed; this.renderResults(); };

      const all = head.createEl('input', { type: 'checkbox', cls: 'ws-find-group-check' });
      const n = g.selected.filter(Boolean).length;
      all.checked = n === g.selected.length;
      all.indeterminate = n > 0 && n < g.selected.length;
      all.addEventListener('change', () => {
        g.selected = g.selected.map(() => all.checked);
        this.renderResults();
      });

      const titleBtn = head.createEl('button', { cls: 'ws-find-group-title', text: g.sf.title });
      titleBtn.setAttribute('aria-label', t('findReplace.openDoc', { name: g.sf.title }));
      titleBtn.onclick = safeHandler(async () => {
        await this.app.workspace.getLeaf(false).openFile(g.sf.file, { eState: { line: g.matches[0].line } });
      });
      if (g.sf.research) head.createSpan({ cls: 'ws-find-tag', text: t('findReplace.researchTag') });
      head.createSpan({ cls: 'ws-find-count', text: String(g.matches.length) });

      if (g.collapsed) continue;
      g.matches.forEach((m, i) => {
        const row = groupEl.createEl('label', { cls: 'ws-find-match' });
        const box = row.createEl('input', { type: 'checkbox' });
        box.checked = g.selected[i];
        box.addEventListener('change', () => {
          g.selected[i] = box.checked;
          this.updateButtons();
          all.checked = g.selected.every(Boolean);
          all.indeterminate = g.selected.some(Boolean) && !g.selected.every(Boolean);
        });
        const snippet = row.createSpan('ws-find-snippet');
        snippet.createSpan({ text: m.before });
        snippet.createSpan({ cls: 'ws-find-hit', text: m.hit });
        snippet.createSpan({ text: m.after });
      });
    }
    this.updateButtons();
  }

  private updateButtons(): void {
    const { matches, selected } = this.counts();
    if (this.replaceSelectedBtn) {
      this.replaceSelectedBtn.setText(t('findReplace.replaceSelected', { count: selected }));
      this.replaceSelectedBtn.disabled = selected === 0;
    }
    if (this.replaceAllBtn) this.replaceAllBtn.disabled = matches === 0;
    if (this.undoBtn) this.undoBtn.disabled = this.plugin.replaceLedger === null;
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  private async replace(all: boolean): Promise<void> {
    const records: ReplaceRecord[] = [];
    const skipped: string[] = [];
    let replaced = 0;
    for (const g of this.groups) {
      const spans = g.matches.filter((_, i) => all || g.selected[i]);
      if (spans.length === 0) continue;
      const before = g.sf.text;
      const after = replaceMatches(before, spans, this.replacement);
      let applied = false;
      await this.app.vault.process(g.sf.file, (data) => {
        if (data !== before) return data;
        applied = true;
        return after;
      });
      if (!applied) { skipped.push(g.sf.title); continue; }
      records.push({ path: g.sf.file.path, before, after });
      replaced += spans.length;
    }
    if (records.length > 0) {
      this.plugin.replaceLedger = records;
      new Notice(t('findReplace.replaced', { count: replaced, sections: t('findReplace.sections', { count: records.length }) }));
    }
    if (skipped.length > 0) new Notice(t('findReplace.skippedChanged', { names: skipped.join(', ') }));
    await this.loadFiles();
  }

  private async undo(): Promise<void> {
    const ledger = this.plugin.replaceLedger;
    if (!ledger) {
      new Notice(t('findReplace.nothingToUndo'));
      return;
    }
    const current = new Map<string, string | null>();
    for (const r of ledger) {
      const f = this.app.vault.getAbstractFileByPath(r.path);
      current.set(r.path, f instanceof TFile ? await this.app.vault.read(f) : null);
    }
    const plan = planUndo(ledger, p => current.get(p) ?? null);
    for (const { path, content } of plan.restore) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await this.app.vault.modify(f, content);
    }
    this.plugin.replaceLedger = null;
    new Notice(t('findReplace.undone', { count: plan.restore.length }));
    if (plan.skipped.length > 0) {
      const names = plan.skipped.map(p => p.split('/').pop()?.replace(/\.md$/, '') ?? p);
      new Notice(t('findReplace.undoSkipped', { names: names.join(', ') }));
    }
    await this.loadFiles();
  }

  onClose(): void {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    this.contentEl.empty();
  }
}
