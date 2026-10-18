import { App, MarkdownView, TFile, getLanguage, normalizePath, Notice } from 'obsidian';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type WritingStudioPlugin from '../main';
import type { VaultFiles } from './VaultFiles';
import { EpubEngine, EpubChapter } from './EpubEngine';
import { t } from './i18n';
import { localDateString } from './dates';
import { markdownToHtml } from './markdown';
import { buildManuscriptTree, planCompile, CompilePlanItem } from './manuscriptTree';
import { parseFolderPrefix } from './binderOrder';
import { ExportTitleChoice, sanitizeTitleForFilename } from './exportTitle';
import { buildSourceIndex, SourceIndex } from './sourceIndex';
import { renderCitations, preparePandocSections, citationReport, CiteLabels, CitationReport } from './citeRender';
import { CHICAGO_NOTES_CSL } from './chicagoNotesCsl';
import { renderSectionHtml, SectionHtml } from './footnotes';
import type { CitationStyle } from './chicago';

const execFileAsync = promisify(execFile);

export type ExportFormat = 'pdf' | 'docx' | 'rtf' | 'md' | 'html' | 'epub' | 'manuscript';
export type ExportScope = 'current' | 'selected' | 'project';

export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  selectedFiles?: string[];
  includeFrontmatter: boolean;
  includeTitlesAsHeadings: boolean;
  /** Folder display names become headings at folder depth. */
  includeFolderNamesAsHeadings?: boolean;
  /** Manuscript-zone folder to compile instead of the whole zone (fs binder only). */
  subtreeRoot?: string;
  /**
   * The export's one title (#260) — filename, title page, and metadata all use
   * this value. Absent, the default mirrors the dialog's: the folder display
   * name for a folder export, else the project title.
   */
  exportTitle?: string;
  /**
   * Document a 'current' scope export targets. Captured by the dialog so a
   * compile-preview leaf cannot become the "most recent leaf" and break the
   * live lookup.
   */
  currentFile?: string;
  paperSize: 'letter' | 'a4';
  font: string;
  fontSize: number;
  outputPath?: string;
  addTitlePage: boolean;
  coverImagePath?: string;
  authorContact?: string;
}

// The compile with citations rendered by the built-in formatter: one
// markdown string per compiled section, plus the references section.
export interface RenderedCompile {
  sections: string[];
  references: string | null;
}

/**
 * The export dialog's selections, carried between the dialog and the compile
 * preview so the preview renders exactly what the export would produce (#260).
 */
export interface ExportUiState {
  scope: ExportScope;
  subtreeRoot?: string;
  currentFilePath?: string;
  includeFrontmatter: boolean;
  includeTitlesAsHeadings: boolean;
  includeFolderNamesAsHeadings: boolean;
  addTitlePage: boolean;
  titleChoice: ExportTitleChoice;
  customTitle: string;
}

// The dialog's defaults — also what the standalone preview command renders.
export function defaultExportUiState(subtreeRoot?: string): ExportUiState {
  return {
    scope: 'project',
    subtreeRoot,
    includeFrontmatter: false,
    includeTitlesAsHeadings: true,
    includeFolderNamesAsHeadings: false,
    addTitlePage: true,
    titleChoice: subtreeRoot ? 'folder' : 'project',
    customTitle: '',
  };
}

// The citation style setting: the two built-in Chicago styles, or a CSL file
// of the writer's own that only the Pandoc formats can apply.
export type CitationStyleSetting = CitationStyle | 'custom';

export type PdfEngine = 'xelatex' | 'lualatex' | 'pdflatex' | 'wkhtmltopdf';

// A pinned engine from settings, or 'auto' for the historic LaTeX auto-selection.
export type PdfEnginePreference = 'auto' | PdfEngine;

// Engines that honor pandoc's -V mainfont (fontspec-capable LaTeX engines).
// pdflatex errors on it; wkhtmltopdf takes styling from CSS, not mainfont.
const FONT_CAPABLE: ReadonlySet<PdfEngine> = new Set(['xelatex', 'lualatex']);

export interface PdfEngineDecision {
  // The engine to pass to pandoc, or null when the pinned engine (or, on auto,
  // every LaTeX engine) is not installed.
  engine: PdfEngine | null;
  // Whether the requested mainfont can be honored (only xelatex/lualatex can).
  keepFont: boolean;
}

