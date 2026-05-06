import { App, TFile } from 'obsidian';

interface FileSystemAdapter {
  getFullPath?(vaultPath: string): string;
}
import JSZip from 'jszip';
import { promises as fsp } from 'fs';
import type WritingStudioPlugin from '../main';

export interface EpubChapter {
  id: string;
  title: string;
  htmlContent: string;
}

export interface EpubBuildOptions {
  title: string;
  author: string;
  language: string;
  date: string;
  coverImagePath?: string;
  chapters: EpubChapter[];
}

export class EpubEngine {
  private app: App;
  private plugin: WritingStudioPlugin;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  async build(opts: EpubBuildOptions, outputVaultPath: string): Promise<void> {
    const zip = new JSZip();
    const uid = `urn:uuid:${this.uuid()}`;
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    // mimetype MUST be first entry and stored uncompressed per EPUB spec
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // META-INF
    zip.folder('META-INF')!.file('container.xml', this.containerXml());

    const oebps = zip.folder('OEBPS')!;

    // Optional cover image
    let coverImageFile: string | null = null;
    let coverImageMime = 'image/jpeg';
    if (opts.coverImagePath) {
      const vaultFile = this.app.vault.getAbstractFileByPath(opts.coverImagePath);
      if (vaultFile instanceof TFile) {
        const raw = await this.app.vault.readBinary(vaultFile);
        const isPng = opts.coverImagePath.toLowerCase().endsWith('.png');
        coverImageMime = isPng ? 'image/png' : 'image/jpeg';
        coverImageFile = isPng ? 'cover.png' : 'cover.jpg';
        oebps.file(coverImageFile, raw);
      }
    }

    // Cover page (image or generated text cover)
    oebps.file('cover.xhtml', coverImageFile
      ? this.coverImageXhtml(coverImageFile)
      : this.coverTextXhtml(opts.title, opts.author));

    // Stylesheet
    oebps.file('style.css', this.stylesheet());

    // Chapter files
    for (const ch of opts.chapters) {
      oebps.file(`${ch.id}.xhtml`, this.chapterXhtml(ch.title, ch.htmlContent));
    }

    // Navigation documents
    oebps.file('nav.xhtml', this.navXhtml(opts.title, opts.chapters));
    oebps.file('toc.ncx', this.tocNcx(uid, opts.title, opts.author, opts.chapters));
    oebps.file('content.opf', this.contentOpf(uid, opts, modified, coverImageFile, coverImageMime));

    // Generate ZIP as Uint8Array
    const uint8 = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Copy into a clean ArrayBuffer to eliminate any byteOffset from typed array views
    const ab = new ArrayBuffer(uint8.byteLength);
    new Uint8Array(ab).set(uint8);

    const absPath = this.absPath(outputVaultPath);
    await fsp.writeFile(absPath, Buffer.from(ab));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private absPath(vaultPath: string): string {
    const adapter = this.app.vault.adapter as unknown as FileSystemAdapter;
    return adapter.getFullPath ? adapter.getFullPath(vaultPath) : vaultPath;
  }

  private uuid(): string {
    return crypto.randomUUID();
  }

  private x(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── XML / XHTML templates ──────────────────────────────────────────────────

  private containerXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  }

  private contentOpf(
    uid: string,
    opts: EpubBuildOptions,
    modified: string,
    coverFile: string | null,
    coverMime: string,
  ): string {
    const manifestItems: string[] = [
      `<item id="nav"        href="nav.xhtml"  media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="ncx"        href="toc.ncx"    media-type="application/x-dtbncx+xml"/>`,
      `<item id="css"        href="style.css"  media-type="text/css"/>`,
      `<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
    ];
    if (coverFile) {
      manifestItems.push(
        `<item id="cover-image" href="${coverFile}" media-type="${coverMime}" properties="cover-image"/>`,
      );
    }
    for (const ch of opts.chapters) {
      manifestItems.push(`<item id="${ch.id}" href="${ch.id}.xhtml" media-type="application/xhtml+xml"/>`);
    }

    const spineItems = [
      `<itemref idref="cover-page"/>`,
      ...opts.chapters.map(ch => `<itemref idref="${ch.id}"/>`),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"
         unique-identifier="uid" xml:lang="${opts.language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${this.x(opts.title)}</dc:title>
    <dc:creator>${this.x(opts.author)}</dc:creator>
    <dc:language>${opts.language}</dc:language>
    <dc:date>${opts.date}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  }

  private navXhtml(title: string, chapters: EpubChapter[]): string {
    const items = [
      `<li><a href="cover.xhtml">Cover</a></li>`,
      ...chapters.map(ch => `<li><a href="${ch.id}.xhtml">${this.x(ch.title)}</a></li>`),
    ].join('\n      ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${this.x(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${items}
    </ol>
  </nav>
</body>
</html>`;
  }

  private tocNcx(uid: string, title: string, author: string, chapters: EpubChapter[]): string {
    let order = 1;
    const coverPoint = `<navPoint id="cover-page" playOrder="${order++}">
      <navLabel><text>Cover</text></navLabel>
      <content src="cover.xhtml"/>
    </navPoint>`;
    const chapterPoints = chapters.map(ch =>
      `<navPoint id="${ch.id}" playOrder="${order++}">
      <navLabel><text>${this.x(ch.title)}</text></navLabel>
      <content src="${ch.id}.xhtml"/>
    </navPoint>`,
    ).join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${this.x(title)}</text></docTitle>
  <docAuthor><text>${this.x(author)}</text></docAuthor>
  <navMap>
    ${coverPoint}
    ${chapterPoints}
  </navMap>
</ncx>`;
  }

  private chapterXhtml(title: string, body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${this.x(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>`;
  }

  private coverImageXhtml(filename: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Cover</title>
  <style type="text/css">
    body { margin: 0; padding: 0; }
    img  { width: 100%; height: 100vh; object-fit: cover; display: block; }
  </style>
</head>
<body>
  <img src="${filename}" alt="Cover"/>
</body>
</html>`;
  }

  private coverTextXhtml(title: string, author: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Cover</title>
  <style type="text/css">
    body {
      margin: 0;
      padding: 4em 2em;
      min-height: 100vh;
      background: #1a1a2e;
      color: #eaeaea;
      font-family: serif;
      text-align: center;
      box-sizing: border-box;
      display: -webkit-box;
      display: flex;
      -webkit-box-orient: vertical;
      -webkit-box-direction: normal;
              flex-direction: column;
      -webkit-box-align: center;
              align-items: center;
      -webkit-box-pack: center;
              justify-content: center;
    }
    h1 { font-size: 2.4em; margin: 0 0 0.5em; line-height: 1.2; }
    p  { font-size: 1.2em; color: #aaa; margin: 0; }
  </style>
</head>
<body>
  <div>
    <h1>${this.x(title)}</h1>
    <p>${this.x(author)}</p>
  </div>
</body>
</html>`;
  }

  private stylesheet(): string {
    return `body {
  font-family: serif;
  font-size: 1em;
  line-height: 1.65;
  margin: 1em;
}
h1, h2, h3, h4, h5, h6 {
  font-family: sans-serif;
  margin-top: 2em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}
h1 { font-size: 1.8em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.2em; }
p {
  margin: 0 0 0.8em;
}
blockquote {
  margin: 1.2em 1.5em;
  padding: 0 1em;
  border-left: 3px solid #ccc;
  font-style: italic;
  color: #555;
}
blockquote p { margin: 0; }
hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 2em auto;
  width: 40%;
}
ul, ol {
  margin: 0.5em 0 0.8em 2em;
  padding: 0;
}
li { margin: 0.2em 0; }
pre {
  font-family: monospace;
  font-size: 0.85em;
  background: #f5f5f5;
  padding: 1em;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
code { font-family: monospace; font-size: 0.9em; }
strong { font-weight: bold; }
em { font-style: italic; }
`;
  }
}
