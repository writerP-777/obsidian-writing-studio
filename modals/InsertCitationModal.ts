import { App, Modal, prepareFuzzySearch, setIcon } from 'obsidian';
import { Source } from '../src/sources';
import { namesInText } from '../src/chicago';
import { parseLocator, locatorToPandoc } from '../src/citations';
import { t } from '../src/i18n';

// The citation picker: type part of an author, year, or title, pick a
// source, optionally give a page, and `[@citekey, p. 12]` lands at the
// cursor. Keyboard-first — arrows move, Enter inserts, Escape closes.
export class InsertCitationModal extends Modal {
  private readonly sources: Source[];
  private readonly onChoose: (text: string) => void;
  private query = '';
  private page = '';
  private selected = 0;
  private matches: Source[] = [];
  private listEl: HTMLElement | null = null;
  private searchEl: HTMLInputElement | null = null;

  constructor(app: App, sources: Source[], onChoose: (text: string) => void) {
    super(app);
    this.sources = [...sources].sort((a, b) => this.label(a).localeCompare(this.label(b)));
    this.onChoose = onChoose;
  }

  private label(s: Source): string {
    const who = s.authors.length ? namesInText(s.authors) : (s.editors.length ? namesInText(s.editors) : '');
    return `${who} ${s.year ?? ''} ${s.title}`.trim();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-cite-modal');
    contentEl.createEl('h2', { text: t('citations.insertTitle') });

    if (this.sources.length === 0) {
      const empty = contentEl.createDiv('ws-cite-empty');
      empty.createEl('p', { text: t('citations.noSources') });
      empty.createEl('p', { cls: 'ws-cite-hint', text: t('citations.noSourcesHint') });
      return;
    }

    const searchWrap = contentEl.createDiv('ws-cite-search');
    const searchIcon = searchWrap.createSpan('ws-cite-search-icon');
    setIcon(searchIcon, 'search');
    const search = searchWrap.createEl('input', { type: 'text', cls: 'ws-cite-search-input' });
    search.placeholder = t('citations.searchPlaceholder');
    search.setAttribute('aria-label', t('citations.searchPlaceholder'));
    this.searchEl = search;
    search.addEventListener('input', () => {
      this.query = search.value;
      this.selected = 0;
      this.renderList();
    });

    this.listEl = contentEl.createDiv('ws-cite-list');
    this.listEl.setAttribute('role', 'listbox');

    const pageRow = contentEl.createDiv('ws-cite-page-row');
    pageRow.createEl('label', { text: t('citations.pageLabel'), attr: { for: 'ws-cite-page' } });
    const page = pageRow.createEl('input', { type: 'text', cls: 'ws-cite-page-input', attr: { id: 'ws-cite-page' } });
    page.placeholder = t('citations.pagePlaceholder');
    page.addEventListener('input', () => { this.page = page.value; });
    pageRow.createSpan({ cls: 'ws-cite-hint', text: t('citations.pageHint') });

    const btnRow = contentEl.createDiv('modal-button-container');
    const insertBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('citations.insertBtn') });
    insertBtn.onclick = () => this.choose();
    const cancelBtn = btnRow.createEl('button', { text: t('synopsis.cancel') });
    cancelBtn.onclick = () => this.close();

    // One handler for both inputs: arrows move the highlight, Enter inserts.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.choose(); }
    };
    search.addEventListener('keydown', onKey);
    page.addEventListener('keydown', onKey);

    this.renderList();
    search.focus();
  }

  private move(delta: number): void {
    if (this.matches.length === 0) return;
    this.selected = (this.selected + delta + this.matches.length) % this.matches.length;
    this.renderList();
  }

  private choose(): void {
    const source = this.matches[this.selected];
    if (!source) return;
    const locator = parseLocator(this.page);
    const text = locator ? `[@${source.citekey}, ${locatorToPandoc(locator)}]` : `[@${source.citekey}]`;
    this.close();
    this.onChoose(text);
  }

  private renderList(): void {
    const list = this.listEl;
    if (!list) return;
    list.empty();

    const query = this.query.trim();
    if (query) {
      const search = prepareFuzzySearch(query);
      const scored: { s: Source; score: number }[] = [];
      for (const s of this.sources) {
        const r = search(`${this.label(s)} ${s.citekey}`);
        if (r) scored.push({ s, score: r.score });
      }
      this.matches = scored.sort((a, b) => b.score - a.score).map(x => x.s);
    } else {
      this.matches = this.sources;
    }

    if (this.matches.length === 0) {
      list.createDiv({ cls: 'ws-cite-empty', text: t('citations.noMatches') });
      return;
    }
    this.selected = Math.min(this.selected, this.matches.length - 1);

    this.matches.forEach((s, i) => {
      const row = list.createDiv('ws-cite-row');
      row.setAttribute('role', 'option');
      row.toggleClass('is-selected', i === this.selected);
      row.setAttribute('aria-selected', String(i === this.selected));
      const who = s.authors.length ? namesInText(s.authors) : (s.editors.length ? namesInText(s.editors) : '');
      const head = row.createDiv('ws-cite-row-head');
      if (who) head.createSpan({ cls: 'ws-cite-author', text: who });
      if (s.year) head.createSpan({ cls: 'ws-cite-year', text: s.year });
      head.createSpan({ cls: 'ws-cite-key', text: `@${s.citekey}` });
      row.createDiv({ cls: 'ws-cite-title', text: s.title });
      row.addEventListener('mousemove', () => {
        if (this.selected !== i) { this.selected = i; this.renderList(); }
      });
      row.addEventListener('click', () => { this.selected = i; this.choose(); });
    });

    const active = list.children[this.selected];
    if (active?.instanceOf(HTMLElement)) active.scrollIntoView({ block: 'nearest' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