// Pure decision: given which engines are installed, whether the export requests a
// custom font, and the user's engine preference, pick the PDF engine and whether
// the font survives. A pinned engine is strict — used if installed, otherwise the
// export fails rather than silently substituting another engine (a user who pinned
// wkhtmltopdf to avoid LaTeX must not get a LaTeX export). On auto, with a font,
// prefer fontspec-capable engines (xelatex, then lualatex); fall back to pdflatex
// with the font dropped rather than failing the export. Without a font, keep the
// historic pdflatex-first default so the common path is unchanged. wkhtmltopdf is
// never auto-selected — only used when pinned.
export function selectPdfEngine(
  available: Record<PdfEngine, boolean>,
  fontRequested: boolean,
  preferred: PdfEnginePreference = 'auto',
): PdfEngineDecision {
  if (preferred !== 'auto') {
    return available[preferred]
      ? { engine: preferred, keepFont: fontRequested && FONT_CAPABLE.has(preferred) }
      : { engine: null, keepFont: false };
  }
  const order: PdfEngine[] = fontRequested
    ? ['xelatex', 'lualatex', 'pdflatex']
    : ['pdflatex', 'xelatex', 'lualatex'];
  for (const engine of order) {
    if (available[engine]) {
      return { engine, keepFont: fontRequested && FONT_CAPABLE.has(engine) };
    }
  }
  return { engine: null, keepFont: false };
}

export type PandocFailureKind = 'pandoc-missing' | 'engine-missing' | 'other';

// Pure classification of a failed pandoc invocation's error text. Engine cues are
// checked first: a missing-engine failure still echoes the pandoc command, so only a
// genuine spawn failure (ENOENT on the pandoc binary) means pandoc itself is missing.
export function classifyPandocFailure(message: string): PandocFailureKind {
  const m = message.toLowerCase();
  if (
    m.includes('pdf-engine') ||
    m.includes('pdflatex not found') ||
    m.includes('xelatex not found') ||
    m.includes('lualatex not found') ||
    m.includes('wkhtmltopdf') ||
    m.includes('latex')
  ) {
    return 'engine-missing';
  }
  if (
    m.includes('spawn pandoc') ||
    m.includes('pandoc enoent') ||
    m.includes("'pandoc' is not recognized") ||
    m.includes('enoent')
  ) {
    return 'pandoc-missing';
  }
  return 'other';
}

// Install directories a GUI-launched Obsidian cannot see on macOS: Dock and
// Finder launches get a minimal PATH (path_helper only augments shells), so
// TeX Live/MacTeX, Homebrew, and /usr/local binaries are invisible to
// bare-name lookups even when correctly installed (#344). Probing a
// nonexistent directory just fails that candidate, so the list is not
// platform-gated.
export const WELL_KNOWN_BIN_DIRS: readonly string[] = [
  '/Library/TeX/texbin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
];

const PDF_ENGINE_NAMES: ReadonlySet<string> = new Set(['xelatex', 'lualatex', 'pdflatex', 'wkhtmltopdf']);

const stripWindowsExt = (base: string): string => base.replace(/\.(exe|com)$/i, '');

// Join with the separator style the directory already uses so candidates read
// naturally in error output on every platform. System binary paths, not vault
// paths — normalizePath does not apply.
const joinDir = (dir: string, file: string): string => {
  const trimmed = dir.replace(/[\\/]+$/, '');
  return `${trimmed}${trimmed.includes('\\') ? '\\' : '/'}${file}`;
};

// Pure: the ordered command candidates for locating `name` (#344). Precedence:
// the configured engine location, then the process PATH (the bare name), then
// the well-known install directories. A configured value is treated as a
// directory to search — unless its base name is one of the PDF engines, in
// which case it locates exactly that engine and contributes nothing to the
// others (a binary is never invoked as a guessed engine). A configured
// location that resolves nothing leaves the later candidates intact: it is an
// additional search location, never an exclusive override.
export function binaryCandidates(name: string, configuredLocation: string, isWindows: boolean): string[] {
  const candidates: string[] = [];
  const addDir = (dir: string, withExe: boolean): void => {
    candidates.push(joinDir(dir, name));
    if (withExe) candidates.push(joinDir(dir, `${name}.exe`));
  };
  const configured = configuredLocation.trim();
  if (configured) {
    const base = stripWindowsExt(configured.split(/[\\/]/).pop() ?? '').toLowerCase();
    if (base === name) {
      candidates.push(configured);
    } else if (!PDF_ENGINE_NAMES.has(base)) {
      addDir(configured, isWindows);
    }
  }
  candidates.push(name);
  for (const dir of WELL_KNOWN_BIN_DIRS) {
    addDir(dir, false);
  }
  return candidates;
}

