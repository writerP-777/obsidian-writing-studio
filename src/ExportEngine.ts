import { App, MarkdownView, TFile, normalizePath, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import type WritingStudioPlugin from '../main';
import { EpubEngine, EpubChapter } from './EpubEngine';

interface FileSystemAdapter {
  getFullPath?(vaultPath: string): string;
}

const execAsync = promisify(exec);

export type ExportFormat = 'pdf' | 'docx' | 'rtf' | 'md' | 'html' | 'epub';
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
}

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
    const date = new Date().toISOString().split('T')[0];

    const chapters: EpubChapter[] = [];

    if (opts.scope === 'current') {
      const leaf = this.app.workspace.getMostRecentLeaf();
      const view = leaf?.view;
      const file = view instanceof MarkdownView ? view.file : null;
      if (file instanceof TFile) {
        let content = await this.app.vault.read(file);
        if (!opts.includeFrontmatter) {
          content = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
        }
        content = this.preprocessObsidianMarkdown(content.trim());
        const htmlContent = this.htmlToXhtml(this.markdownToHtml(content));
        chapters.push({ id: 'chapter-1', title: file.basename, htmlContent });
      }
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
        const htmlContent = this.htmlToXhtml(this.markdownToHtml(content));
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

    new Notice(`EPUB exported to ${outputPath}`);
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

  async compileContent(opts: ExportOptions, projectFolderPath?: string): Promise<string> {
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
      if (file instanceof TFile) {
        parts.push(await this.processFile(file, opts));
      }
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

  private async exportMarkdown(content: string, outputPath: string): Promise<string> {
    await this.writeFile(outputPath, content);
    new Notice(`Exported to ${outputPath}`);
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
${this.markdownToHtml(content)}
</body>
</html>`;
    await this.writeFile(outputPath, html);
    new Notice(`Exported HTML to ${outputPath}`);
    return outputPath;
  }

  private async exportPandoc(content: string, outputPath: string, opts: ExportOptions): Promise<string> {
    const pandocPath = this.plugin.settings.pandocPath || 'pandoc';
    const tempMdPath = outputPath.replace(/\.[^.]+$/, '.tmp.md');

    try {
      await this.writeFile(tempMdPath, content);

      const absOutput = await this.getAbsPath(outputPath);
      const absInput = await this.getAbsPath(tempMdPath);

      const isPdf = outputPath.endsWith('.pdf');

      const args = [
        `"${absInput}"`,
        `--from markdown`,
        `-o "${absOutput}"`,
      ];

      // --pdf-engine is only valid for PDF output; passing it for DOCX/RTF
      // causes a fatal error in pandoc 3.x and must be omitted.
      if (isPdf) {
        args.push('--pdf-engine=wkhtmltopdf');
      }

      if (opts.font) {
        const safeFont = opts.font.replace(/["'`\\$]/g, '');
        args.push(`-V mainfont="${safeFont}"`);
      }

      await execAsync(`${pandocPath} ${args.join(' ')}`);
      new Notice(`Exported to ${outputPath}`);
      return outputPath;
    } catch (e) {
      throw new Error(`Pandoc export failed: ${e instanceof Error ? e.message : String(e)}\nEnsure pandoc is installed.`);
    } finally {
      const tmpFile = this.app.vault.getAbstractFileByPath(tempMdPath);
      if (tmpFile instanceof TFile) await this.app.fileManager.trashFile(tmpFile);
    }
  }

  private async exportPdf(content: string, outputPath: string, opts: ExportOptions): Promise<string> {
    try {
      return await this.exportPandoc(content, outputPath, opts);
    } catch (e) {
      new Notice('PDF export requires pandoc. Install pandoc and set path in Settings.');
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

  private async getAbsPath(vaultPath: string): Promise<string> {
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

  // Converts inline markdown spans (bold, italic, links) within a text node.
  private inlineMarkdown(text: string): string {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  // Block-level markdown → HTML converter. Handles headings, paragraphs,
  // unordered lists, ordered lists, blockquotes, fenced code blocks, and hrs.
  private markdownToHtml(md: string): string {
    const blocks: string[] = [];
    const paragraphLines: string[] = [];
    const listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    const blockquoteLines: string[] = [];
    let inCodeFence = false;
    const codeLines: string[] = [];
    let codeLang = '';

    const flushParagraph = () => {
      const text = paragraphLines.join(' ').trim();
      if (text) blocks.push(`<p>${text}</p>`);
      paragraphLines.length = 0;
    };

    const flushList = () => {
      if (!listType) return;
      const tag = listType;
      blocks.push(`<${tag}>\n${listItems.map(i => `  <li>${i}</li>`).join('\n')}\n</${tag}>`);
      listItems.length = 0;
      listType = null;
    };

    const flushBlockquote = () => {
      if (blockquoteLines.length === 0) return;
      const inner = blockquoteLines.join(' ').trim();
      blocks.push(`<blockquote><p>${inner}</p></blockquote>`);
      blockquoteLines.length = 0;
    };

    for (const line of md.split('\n')) {
      // Fenced code block open / close
      if (/^```/.test(line)) {
        if (!inCodeFence) {
          flushParagraph(); flushList(); flushBlockquote();
          inCodeFence = true;
          codeLang = line.slice(3).trim();
        } else {
          const escaped = codeLines.join('\n')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
          blocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
          codeLines.length = 0;
          codeLang = '';
          inCodeFence = false;
        }
        continue;
      }
      if (inCodeFence) { codeLines.push(line); continue; }

      // Horizontal rule
      if (/^---+$/.test(line)) {
        flushParagraph(); flushList(); flushBlockquote();
        blocks.push('<hr>');
        continue;
      }

      // ATX headings
      const hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) {
        flushParagraph(); flushList(); flushBlockquote();
        const lvl = hm[1].length;
        blocks.push(`<h${lvl}>${this.inlineMarkdown(hm[2])}</h${lvl}>`);
        continue;
      }

      // Unordered list item (-, *, +)
      const ulm = line.match(/^[-*+]\s+(.+)$/);
      if (ulm) {
        flushParagraph(); flushBlockquote();
        if (listType === 'ol') flushList();
        listType = 'ul';
        listItems.push(this.inlineMarkdown(ulm[1]));
        continue;
      }

      // Ordered list item (1. 2. etc.)
      const olm = line.match(/^\d+\.\s+(.+)$/);
      if (olm) {
        flushParagraph(); flushBlockquote();
        if (listType === 'ul') flushList();
        listType = 'ol';
        listItems.push(this.inlineMarkdown(olm[1]));
        continue;
      }

      // Blockquote
      const bqm = line.match(/^>\s?(.*)$/);
      if (bqm) {
        flushParagraph(); flushList();
        blockquoteLines.push(this.inlineMarkdown(bqm[1]));
        continue;
      }

      // Blank line — close any open block
      if (line.trim() === '') {
        flushParagraph(); flushList(); flushBlockquote();
        continue;
      }

      // Regular paragraph line — close any open list/blockquote first
      flushList(); flushBlockquote();
      paragraphLines.push(this.inlineMarkdown(line));
    }

    flushParagraph(); flushList(); flushBlockquote();
    return blocks.join('\n');
  }
}
