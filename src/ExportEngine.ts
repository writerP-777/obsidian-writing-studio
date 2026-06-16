import { App, MarkdownView, TFile, getLanguage, normalizePath, Notice } from 'obsidian';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type WritingStudioPlugin from '../main';
import type { VaultFiles } from './VaultFiles';
import { EpubEngine, EpubChapter } from './EpubEngine';
import { t } from './i18n';
import { localDateString } from './dates';
import { markdownToHtml } from './markdown';

const execFileAsync = promisify(execFile);

export type ExportFormat = 'pdf' | 'docx' | 'rtf' | 'md' | 'html' | 'epub' | 'manuscript';
export type ExportScope = 'current' | 'selected' | 'project';

export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  selectedFiles?: string[];
  includeFrontmatter: boolean;
  includeResearch: boolean;
  includeTitlesAsHeadings: boolean;
  paperSize: 'letter' | 'a4';
  font: string;
  fontSize: number;
  outputPath?: string;
  addTitlePage: boolean;
  coverImagePath?: string;
  authorContact?: string;
}

export type PdfEngine = 'xelatex' | 'lualatex' | 'pdflatex';

export interface PdfEngineDecision {
  // The engine to pass to pandoc, or null when no LaTeX engine is installed.
  engine: PdfEngine | null;
  // Whether the requested mainfont can be honored (only xelatex/lualatex can).
  keepFont: boolean;
}