const MANUSCRIPT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 12pt;
    line-height: 2;
    color: #000;
    background: #fff;
  }
  .ws-ms-title-page {
    page-break-after: always;
    min-height: 10in;
    padding: 1in;
    display: flex;
    flex-direction: column;
  }
  .ws-ms-title-info-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 12pt;
    line-height: 1.5;
  }
  .ws-ms-author-info p { margin: 0; line-height: 1.5; }
  .ws-ms-wc { text-align: right; }
  .ws-ms-title-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 0;
    line-height: 2;
  }
  .ws-ms-doc-title { font-weight: bold; letter-spacing: 0.05em; }
  .ws-ms-byline, .ws-ms-author-byline { font-size: 12pt; }
  .ws-ms-body {
    max-width: 6.5in;
    margin: 0 auto;
    padding: 1in;
  }
  .ws-ms-body p {
    text-indent: 0.5in;
    margin: 0;
    line-height: 2;
  }
  .ws-ms-body h1, .ws-ms-body h2 {
    font-family: "Courier New", Courier, monospace;
    font-size: 12pt;
    font-weight: bold;
    text-align: center;
    page-break-before: always;
    padding-top: 2in;
    margin-bottom: 2em;
    line-height: 2;
  }
  .ws-ms-body h3, .ws-ms-body h4, .ws-ms-body h5, .ws-ms-body h6 {
    font-family: "Courier New", Courier, monospace;
    font-size: 12pt;
    font-weight: normal;
    text-align: center;
    line-height: 2;
  }
  .ws-ms-scene {
    text-indent: 0 !important;
    text-align: center;
    line-height: 2;
    margin: 0;
  }
  .ws-ms-body hr { display: none; }
  .ws-ms-body ul, .ws-ms-body ol { padding-left: 1in; line-height: 2; }
  .ws-ms-body blockquote {
    margin-left: 0.5in;
    padding: 0;
    border: none;
    line-height: 2;
  }
  @media print {
    @page { margin: 1in; size: letter; }
    .ws-ms-title-page { page-break-after: always; min-height: auto; }
    .ws-ms-body h1, .ws-ms-body h2 { page-break-before: always; }
  }
