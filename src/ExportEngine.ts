import { App, MarkdownView, TFile, normalizePath, Notice } from 'obsidian';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type WritingStudioPlugin from '../main';
import { EpubEngine, EpubChapter } from './EpubEngine';
import { t } from './i18n';
import { localDateString } from './dates';
import { markdownToHtml } from './markdown';

interface FileSystemAdapter {
  getFullPath?(vaultPath: string): string;
}

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

export class ExportEngine {
  private plugin: WritingStudioPlugin;
  private app: App;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  async export(opts: ExportOptions): Promise<string> {
    const project = this.plugin.projectManager.getActiveProject();

    const outputDir = project
      ? normalizePath(`${project.folderPath}/Exports`)
      : normalizePath('Exports');

    await this.ensureFolder(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const projectTitle = project?.title.replace(/[\\/:*?"<>|]/g, '-') || 'export';
    const baseFile = normalizePath(`${outputDir}/${projectTitle}-${timestamp}`);

    if (opts.format === 'epub') {
      return this.exportEpub(opts, baseFile);
    }

    if (opts.format === 'manuscript') {
      return this.exportManuscript(opts, `${baseFile}.html`);
    }

    const compiled = await this.compileContent(opts, project?.folderPath);

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
      let content = await this.app.vault.read(file);
      if (!opts.includeFrontmatter) {
        content = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
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
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) continue;
        let content = await this.app.vault.read(file);
        if (!opts.includeFrontmatter) {
          content = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
        }
        content = this.preprocessObsidianMarkdown(content.trim());
        if (opts.includeTitlesAsHeadings) {
          content = content.replace(/^# [^\n]*\n+/, '').trim();
        }
        const htmlContent = this.htmlToXhtml(markdownToHtml(content));
        chapters.push({ id: `chapter-${idx++}`, title: item.title, htmlContent });
      }
    }

    await new EpubEngine(this.plugin).build({
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

  async compileContent(opts: ExportOptions, _projectFolderPath?: string): Promise<string> {
    const parts: string[] = [];
    const project = this.plugin.projectManager.getActiveProject();

    if (opts.addTitlePage && project) {
      const today = new Date().toLocaleDateString();
      parts.push(`# ${project.title}\n\nBy ${project.author || this.plugin.settings.authorName}\n\n${today}`);
    }

    if (opts.scope === 'current') {
      const leaf = this.app.workspace.getMostRecentLeaf();
      const view = leaf?.view;
      const file = view instanceof MarkdownView ? view.file : null;
      if (!(file instanceof TFile)) {
        throw new Error(t('exportEngine.noActiveDocument'));
      }
      parts.push(await this.processFile(file, opts));
    } else if (opts.scope === 'project' && project) {
      const binder = await this.plugin.projectManager.loadBinder(project);
      const flatItems = this.plugin.projectManager.flattenBinder(binder.items);

      for (const item of flatItems) {
        if (!item.includeInExport) continue;
        if (!item.filePath) continue; // group/part items have no file
        if (!opts.includeResearch && item.filePath.includes('/Research/')) continue;
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) continue;
        const content = await this.processFile(file, opts);
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
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;
        const content = await this.processFile(file, opts);
        if (opts.includeTitlesAsHeadings) {
          const body = content.replace(/^# [^\n]*\n+/, '').trim();
          parts.push(`# ${file.basename}\n\n${body}`);
        } else {
          parts.push(content);
        }
      }
    }

    // Join all sections with a single clean page-break separator.
    // Using join (not repeated push+join) avoids a trailing separator on the
    // last document and eliminates the double blank lines that came from
    // pushing '\n\n---\n\n' as a separate array element then joining with '\n\n'.
    return parts.join('\n\n---\n\n');
  }

  private async processFile(file: TFile, opts: ExportOptions): Promise<string> {
    let content = await this.app.vault.read(file);
    if (!opts.includeFrontmatter) {
      content = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
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
    const sections = compiled.split(/\n\n---\n\n/);

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

    const wordCount = this.plugin.fmManager.countWords(compiled);
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
    <div class="ws-ms-wc">Approx. ${roundedWc.toLocaleString()} words</div>
  </div>
  <div class="ws-ms-title-center">
    <p class="ws-ms-doc-title">${this.escapeHtml(title).toUpperCase()}</p>
    <p class="ws-ms-byline">by</p>
    <p class="ws-ms-author-byline">${this.escapeHtml(author)}</p>
  </div>
</div>`;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
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

    await this.writeFile(outputPath, fullHtml);
    new Notice(t('exportEngine.manuscriptExported', { path: outputPath }));
    return outputPath;
  }

  private async exportMarkdown(content: string, outputPath: string): Promise<string> {
    await this.writeFile(outputPath, content);
    new Notice(t('exportEngine.exportedTo', { path: outputPath }));
    return outputPath;
  }

  private async exportHtml(content: string, outputPath: string, title: string, opts: ExportOptions): Promise<string> {
    const font = opts.font || 'Georgia';
    const fontSize = opts.fontSize || 16;
    const html = `<!DOCTYPE html>
<html lang="en">
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
    await this.writeFile(outputPath, html);
    new Notice(t('exportEngine.exportedHtmlTo', { path: outputPath }));
    return outputPath;
  }

  private async exportPandoc(content: string, outputPath: string, opts: ExportOptions): Promise<string> {
    const pandocPath = this.plugin.settings.pandocPath || 'pandoc';
    const tempMdPath = outputPath.replace(/\.[^.]+$/, '.tmp.md');

    try {
      await this.writeFile(tempMdPath, content);

      const absOutput = this.getAbsPath(outputPath);
      const absInput = this.getAbsPath(tempMdPath);

      // No --pdf-engine flag: pandoc defaults to LaTeX for PDF output, which
      // is what the README tells users to install (TeX Live / MiKTeX)
      const args = [absInput, '--from', 'markdown', '-o', absOutput];

      if (opts.font) {
        const safeFont = opts.font.replace(/["'`\\$]/g, '');
        args.push('-V', `mainfont=${safeFont}`);
      }

      // execFile: no shell, so a pandoc path with spaces (C:\Program Files\...)
      // works and path/font content cannot be interpreted as shell syntax
      await execFileAsync(pandocPath, args);
      new Notice(t('exportEngine.exportedTo', { path: outputPath }));
      return outputPath;
    } catch (e) {
      throw new Error(`Pandoc export failed: ${e instanceof Error ? e.message : String(e)}\nEnsure pandoc is installed.`);
    } finally {
      // Remove the temp file outright via the adapter — trashing it
      // accumulated a .tmp.md in .trash/ on every pandoc export
      if (this.app.vault.getAbstractFileByPath(tempMdPath) instanceof TFile) {
        await this.app.vault.adapter.remove(tempMdPath);
      }
    }
  }

  private async exportPdf(content: string, outputPath: string, opts: ExportOptions): Promise<string> {
    try {
      return await this.exportPandoc(content, outputPath, opts);
    } catch (e) {
      new Notice(t('exportEngine.pdfRequiresPandoc'));
      throw e; // preserve the original pandoc error for the Export modal to display
    }
  }

  private async writeFile(vaultPath: string, content: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(vaultPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(vaultPath, content);
    }
  }

  private getAbsPath(vaultPath: string): string {
    const adapter = this.app.vault.adapter as unknown as FileSystemAdapter;
    return adapter.getFullPath ? adapter.getFullPath(vaultPath) : vaultPath;
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      await this.app.vault.createFolder(path);
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

}