// Pure decision: given which LaTeX engines are installed and whether the export
// requests a custom font, pick the PDF engine and whether the font survives.
// With a font, prefer fontspec-capable engines (xelatex, then lualatex); fall back
// to pdflatex with the font dropped rather than failing the export. Without a font,
// keep the historic pdflatex-first default so the common path is unchanged, using
// xelatex/lualatex only when pdflatex is absent.
export function selectPdfEngine(
  available: Record<PdfEngine, boolean>,
  fontRequested: boolean,
): PdfEngineDecision {
  const order: PdfEngine[] = fontRequested
    ? ['xelatex', 'lualatex', 'pdflatex']
    : ['pdflatex', 'xelatex', 'lualatex'];
  for (const engine of order) {
    if (available[engine]) {
      return { engine, keepFont: fontRequested && engine !== 'pdflatex' };
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

  async export(opts: ExportOptions): Promise<string> {
    const project = this.plugin.projectManager.getActiveProject();

    const outputDir = project
      ? normalizePath(`${project.folderPath}/Exports`)
      : normalizePath('Exports');

    await this.files.ensureFolder(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const projectTitle = project?.title.replace(/[\\/:*?"<>|]/g, '-') || 'export';
    const baseFile = normalizePath(`${outputDir}/${projectTitle}-${timestamp}`);

    if (opts.format === 'epub') {
      return this.exportEpub(opts, baseFile);
    }

    if (opts.format === 'manuscript') {
      return this.exportManuscript(opts, `${baseFile}.html`);
    }

    const compiled = this.toMarkdown(await this.compileContent(opts));

    switch (opts.format) {
      case 'md':
        return this.exportMarkdown(compiled, `${baseFile}.md`);
      case 'html':
        return this.exportHtml(compiled, `${baseFile}.html`, project?.title || 'Document', opts);
      case 'docx':
        return this.exportPandoc(compiled, `${baseFile}.docx`, opts);
      case 'rtf':
        return this.exportPandoc(compiled, `${baseFile}.rtf`, opts);
      case 'pdf':
        return this.exportPdf(compiled, `${baseFile}.pdf`, opts);
      default:
        throw new Error(`Unsupported format: ${opts.format as string}`);
    }
  }

  private async exportEpub(opts: ExportOptions, baseFile: string): Promise<string> {
    const project = this.plugin.projectManager.getActiveProject();
    const outputPath = `${baseFile}.epub`;

    const title = project?.title || 'Untitled';
    const author = project?.author || this.plugin.settings.authorName || '';
    const language = this.plugin.settings.epubLanguage || 'en';
    const date = localDateString();

    const chapters: EpubChapter[] = [];

    if (opts.scope === 'current') {
      const leaf = this.app.workspace.getMostRecentLeaf();
      const view = leaf?.view;
      const file = view instanceof MarkdownView ? view.file : null;
      if (!(file instanceof TFile)) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      let content = await this.files.readText(file.path);
      if (content === null) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      if (!opts.includeFrontmatter) {
        content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      }
      content = this.preprocessObsidianMarkdown(content.trim());
      const htmlContent = this.htmlToXhtml(markdownToHtml(content));
      chapters.push({ id: 'chapter-1', title: file.basename, htmlContent });
    } else if (opts.scope === 'project' && project) {
      const binder = await this.plugin.projectManager.loadBinder(project);
      const flatItems = this.plugin.projectManager.flattenBinder(binder.items);
      let idx = 1;
      for (const item of flatItems) {
        if (!item.includeInExport) continue;
        if (!item.filePath) continue;
        if (!opts.includeResearch && item.filePath.includes('/Research/')) continue;
        let content = await this.files.readText(item.filePath);
        if (content === null) continue;
        if (!opts.includeFrontmatter) {
          content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
        }
        content = this.preprocessObsidianMarkdown(content.trim());
        if (opts.includeTitlesAsHeadings) {
          content = content.replace(/^# [^\n]*\n+/, '').trim();
        }
        const htmlContent = this.htmlToXhtml(markdownToHtml(content));
        chapters.push({ id: `chapter-${idx++}`, title: item.title, htmlContent });
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

  async compileContent(opts: ExportOptions): Promise<string> {
    const parts: string[] = [];
    const project = this.plugin.projectManager.getActiveProject();

    if (opts.addTitlePage && project) {
      const today = new Date().toLocaleDateString();
      parts.push(`# ${project.title}\n\n${t('exportEngine.byAuthor', { author: project.author || this.plugin.settings.authorName })}\n\n${today}`);
    }

    if (opts.scope === 'current') {
      const leaf = this.app.workspace.getMostRecentLeaf();
      const view = leaf?.view;
      const file = view instanceof MarkdownView ? view.file : null;
      if (!(file instanceof TFile)) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      const content = await this.processPath(file.path, opts);
      if (content === null) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      parts.push(content);
    } else if (opts.scope === 'project' && project) {
      const binder = await this.plugin.projectManager.loadBinder(project);
      const flatItems = this.plugin.projectManager.flattenBinder(binder.items);

      for (const item of flatItems) {
        if (!item.includeInExport) continue;
        if (!item.filePath) continue; // group/part items have no file
        if (!opts.includeResearch && item.filePath.includes('/Research/')) continue;
        const content = await this.processPath(item.filePath, opts);
        if (content === null) continue;
        if (opts.includeTitlesAsHeadings) {
          // Strip any leading h1 from the document body — the canonical heading
          // comes from item.title, so the in-document heading must not be kept
          // or it would appear twice in the compiled output.
          const body = content.replace(/^# [^\n]*\n+/, '').trim();
          parts.push(`# ${item.title}\n\n${body}`);
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
    const title  = project?.title || 'Untitled';

    // Compile without auto title page — we build a proper manuscript title page instead
    const compiled = await this.compileContent({ ...opts, addTitlePage: false });

    // Split on section separators (added by compileContent between documents)
    const sections = compiled.split(SECTION_BREAK);

    const htmlSections: string[] = [];
    for (const section of sections) {
      let md = section.trim();

      // Convert standalone scene break markers to a unique placeholder before HTML conversion
      md = md
        .replace(/^\*\s*\*\s*\*\s*$/gm, '\n__SCENE_BREAK__\n')
        .replace(/^#{1,3}\s*$/gm,        '\n__SCENE_BREAK__\n');

      md = this.preprocessObsidianMarkdown(md);

      let html = markdownToHtml(md);

      // Restore scene breaks and uppercase chapter headings
      html = html.replace(/<p>__SCENE_BREAK__<\/p>/g, '<p class="ws-ms-scene">#</p>');
      html = html.replace(/<h([12])>(.*?)<\/h\1>/g, (_m, lvl, text) =>
        `<h${lvl}>${(text as string).toUpperCase()}</h${lvl}>`
      );

      htmlSections.push(html);
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

  private async exportHtml(content: string, outputPath: string, title: string, opts: ExportOptions): Promise<string> {
    const font = opts.font || 'Georgia';
    const fontSize = opts.fontSize || 16;
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
  </style>
</head>
<body>
${markdownToHtml(content)}
</body>
</html>`;
    await this.files.writeText(outputPath, html);
    new Notice(t('exportEngine.exportedHtmlTo', { path: outputPath }));
    return outputPath;
  }

  // Pre-flight for the export modal — false when the configured pandoc
  // binary cannot be executed. Never throws; never blocks the UI.
  async isPandocAvailable(): Promise<boolean> {
    const pandocPath = this.plugin.settings.pandocPath || 'pandoc';
    try {
      await execFileAsync(pandocPath, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  // Probe which LaTeX engines pandoc could use for PDF output. Mirrors
  // isPandocAvailable: each probe never throws, so a missing engine is just false.
  private async detectPdfEngines(): Promise<Record<PdfEngine, boolean>> {
    const probe = async (bin: PdfEngine): Promise<boolean> => {
      try {
        await execFileAsync(bin, ['--version']);
        return true;
      } catch {
        return false;
      }
    };
    const [xelatex, lualatex, pdflatex] = await Promise.all([
      probe('xelatex'), probe('lualatex'), probe('pdflatex'),
    ]);
    return { xelatex, lualatex, pdflatex };
  }

  private async exportPandoc(content: string, outputPath: string, opts: ExportOptions, pdf?: { engine: PdfEngine; keepFont: boolean }): Promise<string> {
    const pandocPath = this.plugin.settings.pandocPath || 'pandoc';
    const tempMdPath = outputPath.replace(/\.[^.]+$/, '.tmp.md');

    try {
      await this.files.writeText(tempMdPath, content);

      const absOutput = this.files.absolutePath(outputPath);
      const absInput = this.files.absolutePath(tempMdPath);

      const args = [absInput, '--from', 'markdown', '-o', absOutput];

      // For PDF the engine is chosen explicitly (selectPdfEngine), since mainfont
      // is only honored by xelatex/lualatex. docx/rtf pass no pdf arg and are unchanged.
      if (pdf) {
        args.push(`--pdf-engine=${pdf.engine}`);
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
      const hint = classifyPandocFailure(raw) === 'engine-missing'
        ? t('exportEngine.pdfEngineMissingHint')
        : t('exportEngine.pandocMissingHint');
      throw new Error(`Pandoc export failed: ${raw}\n${hint}`);
    } finally {
      // Remove the temp file outright — trashing it accumulated a .tmp.md
      // in .trash/ on every pandoc export
      await this.files.remove(tempMdPath);
    }
  }

  private async exportPdf(content: string, outputPath: string, opts: ExportOptions): Promise<string> {
    const decision = selectPdfEngine(await this.detectPdfEngines(), !!opts.font);

    if (!decision.engine) {
      const msg = t('exportEngine.pdfEngineRequired');
      new Notice(msg);
      throw new Error(msg);
    }

    // Font requested but only pdflatex is available: tell the user the font was
    // dropped rather than silently producing an unstyled PDF.
    if (opts.font && !decision.keepFont) {
      new Notice(t('exportEngine.pdfFontNeedsXelatex'));
    }

    try {
      return await this.exportPandoc(content, outputPath, opts, { engine: decision.engine, keepFont: decision.keepFont });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      new Notice(classifyPandocFailure(raw) === 'engine-missing'
        ? t('exportEngine.pdfEngineRequired')
        : t('exportEngine.pdfRequiresPandoc'));
      throw e; // preserve the original pandoc error for the Export modal to display
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

}