`;

// Section separator sentinel — a literal '---' join collided with horizontal
// rules inside user documents, creating phantom section splits. Null bytes
// cannot occur in prose typed in an editor.
const SECTION_BREAK = '\n\n\u0000WS-SECTION-BREAK\u0000\n\n';

export class ExportEngine {
  private plugin: WritingStudioPlugin;
  private app: App;
  private files: VaultFiles;

  constructor(plugin: WritingStudioPlugin, files: VaultFiles) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.files = files;
  }

  // Resolve section sentinels to a markdown hr for text-based outputs
  toMarkdown(compiled: string): string {
    return compiled.split(SECTION_BREAK).join('\n\n---\n\n');
  }

  // ─── Citations ─────────────────────────────────────────────────────────────

  // Every note in the vault with a citekey, the project's Research folder
  // winning collisions. Built per export — the metadata cache is the source.
  private sourceIndex(): SourceIndex {
    return buildSourceIndex(this.app, this.plugin.projectManager.getActiveProject()?.folderPath ?? null);
  }

  private citeLabels(): CiteLabels {
    return { worksCited: t('citations.worksCited'), bibliography: t('citations.bibliography') };
  }

  // The style the built-in formatter applies. A custom CSL file is Pandoc-only,
  // so the built-in paths fall back to author-date (the setting says so).
  private builtInStyle(): CitationStyle {
    const setting = this.plugin.settings.citationStyle ?? 'author-date';
    return setting === 'notes' ? 'notes' : 'author-date';
  }

  // The compile as the built-in paths render it: citations formatted in
  // place and the references section (works cited or bibliography) last.
  // Unresolved keys and citekey collisions are reported once per compile.
  async compileRendered(opts: ExportOptions): Promise<RenderedCompile> {
    const sections = (await this.compileContent(opts)).split(SECTION_BREAK);
    const index = this.sourceIndex();
    const rendered = renderCitations({
      sections, style: this.builtInStyle(), sources: index, labels: this.citeLabels(), headingLevel: 1,
    });
    this.reportCitationProblems(rendered.unresolved, index.collisions);
    return { sections: rendered.sections, references: rendered.references };
  }

  // The rendered compile as one markdown string with section sentinels —
  // what the Markdown export writes and the compile preview shows.
  async compileMarkdown(opts: ExportOptions): Promise<string> {
    const r = await this.compileRendered(opts);
    return (r.references ? [...r.sections, r.references] : r.sections).join(SECTION_BREAK);
  }

  // What the export dialog shows before anyone exports: how many citations
  // point at how many sources, and which keys match nothing.
  async citationSummary(opts: ExportOptions): Promise<CitationReport> {
    const sections = (await this.compileContent(opts)).split(SECTION_BREAK);
    return citationReport(sections, this.sourceIndex());
  }

  private reportCitationProblems(unresolved: string[], collisions: string[]): void {
    if (unresolved.length > 0) {
      new Notice(t('citations.unresolvedNotice', { count: unresolved.length, keys: unresolved.map(k => `@${k}`).join(', ') }));
    }
    if (collisions.length > 0) {
      new Notice(t('citations.collisionNotice', { keys: collisions.join(', ') }));
    }
  }

  // The compile as Pandoc receives it: citations in Pandoc's spelling, the
  // same Obsidian-markdown cleanup the built-in paths get, a references div
  // for citeproc to fill, and the cited sources as CSL-JSON.
  private async compilePandoc(opts: ExportOptions): Promise<{ markdown: string; items: Record<string, unknown>[] }> {
    const sections = (await this.compileContent(opts)).split(SECTION_BREAK);
    const index = this.sourceIndex();
    const prep = preparePandocSections(sections, index, this.builtInStyle(), this.citeLabels(), 1);
    this.reportCitationProblems(prep.unresolved, index.collisions);
    const cleaned = prep.sections.map(s => this.preprocessObsidianMarkdown(s));
    return { markdown: this.toMarkdown(cleaned.join(SECTION_BREAK)), items: prep.items };
  }

  // The first heading of a section, for grouping notes by chapter; a section
  // without one is named by position.
  private sectionTitle(md: string, index: number): string {
    const m = /^#{1,6}\s+(.+)$/m.exec(md);
    return m ? m[1].replace(/[*_`]/g, '').trim() : t('citations.sectionFallback', { n: index + 1 });
  }

  async export(opts: ExportOptions): Promise<string> {
    const project = this.plugin.projectManager.getActiveProject();

    const outputDir = project
      ? normalizePath(`${project.folderPath}/Exports`)
      : normalizePath('Exports');

    await this.files.ensureFolder(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // One title names the export everywhere (#260) — the filename carries it
    // sanitized, the title page and metadata carry it verbatim.
    const baseFile = normalizePath(`${outputDir}/${sanitizeTitleForFilename(this.resolveTitle(opts))}-${timestamp}`);

    if (opts.format === 'epub') {
      return this.exportEpub(opts, baseFile);
    }

    if (opts.format === 'manuscript') {
      return this.exportManuscript(opts, `${baseFile}.html`);
    }

    switch (opts.format) {
      case 'md':
        return this.exportMarkdown(this.toMarkdown(await this.compileMarkdown(opts)), `${baseFile}.md`);
      case 'html':
        return this.exportHtml(await this.compileRendered(opts), `${baseFile}.html`, this.resolveTitle(opts), opts);
      case 'docx':
      case 'rtf':
      case 'pdf': {
        const { markdown, items } = await this.compilePandoc(opts);
        if (opts.format === 'pdf') return this.exportPdf(markdown, `${baseFile}.pdf`, opts, items);
        return this.exportPandoc(markdown, `${baseFile}.${opts.format}`, opts, undefined, items);
      }
      default:
        throw new Error(`Unsupported format: ${opts.format as string}`);
    }
  }

  private async exportEpub(opts: ExportOptions, baseFile: string): Promise<string> {
    const project = this.plugin.projectManager.getActiveProject();
    const outputPath = `${baseFile}.epub`;

    const title = this.resolveTitle(opts);
    const author = project?.author || this.plugin.settings.authorName || '';
    const language = this.plugin.settings.epubLanguage || 'en';
    const date = localDateString();

    const chapters: EpubChapter[] = [];
    const notesOpts = { epub: true, returnLabel: t('citations.returnToText') };
    // A chapter's notes stay with the chapter, numbered from 1, in the
    // markup readers use to show them as popups.
    const chapterHtml = (md: string, id: string): string => {
      const r = renderSectionHtml(this.preprocessObsidianMarkdown(md), id, notesOpts);
      const notes = r.notesHtml ? `\n<section epub:type="footnotes" class="ws-notes">\n${r.notesHtml}\n</section>` : '';
      return this.htmlToXhtml(`${r.bodyHtml}${notes}`);
    };

    if (opts.scope === 'current') {
      const path = opts.currentFile ?? this.activeMarkdownPath();
      if (!path) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      const rendered = await this.compileRendered({ ...opts, addTitlePage: false });
      const content = rendered.sections[0] ?? '';
      const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
      chapters.push({ id: 'chapter-1', title: basename, htmlContent: chapterHtml(content, 'chapter-1') });
      if (rendered.references) {
        chapters.push({ id: 'chapter-2', title: this.sectionTitle(rendered.references, 1), htmlContent: chapterHtml(rendered.references, 'chapter-2') });
      }
    } else if (opts.scope === 'project' && project) {
      // Folder headings have no chapter home in epub — the option is ignored
      // (ruling on #232); chapters are the zone's documents in binder order.
      const plan = this.manuscriptPlan(project.folderPath, opts, false).filter(item => item.kind === 'doc');
      const rendered = await this.compileRendered({ ...opts, addTitlePage: false, includeFolderNamesAsHeadings: false });
      let idx = 1;
      rendered.sections.forEach((section, i) => {
        const item = plan[i];
        if (!item || item.kind !== 'doc') return;
        let content = section;
        if (opts.includeTitlesAsHeadings) {
          content = content.replace(/^# [^\n]*\n+/, '').trim();
        }
        const id = `chapter-${idx++}`;
        chapters.push({ id, title: item.title, htmlContent: chapterHtml(content, id) });
      });
      if (rendered.references) {
        const id = `chapter-${idx++}`;
        chapters.push({ id, title: this.sectionTitle(rendered.references, idx), htmlContent: chapterHtml(rendered.references, id) });
      }
    }

    if (chapters.length === 0) {
      // 'selected' scope, or 'project' with no active project, previously
      // fell through and built a valid EPUB containing only a cover
      throw new Error(t('exportEngine.noActiveDocument'));
    }

    await new EpubEngine(this.files).build({
      title,
      author,
      language,
      date,
      coverImagePath: opts.coverImagePath,
      chapters,
    }, outputPath);

    new Notice(t('exportEngine.epubExported', { path: outputPath }));
    return outputPath;
  }

  private preprocessObsidianMarkdown(md: string): string {
    return md
      .replace(/!\[\[[^\]]+\]\]/g, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/==(.+?)==/g, '$1')
      .replace(/^> \[!.*?\].*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private htmlToXhtml(html: string): string {
    return html
      .replace(/<hr>/g, '<hr/>')
      .replace(/<br>/g, '<br/>')
      .replace(/<img([^>]*)(?<!\/)>/g, '<img$1/>');
  }

  // The export's single title authority (#260): the dialog resolves the user's
  // dropdown choice into opts.exportTitle; filename, title page, and metadata
  // all read this one value. Engine-level callers that pass no title get the
  // dialog's default — folder display name for a folder export, else the
  // project title.
  private resolveTitle(opts: ExportOptions): string {
    const explicit = opts.exportTitle?.trim();
    if (explicit) return explicit;
    if (opts.subtreeRoot) {
      return parseFolderPrefix(opts.subtreeRoot.split('/').pop() ?? '').displayName;
    }
    return this.plugin.projectManager.getActiveProject()?.title || 'Untitled';
  }

  // Path of the most recently active markdown document, or null when none is.
  private activeMarkdownPath(): string | null {
    const leaf = this.app.workspace.getMostRecentLeaf();
    const view = leaf?.view;
    const file = view instanceof MarkdownView ? view.file : null;
    return file instanceof TFile ? file.path : null;
  }

  async compileContent(opts: ExportOptions): Promise<string> {
    const parts: string[] = [];
    const project = this.plugin.projectManager.getActiveProject();

    if (opts.addTitlePage && project) {
      const today = new Date().toLocaleDateString();
      const byline = t('exportEngine.byAuthor', { author: project.author || this.plugin.settings.authorName });
      // The one resolved title opens the page (#260) — a "Project — folder"
      // dropdown choice arrives here already composed.
      parts.push(`# ${this.resolveTitle(opts)}\n\n${byline}\n\n${today}`);
    }

    if (opts.scope === 'current') {
      const path = opts.currentFile ?? this.activeMarkdownPath();
      if (!path) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      const content = await this.processPath(path, opts);
      if (content === null) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      parts.push(content);
    } else if (opts.scope === 'project' && project) {
      for (const item of this.manuscriptPlan(project.folderPath, opts, opts.includeFolderNamesAsHeadings === true)) {
        if (item.kind === 'heading') {
          parts.push(`${'#'.repeat(item.level)} ${item.title}`);
          continue;
        }
        const content = await this.processPath(item.path, opts);
        if (content === null) continue;
        if (item.headingLevel !== null) {
          // The title heading replaces any leading in-document h1 — keeping
          // it would print the title twice in the compiled output
          const body = content.replace(/^# [^\n]*\n+/, '').trim();
          parts.push(`${'#'.repeat(item.headingLevel)} ${item.title}\n\n${body}`);
        } else {
          parts.push(content);
        }
      }
    } else if (opts.scope === 'selected' && opts.selectedFiles) {
      for (const filePath of opts.selectedFiles) {
        const content = await this.processPath(filePath, opts);
        if (content === null) continue;
        if (opts.includeTitlesAsHeadings) {
          const basename = filePath.split('/').pop()?.replace(/\.md$/, '') ?? filePath;
          const body = content.replace(/^# [^\n]*\n+/, '').trim();
          parts.push(`# ${basename}\n\n${body}`);
        } else {
          parts.push(content);
        }
      }
    }

    // Join all sections with a single clean page-break separator.
    // Using join (not repeated push+join) avoids a trailing separator on the
    // last document and eliminates the double blank lines that came from
    // pushing '\n\n---\n\n' as a separate array element then joining with '\n\n'.
    return parts.join(SECTION_BREAK);
  }

  // The manuscript zone is the compile source (#232/#233) — the dormant
  // _binder.json is never read. Depth is rebased to the compile root, so a
  // subtree export is the whole-zone walk with a different root (which is
  // also why reserved-folder filtering only applies when the root is the
  // project folder itself).
  private manuscriptPlan(
    projectFolderPath: string,
    opts: ExportOptions,
    includeFolderNames: boolean,
  ): CompilePlanItem[] {
    const root = opts.subtreeRoot ?? projectFolderPath;
    const tree = buildManuscriptTree(this.app, root, { excludeReservedAtRoot: !opts.subtreeRoot });
    return planCompile(tree.nodes, {
      includeFolderNames,
      includeTitlesAsHeadings: opts.includeTitlesAsHeadings,
    });
  }

  // Resolves to null when the file does not exist.
  private async processPath(path: string, opts: ExportOptions): Promise<string | null> {
    let content = await this.files.readText(path);
    if (content === null) return null;
    if (!opts.includeFrontmatter) {
      content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    }
    return content.trim();
  }

  private async exportManuscript(opts: ExportOptions, outputPath: string): Promise<string> {
    const project = this.plugin.projectManager.getActiveProject();
    const author = project?.author || this.plugin.settings.authorName || 'Author';
    const title  = this.resolveTitle(opts);

    // Compile without auto title page — we build a proper manuscript title page instead
    const rendered = await this.compileRendered({ ...opts, addTitlePage: false });
    const sections = rendered.sections;
    const notesLabel = t('citations.returnToText');

    const htmlSections: string[] = [];
    const notesBySection: { title: string; html: string }[] = [];
    const convert = (section: string, scope: string): SectionHtml => {
      let md = section.trim();

      // Convert standalone scene break markers to a unique placeholder before HTML conversion
      md = md
        .replace(/^\*\s*\*\s*\*\s*$/gm, '\n__SCENE_BREAK__\n')
        .replace(/^#{1,3}\s*$/gm,        '\n__SCENE_BREAK__\n');

      md = this.preprocessObsidianMarkdown(md);

      const r = renderSectionHtml(md, scope, { returnLabel: notesLabel });

      // Restore scene breaks and uppercase chapter headings
      let html = r.bodyHtml.replace(/<p>__SCENE_BREAK__<\/p>/g, '<p class="ws-ms-scene">#</p>');
      html = html.replace(/<h([12])>(.*?)<\/h\1>/g, (_m, lvl, text) =>
        `<h${lvl}>${(text as string).toUpperCase()}</h${lvl}>`
      );
      return { ...r, bodyHtml: html };
    };

    sections.forEach((section, i) => {
      const r = convert(section, `s${i + 1}`);
      htmlSections.push(r.bodyHtml);
      if (r.notesHtml) notesBySection.push({ title: this.sectionTitle(section, i), html: r.notesHtml });
    });

    // Back matter: the notes (grouped by chapter when more than one has
    // any), then the works-cited list or bibliography.
    if (notesBySection.length > 0) {
      const groups = notesBySection.map(g =>
        `${notesBySection.length > 1 ? `<h3>${this.escapeHtml(g.title)}</h3>\n` : ''}${g.html}`);
      htmlSections.push(`<section class="ws-notes">\n<h1>${this.escapeHtml(t('citations.notes')).toUpperCase()}</h1>\n${groups.join('\n')}\n</section>`);
    }
    if (rendered.references) {
      htmlSections.push(`<section class="ws-references">\n${convert(rendered.references, 'refs').bodyHtml}\n</section>`);
    }

    const bodyHtml = htmlSections.join('\n');

    const wordCount = this.plugin.fmManager.countWords(sections.join('\n\n'));
    const roundedWc = Math.round(wordCount / 100) * 100;
    const contactLines = (opts.authorContact || '').trim();
    const contactHtml = contactLines
      ? contactLines.split('\n').map(l => `<p>${this.escapeHtml(l)}</p>`).join('')
      : '';

    const titlePageHtml = `<div class="ws-ms-title-page">
  <div class="ws-ms-title-info-row">
    <div class="ws-ms-author-info">
      <p>${this.escapeHtml(author)}</p>
      ${contactHtml}
    </div>
    <div class="ws-ms-wc">${t('exportEngine.approxWords', { n: roundedWc.toLocaleString() })}</div>
  </div>
  <div class="ws-ms-title-center">
    <p class="ws-ms-doc-title">${this.escapeHtml(title).toUpperCase()}</p>
    <p class="ws-ms-byline">${t('exportEngine.byline')}</p>
    <p class="ws-ms-author-byline">${this.escapeHtml(author)}</p>
  </div>
</div>`;

    const fullHtml = `<!DOCTYPE html>
<html lang="${getLanguage()}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>${MANUSCRIPT_CSS}</style>
</head>
<body>
${titlePageHtml}
<div class="ws-ms-body">
${bodyHtml}
</div>
</body>
</html>`;

    await this.files.writeText(outputPath, fullHtml);
    new Notice(t('exportEngine.manuscriptExported', { path: outputPath }));
    return outputPath;
  }

  private async exportMarkdown(content: string, outputPath: string): Promise<string> {
    await this.files.writeText(outputPath, content);
    new Notice(t('exportEngine.exportedTo', { path: outputPath }));
    return outputPath;
  }

  private async exportHtml(rendered: RenderedCompile, outputPath: string, title: string, opts: ExportOptions): Promise<string> {
    const font = opts.font || 'Georgia';
    const fontSize = opts.fontSize || 16;
    const returnLabel = t('citations.returnToText');
    const bodies: string[] = [];
    const notesBySection: { title: string; html: string }[] = [];
    rendered.sections.forEach((section, i) => {
      const r = renderSectionHtml(this.preprocessObsidianMarkdown(section), `s${i + 1}`, { returnLabel });
      bodies.push(r.bodyHtml);
      if (r.notesHtml) notesBySection.push({ title: this.sectionTitle(section, i), html: r.notesHtml });
    });
    if (notesBySection.length > 0) {
      const groups = notesBySection.map(g =>
        `${notesBySection.length > 1 ? `<h2>${this.escapeHtml(g.title)}</h2>\n` : ''}${g.html}`);
      bodies.push(`<section class="ws-notes">\n<h1>${this.escapeHtml(t('citations.notes'))}</h1>\n${groups.join('\n')}\n</section>`);
    }
    if (rendered.references) {
      bodies.push(`<section class="ws-references">\n${markdownToHtml(rendered.references)}\n</section>`);
    }
    const html = `<!DOCTYPE html>
<html lang="${getLanguage()}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    body { font-family: "${font}", Georgia, serif; font-size: ${fontSize}px; max-width: 720px; margin: 0 auto; padding: 2rem; line-height: 1.7; }
    h1, h2, h3, h4, h5, h6 { margin-top: 2em; }
    hr { margin: 3em 0; border: none; border-top: 1px solid #ccc; }
    p { margin: 0 0 1em; }
    ul, ol { margin: 0 0 1em; padding-left: 2em; }
    li { margin: 0.25em 0; }
    blockquote { margin: 1.5em 0; padding: 0.5em 1.25em; border-left: 3px solid #ccc; color: #555; }
    blockquote p { margin: 0; }
    pre { background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; margin: 0 0 1em; }
    pre code { font-family: "Courier New", monospace; font-size: 0.875em; }
    sup.ws-fn-ref { font-size: 0.75em; line-height: 0; }
    sup.ws-fn-ref a { text-decoration: none; }
    .ws-notes { margin-top: 3em; font-size: 0.9em; }
    .ws-notes ol { padding-left: 1.5em; }
    .ws-fn-back { text-decoration: none; margin-left: 0.25em; }
    .ws-references p { padding-left: 2em; text-indent: -2em; }
  </style>
</head>
<body>
${bodies.join('\n<hr>\n')}
</body>
</html>`;
    await this.files.writeText(outputPath, html);
    new Notice(t('exportEngine.exportedHtmlTo', { path: outputPath }));
    return outputPath;
  }

  // Resolve the pandoc command. A customized pandoc path is used exactly as
  // configured — never substituted; the default searches the process PATH and
  // then the well-known install directories a GUI-launched Obsidian may not
  // inherit (#344). Null when nothing responds.
  private async resolvePandoc(): Promise<string | null> {
    const configured = (this.plugin.settings.pandocPath || '').trim();
    if (configured && configured !== 'pandoc') {
      return await this.firstUsable([configured]);
    }
    return await this.firstUsable(binaryCandidates('pandoc', '', process.platform === 'win32'));
  }

  // Pre-flight for the export modal — false when no usable pandoc binary was
  // found. Never throws; never blocks the UI.
  async isPandocAvailable(): Promise<boolean> {
    return (await this.resolvePandoc()) !== null;
  }

  // First candidate that answers --version, or null. The command returned is
  // the exact string later invocations must use — detection passing while the
  // invocation resolves to a different binary would be a defect (#344).
  private async firstUsable(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ['--version']);
        return candidate;
      } catch {
        // not here — try the next location
      }
    }
    return null;
  }

  // Locate which PDF engines pandoc could use, each resolved to the command
  // that actually responded: the bare name via PATH, or a path from the engine
  // location setting / well-known install directories (#344). Mirrors
  // resolvePandoc: a missing engine is just null, never a throw.
  private async locatePdfEngines(): Promise<Record<PdfEngine, string | null>> {
    const configured = this.plugin.settings.pdfEnginePath ?? '';
    const isWindows = process.platform === 'win32';
    const locate = (bin: PdfEngine): Promise<string | null> =>
      this.firstUsable(binaryCandidates(bin, configured, isWindows));
    const [xelatex, lualatex, pdflatex, wkhtmltopdf] = await Promise.all([
      locate('xelatex'), locate('lualatex'), locate('pdflatex'), locate('wkhtmltopdf'),
    ]);
    return { xelatex, lualatex, pdflatex, wkhtmltopdf };
  }

  // The --csl argument for the citation style setting: nothing for
  // author-date (Pandoc's own default is Chicago author-date), the compact
  // bundled style for notes, the writer's file for custom. A custom path may
  // be inside the vault or anywhere on disk.
  private async cslArgument(tempBase: string, temps: string[]): Promise<string | null> {
    const setting = this.plugin.settings.citationStyle ?? 'author-date';
    if (setting === 'notes') {
      const path = `${tempBase}.tmp.csl`;
      await this.files.writeText(path, CHICAGO_NOTES_CSL);
      temps.push(path);
      return `--csl=${this.files.absolutePath(path)}`;
    }
    if (setting === 'custom') {
      const configured = (this.plugin.settings.cslPath ?? '').trim();
      if (!configured) return null;
      const vaultPath = normalizePath(configured);
      return `--csl=${this.files.exists(vaultPath) ? this.files.absolutePath(vaultPath) : configured}`;
    }
    return null;
  }

  private async exportPandoc(
    content: string,
    outputPath: string,
    opts: ExportOptions,
    pdf?: { engine: PdfEngine; command: string; keepFont: boolean },
    bibliography: Record<string, unknown>[] = [],
  ): Promise<string> {
    // Fall back to the configured/bare name on resolution failure so the
    // invocation still produces the classic classifiable pandoc-missing error.
    const pandocPath = (await this.resolvePandoc()) ?? (this.plugin.settings.pandocPath || 'pandoc');
    const tempBase = outputPath.replace(/\.[^.]+$/, '');
    const tempMdPath = `${tempBase}.tmp.md`;
    const temps = [tempMdPath];

    try {
      await this.files.writeText(tempMdPath, content);

      const absOutput = this.files.absolutePath(outputPath);
      const absInput = this.files.absolutePath(tempMdPath);

      const args = [absInput, '--from', 'markdown', '-o', absOutput];

      // Citations: hand citeproc the cited sources and the style. Nothing is
      // added when the manuscript cites nothing, so plain exports are unchanged.
      if (bibliography.length > 0) {
        const bibPath = `${tempBase}.tmp.json`;
        await this.files.writeText(bibPath, JSON.stringify(bibliography));
        temps.push(bibPath);
        args.push('--citeproc', `--bibliography=${this.files.absolutePath(bibPath)}`);
        const csl = await this.cslArgument(tempBase, temps);
        if (csl) args.push(csl);
      }

      // For PDF the engine is chosen explicitly (selectPdfEngine), since mainfont
      // is only honored by xelatex/lualatex. docx/rtf pass no pdf arg and are
      // unchanged. The command is the exact string the probe validated — an
      // absolute path when the engine was found off the process PATH (#344).
      if (pdf) {
        args.push(`--pdf-engine=${pdf.command}`);
      }

      // Skip mainfont when degrading to pdflatex so the export still succeeds
      // instead of erroring on a font the engine cannot apply.
      const keepFont = !pdf || pdf.keepFont;
      if (opts.font && keepFont) {
        const safeFont = opts.font.replace(/["'`\\$]/g, '');
        args.push('-V', `mainfont=${safeFont}`);
      }

      // execFile: no shell, so a pandoc path with spaces (C:\Program Files\...)
      // works and path/font content cannot be interpreted as shell syntax
      await execFileAsync(pandocPath, args);
      new Notice(t('exportEngine.exportedTo', { path: outputPath }));
      return outputPath;
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      let hint = t('exportEngine.pandocMissingHint');
      if (classifyPandocFailure(raw) === 'engine-missing') {
        // The LaTeX-distribution hint is wrong for wkhtmltopdf — name the engine instead.
        hint = pdf?.engine === 'wkhtmltopdf'
          ? t('exportEngine.pdfPinnedEngineMissing', { engine: pdf.engine })
          : t('exportEngine.pdfEngineMissingHint');
      }
      throw new Error(`Pandoc export failed: ${raw}\n${hint}`);
    } finally {
      // Remove the temp files outright — trashing them accumulated a .tmp.md
      // in .trash/ on every pandoc export
      for (const path of temps) await this.files.remove(path);
    }
  }

  private async exportPdf(content: string, outputPath: string, opts: ExportOptions, bibliography: Record<string, unknown>[] = []): Promise<string> {
    const preferred = this.plugin.settings.pdfEngine ?? 'auto';
    const located = await this.locatePdfEngines();
    const decision = selectPdfEngine({
      xelatex: located.xelatex !== null,
      lualatex: located.lualatex !== null,
      pdflatex: located.pdflatex !== null,
      wkhtmltopdf: located.wkhtmltopdf !== null,
    }, !!opts.font, preferred);

    if (!decision.engine) {
      // A pinned engine fails by name — no silent substitution; auto keeps the
      // historic install-a-LaTeX-distribution message.
      const msg = preferred !== 'auto'
        ? t('exportEngine.pdfPinnedEngineMissing', { engine: preferred })
        : t('exportEngine.pdfEngineRequired');
      new Notice(msg);
      throw new Error(msg);
    }

    // Font requested but the engine cannot apply it: tell the user the font was
    // dropped rather than silently producing a differently styled PDF.
    if (opts.font && !decision.keepFont) {
      new Notice(decision.engine === 'wkhtmltopdf'
        ? t('exportEngine.pdfFontIgnoredWkhtmltopdf')
        : t('exportEngine.pdfFontNeedsXelatex'));
    }

    try {
      // located[engine] is non-null whenever selectPdfEngine picked the engine;
      // the bare name is a type-level fallback only.
      return await this.exportPandoc(content, outputPath, opts, {
        engine: decision.engine,
        command: located[decision.engine] ?? decision.engine,
        keepFont: decision.keepFont,
      }, bibliography);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      let msg = t('exportEngine.pdfRequiresPandoc');
      if (classifyPandocFailure(raw) === 'engine-missing') {
        msg = preferred !== 'auto'
          ? t('exportEngine.pdfPinnedEngineMissing', { engine: preferred })
          : t('exportEngine.pdfEngineRequired');
      }
      new Notice(msg);
      throw e; // preserve the original pandoc error for the Export modal to display
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

}
