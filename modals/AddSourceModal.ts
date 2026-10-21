import { App, Modal, Notice, Setting } from 'obsidian';
import { NewSourceFields, SourceType, SOURCE_TYPES, generateCitekey, parseNames, parseYear } from '../src/sources';
import { t } from '../src/i18n';

// The Add source form. A writer fills in what they know about a book,
// article, or web page; the form writes a source note with the properties
// the citation engine reads, and generates the citation key so nobody has
// to invent one. Fields appear for the chosen type only.
export class AddSourceModal extends Modal {
  private readonly taken: ReadonlySet<string>;
  private readonly onSubmit: (fields: NewSourceFields) => Promise<void>;
  private fields: NewSourceFields = {
    type: 'book', title: '', authors: [], editors: [], year: '', publisher: '', place: '',
    containerTitle: '', volume: '', issue: '', pages: '', url: '', doi: '', citekey: '',
  };
  // The key follows the authors and year until the writer edits it by hand.
  private keyEdited = false;
  private keyInput: HTMLInputElement | null = null;
  private typed: Setting[] = [];

  constructor(app: App, taken: ReadonlySet<string>, onSubmit: (fields: NewSourceFields) => Promise<void>) {
    super(app);
    this.taken = taken;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    // The width belongs on the dialog itself — set on the content alone it
    // overflowed the dialog and the right-hand controls were clipped.
    this.modalEl.addClass('ws-source-dialog');
    contentEl.addClass('ws-source-modal');
    contentEl.createEl('h2', { text: t('citations.addSourceTitle') });
    contentEl.createEl('p', { cls: 'ws-source-intro', text: t('citations.addSourceIntro') });

    const typeLabels: Record<SourceType, string> = {
      book: t('citations.type.book'),
      chapter: t('citations.type.chapter'),
      'article-journal': t('citations.type.articleJournal'),
      'article-magazine': t('citations.type.articleMagazine'),
      'article-newspaper': t('citations.type.articleNewspaper'),
      webpage: t('citations.type.webpage'),
      thesis: t('citations.type.thesis'),
      report: t('citations.type.report'),
    };

    new Setting(contentEl)
      .setName(t('citations.field.type'))
      .addDropdown(d => {
        for (const type of SOURCE_TYPES) d.addOption(type, typeLabels[type]);
        d.setValue(this.fields.type);
        d.onChange(v => {
          this.fields.type = v as SourceType;
          this.showTypedFields();
        });
      });

    new Setting(contentEl)
      .setName(t('citations.field.title'))
      .addText(tx => {
        tx.inputEl.addClass('ws-source-wide', 'ws-source-title');
        tx.onChange(v => { this.fields.title = v; this.refreshKey(); });
      });

    new Setting(contentEl)
      .setName(t('citations.field.authors'))
      .setDesc(t('citations.field.authorsDesc'))
      .addTextArea(ta => {
        ta.inputEl.addClass('ws-source-authors');
        ta.inputEl.rows = 2;
        ta.onChange(v => { this.fields.authors = v.split('\n'); this.refreshKey(); });
      });

    new Setting(contentEl)
      .setName(t('citations.field.year'))
      .addText(tx => {
        tx.inputEl.addClass('ws-source-narrow');
        tx.setPlaceholder('2020');
        tx.onChange(v => { this.fields.year = v; this.refreshKey(); });
      });

    // Type-specific rows, each tagged with the types that show it.
    const typed = (types: SourceType[], name: string, build: (s: Setting) => void): void => {
      const setting = new Setting(contentEl).setName(name);
      build(setting);
      setting.settingEl.dataset.types = types.join(' ');
      this.typed.push(setting);
    };
    const text = (key: keyof Omit<NewSourceFields, 'type' | 'authors' | 'editors'>, cls = 'ws-source-wide') =>
      (s: Setting): void => {
        s.addText(tx => {
          tx.inputEl.addClass(cls);
          tx.onChange(v => { this.fields[key] = v; });
        });
      };

    typed(['chapter'], t('citations.field.bookTitle'), text('containerTitle'));
    typed(['chapter'], t('citations.field.editors'), s => {
      s.setDesc(t('citations.field.authorsDesc')).addTextArea(ta => {
        ta.inputEl.addClass('ws-source-authors');
        ta.inputEl.rows = 2;
        ta.onChange(v => { this.fields.editors = v.split('\n'); });
      });
    });
    typed(['article-journal'], t('citations.field.journal'), text('containerTitle'));
    typed(['article-magazine', 'article-newspaper'], t('citations.field.publication'), text('containerTitle'));
    typed(['webpage'], t('citations.field.website'), text('containerTitle'));
    typed(['article-journal'], t('citations.field.volume'), text('volume', 'ws-source-narrow'));
    typed(['article-journal'], t('citations.field.issue'), text('issue', 'ws-source-narrow'));
    typed(['chapter', 'article-journal', 'article-magazine', 'article-newspaper'], t('citations.field.pages'), text('pages', 'ws-source-narrow'));
    typed(['book', 'chapter', 'report'], t('citations.field.publisher'), text('publisher'));
    typed(['thesis'], t('citations.field.university'), text('publisher'));
    typed(['book', 'chapter', 'report'], t('citations.field.place'), text('place'));

    new Setting(contentEl)
      .setName(t('citations.field.link'))
      .setDesc(t('citations.field.linkDesc'))
      .addText(tx => {
        tx.inputEl.addClass('ws-source-wide');
        tx.onChange(v => {
          const value = v.trim();
          const doi = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,}\/\S+)$/i.exec(value);
          this.fields.doi = doi ? doi[1] : '';
          this.fields.url = doi ? '' : value;
        });
      });

    new Setting(contentEl)
      .setName(t('citations.field.citekey'))
      .setDesc(t('citations.field.citekeyDesc'))
      .addText(tx => {
        this.keyInput = tx.inputEl;
        tx.inputEl.addClass('ws-source-key');
        tx.onChange(v => { this.fields.citekey = v.trim(); this.keyEdited = v.trim().length > 0; });
      });

    const btnRow = contentEl.createDiv('modal-button-container');
    const addBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('citations.addSourceBtn') });
    addBtn.onclick = () => { void this.submit(addBtn); };
    const cancelBtn = btnRow.createEl('button', { text: t('synopsis.cancel') });
    cancelBtn.onclick = () => this.close();

    this.showTypedFields();

    // Keyboard flow (UX pass): the cursor starts in the title — the one
    // field every source needs — and Enter in any single-line field adds
    // the source. The authors textarea keeps Enter for a new line.
    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || !(e.target instanceof HTMLInputElement)) return;
      e.preventDefault();
      addBtn.click();
    });
    contentEl.querySelector<HTMLInputElement>('input.ws-source-title')?.focus();
  }

  private showTypedFields(): void {
    for (const s of this.typed) {
      const types = (s.settingEl.dataset.types ?? '').split(' ');
      s.settingEl.toggleClass('ws-hidden', !types.includes(this.fields.type));
    }
  }

  private refreshKey(): void {
    if (this.keyEdited || !this.keyInput) return;
    const authors = parseNames(this.fields.authors.filter(a => a.trim().length > 0));
    const key = (authors.length > 0 || this.fields.title.trim()) ? generateCitekey(authors, parseYear(this.fields.year), this.fields.title.trim(), this.taken) : '';
    this.fields.citekey = key;
    this.keyInput.value = key;
  }

  private async submit(button: HTMLButtonElement): Promise<void> {
    const f = this.fields;
    if (!f.title.trim()) {
      new Notice(t('citations.titleRequired'));
      return;
    }
    if (!f.citekey) this.refreshKey();
    if (!/^[A-Za-z0-9_][A-Za-z0-9_:.#$%&\-+?<>~/]*$/.test(f.citekey)) {
      new Notice(t('citations.citekeyInvalid'));
      return;
    }
    if (this.taken.has(f.citekey)) {
      new Notice(t('citations.citekeyTaken', { key: f.citekey }));
      return;
    }
    button.disabled = true;
    try {
      await this.onSubmit({ ...f, title: f.title.trim() });
      this.close();
    } catch (e) {
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
      button.disabled = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
