import { TFile, TFolder } from 'obsidian';
import { ExportEngine, ExportOptions, selectPdfEngine, classifyPandocFailure, PdfEngine } from '../src/ExportEngine';
import { ProjectManager } from '../src/ProjectManager';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

// Integration through the vault seam: a real ProjectManager and ExportEngine
// run against the in-memory adapter, no Obsidian App required.
async function makeWorld() {
  const files = new InMemoryVaultFiles();
  const plugin = {
    app: {},
    settings: { defaultProjectFolder: 'Projects', authorName: 'Avery' },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as { projectManager?: ProjectManager };
  const pm = new ProjectManager(plugin as never, files);
  plugin.projectManager = pm;
  const engine = new ExportEngine(plugin as never, files);

  await pm.saveProject({
    id: 'project-1',
    title: 'My Book',
    type: 'book',
    author: 'Avery',
    created: '2026-06-12',
    modified: '2026-06-12',
    description: '',
    folderPath: 'Projects/My Book',
    goals: {},
  });
  await pm.setActiveProject('project-1');

  files.files.set('Projects/My Book/Chapters/One.md',
    '---\ntitle: "One"\nword-count: 9\n---\n# One\n\nFirst chapter body.');
  files.files.set('Projects/My Book/Chapters/Two.md',
    '---\ntitle: "Two"\n---\nSecond chapter body.');
  files.files.set('Projects/My Book/Research/Notes.md', 'Research notes body.');

  await pm.saveBinder({
    version: '2.0',
    projectId: 'project-1',
    items: [
      { id: 'i1', title: 'Chapter One', filePath: 'Projects/My Book/Chapters/One.md', type: 'chapter', order: 1, status: 'draft', includeInExport: true },
      { id: 'i2', title: 'Chapter Two', filePath: 'Projects/My Book/Chapters/Two.md', type: 'chapter', order: 2, status: 'draft', includeInExport: false },
      { id: 'i3', title: 'Notes', filePath: 'Projects/My Book/Research/Notes.md', type: 'note', order: 3, status: 'draft', includeInExport: true },
      { id: 'i4', title: 'Ghost', filePath: 'Projects/My Book/Chapters/Missing.md', type: 'chapter', order: 4, status: 'draft', includeInExport: true },
    ],
  });

  return { files, pm, engine };
}

// A world where the experimental binder owns compile (#232): the manuscript
// zone lives in a mock vault folder tree + metadata cache, document contents
// in the in-memory adapter, and settings.filesystemBinder is on.
async function makeFsWorld(flat = false) {
  const files = new InMemoryVaultFiles();
  const byPath = new Map<string, TFile | TFolder>();
  const fmByPath = new Map<string, Record<string, unknown>>();

  const root = new TFolder('Projects/My Book');
  byPath.set(root.path, root);
  const addFolder = (parent: TFolder, name: string): TFolder => {
    const f = new TFolder(`${parent.path}/${name}`);
    parent.children.push(f);
    byPath.set(f.path, f);
    return f;
  };
  const addDoc = (parent: TFolder, name: string, body: string, fm?: Record<string, unknown>): TFile => {
    const f = new TFile(`${parent.path}/${name}`, 'md');
    parent.children.push(f);
    byPath.set(f.path, f);
    if (fm) fmByPath.set(f.path, fm);
    files.files.set(f.path, body);
    return f;
  };

  const plugin = {
    app: {
      vault: { getAbstractFileByPath: (p: string) => byPath.get(p) ?? null },
      metadataCache: {
        getFileCache: (f: TFile) => {
          const fm = fmByPath.get(f.path);
          return fm ? { frontmatter: fm } : null;
        },
      },
    },
    settings: { defaultProjectFolder: 'Projects', authorName: 'Avery', filesystemBinder: true },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as { projectManager?: ProjectManager; settings: { filesystemBinder: boolean } };
  const pm = new ProjectManager(plugin as never, files);
  plugin.projectManager = pm;
  const engine = new ExportEngine(plugin as never, files);

  await pm.saveProject({
    id: 'project-1',
    title: 'My Book',
    type: 'book',
    author: 'Avery',
    created: '2026-07-05',
    modified: '2026-07-05',
    description: '',
    folderPath: 'Projects/My Book',
    goals: {},
  });
  await pm.setActiveProject('project-1');

  if (flat) {
    addDoc(root, 'One.md', 'First body.');
    addDoc(root, 'Two.md', 'Second body.');
    // A classic binder over the same documents (titles = basenames, same
    // order) so the toggle-off run has a source to read
    await pm.saveBinder({
      version: '2.0',
      projectId: 'project-1',
      items: [
        { id: 'i1', title: 'One', filePath: 'Projects/My Book/One.md', type: 'chapter', order: 1, status: 'draft', includeInExport: true },
        { id: 'i2', title: 'Two', filePath: 'Projects/My Book/Two.md', type: 'chapter', order: 2, status: 'draft', includeInExport: true },
      ],
    });
  } else {
    addDoc(root, 'Opening.md', 'Opening body.', { 'binder-order': 15 });
    addDoc(root, 'Zeta.md', 'Zeta body.'); // unordered → after ordered siblings
    const part = addFolder(root, '020~ Part One');
    addDoc(part, 'Chapter 1.md', 'Chapter body.', { 'binder-order': 10 });
    addDoc(part, 'Cut.md', 'Cut body.', { 'binder-compile': false });
    const act = addFolder(part, 'Act 2');
    addDoc(act, 'Scene.md', 'Scene body.');
    const research = addFolder(root, 'Research');
    addDoc(research, 'Notes.md', 'Research notes body.');
  }

  return { files, pm, engine, plugin };
}

function projectOpts(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: 'md',
    scope: 'project',
    includeFrontmatter: false,
    includeResearch: false,
    includeTitlesAsHeadings: true,
    paperSize: 'letter',
    font: '',
    fontSize: 12,
    addTitlePage: false,
    ...overrides,
  };
}

describe('ExportEngine.compileContent through the vault seam', () => {
  it('compiles included items with binder titles as canonical headings', async () => {
    const { engine } = await makeWorld();

    const compiled = engine.toMarkdown(await engine.compileContent(projectOpts()));

    expect(compiled).toContain('# Chapter One');
    expect(compiled).toContain('First chapter body.');
    // The in-document h1 is replaced by the binder title, not duplicated
    expect(compiled.match(/^# /gm)).toHaveLength(1);
  });

  it('strips frontmatter when includeFrontmatter is false', async () => {
    const { engine } = await makeWorld();

    const compiled = await engine.compileContent(projectOpts());

    expect(compiled).not.toContain('word-count');
    expect(compiled).not.toContain('---\ntitle');
  });

  it('excludes items marked not for export', async () => {
    const { engine } = await makeWorld();

    const compiled = await engine.compileContent(projectOpts());

    expect(compiled).not.toContain('Second chapter body.');
  });

  it('excludes research unless includeResearch is set', async () => {
    const { engine } = await makeWorld();

    const without = await engine.compileContent(projectOpts());
    const withResearch = await engine.compileContent(projectOpts({ includeResearch: true }));

    expect(without).not.toContain('Research notes body.');
    expect(withResearch).toContain('Research notes body.');
  });

  it('skips binder items whose file is missing', async () => {
    const { engine } = await makeWorld();

    const compiled = await engine.compileContent(projectOpts());

    expect(compiled).not.toContain('Ghost');
  });

  it('adds a title page from project metadata when requested', async () => {
    const { engine } = await makeWorld();

    const compiled = await engine.compileContent(projectOpts({ addTitlePage: true }));

    expect(compiled).toContain('# My Book');
  });
});

describe('selectPdfEngine', () => {
  const all = (o: Partial<Record<PdfEngine, boolean>> = {}): Record<PdfEngine, boolean> =>
    ({ xelatex: false, lualatex: false, pdflatex: false, wkhtmltopdf: false, ...o });

  describe('with a custom font requested', () => {
    it('prefers xelatex and keeps the font when xelatex is available', () => {
      expect(selectPdfEngine(all({ xelatex: true, lualatex: true, pdflatex: true }), true))
        .toEqual({ engine: 'xelatex', keepFont: true });
    });

    it('falls back to lualatex and keeps the font when xelatex is absent', () => {
      expect(selectPdfEngine(all({ lualatex: true, pdflatex: true }), true))
        .toEqual({ engine: 'lualatex', keepFont: true });
    });

    it('degrades to pdflatex and drops the font when only pdflatex is available', () => {
      expect(selectPdfEngine(all({ pdflatex: true }), true))
        .toEqual({ engine: 'pdflatex', keepFont: false });
    });

    it('returns no engine when no LaTeX engine is installed', () => {
      expect(selectPdfEngine(all(), true)).toEqual({ engine: null, keepFont: false });
    });
  });

  describe('with no custom font', () => {
    it('keeps the historic pdflatex-first default', () => {
      expect(selectPdfEngine(all({ xelatex: true, pdflatex: true }), false))
        .toEqual({ engine: 'pdflatex', keepFont: false });
    });

    it('uses xelatex when pdflatex is absent', () => {
      expect(selectPdfEngine(all({ xelatex: true, lualatex: true }), false))
        .toEqual({ engine: 'xelatex', keepFont: false });
    });

    it('returns no engine when nothing is installed', () => {
      expect(selectPdfEngine(all(), false)).toEqual({ engine: null, keepFont: false });
    });

    it('never auto-selects wkhtmltopdf even when it is the only engine installed', () => {
      expect(selectPdfEngine(all({ wkhtmltopdf: true }), false))
        .toEqual({ engine: null, keepFont: false });
      expect(selectPdfEngine(all({ wkhtmltopdf: true }), true))
        .toEqual({ engine: null, keepFont: false });
    });
  });

  describe('with a pinned engine preference', () => {
    it('uses pinned wkhtmltopdf without needing any LaTeX engine, dropping the font', () => {
      expect(selectPdfEngine(all({ wkhtmltopdf: true }), true, 'wkhtmltopdf'))
        .toEqual({ engine: 'wkhtmltopdf', keepFont: false });
    });

    it('keeps the font on a pinned fontspec-capable engine', () => {
      expect(selectPdfEngine(all({ xelatex: true, pdflatex: true }), true, 'xelatex'))
        .toEqual({ engine: 'xelatex', keepFont: true });
      expect(selectPdfEngine(all({ lualatex: true }), true, 'lualatex'))
        .toEqual({ engine: 'lualatex', keepFont: true });
    });

    it('drops the font on pinned pdflatex even when xelatex is installed', () => {
      expect(selectPdfEngine(all({ xelatex: true, pdflatex: true }), true, 'pdflatex'))
        .toEqual({ engine: 'pdflatex', keepFont: false });
    });

    it('fails rather than substituting when the pinned engine is missing', () => {
      expect(selectPdfEngine(all({ xelatex: true, lualatex: true, pdflatex: true }), true, 'wkhtmltopdf'))
        .toEqual({ engine: null, keepFont: false });
      expect(selectPdfEngine(all({ pdflatex: true, wkhtmltopdf: true }), false, 'xelatex'))
        .toEqual({ engine: null, keepFont: false });
    });

    it('does not request the font on a pinned engine when no font is set', () => {
      expect(selectPdfEngine(all({ xelatex: true }), false, 'xelatex'))
        .toEqual({ engine: 'xelatex', keepFont: false });
    });

    it('treats an explicit auto preference exactly like the default', () => {
      expect(selectPdfEngine(all({ xelatex: true, pdflatex: true }), false, 'auto'))
        .toEqual({ engine: 'pdflatex', keepFont: false });
      expect(selectPdfEngine(all({ xelatex: true, pdflatex: true }), true, 'auto'))
        .toEqual({ engine: 'xelatex', keepFont: true });
    });
  });
});

describe('classifyPandocFailure', () => {
  it('classifies the real "pdflatex not found" failure as a missing engine', () => {
    const msg = 'Command failed: pandoc tmp.md --from markdown -o out.pdf -V mainfont=Georgia\n'
      + 'pdflatex not found. Please select a different --pdf-engine or install pdflatex';
    expect(classifyPandocFailure(msg)).toBe('engine-missing');
  });

  it('classifies a missing xelatex as a missing engine', () => {
    expect(classifyPandocFailure('xelatex not found')).toBe('engine-missing');
  });

  it('classifies a missing wkhtmltopdf as a missing engine', () => {
    expect(classifyPandocFailure('wkhtmltopdf not found. Please select a different --pdf-engine or install wkhtmltopdf'))
      .toBe('engine-missing');
  });

  it('classifies a node spawn ENOENT as pandoc missing', () => {
    expect(classifyPandocFailure('Error: spawn pandoc ENOENT')).toBe('pandoc-missing');
  });

  it('classifies the Windows "not recognized" error as pandoc missing', () => {
    expect(classifyPandocFailure("'pandoc' is not recognized as an internal or external command"))
      .toBe('pandoc-missing');
  });

  it('classifies an unrelated failure as other', () => {
    expect(classifyPandocFailure('YAML parse error in metadata block')).toBe('other');
  });
});

describe('ExportEngine.compileContent from the manuscript zone (#232)', () => {
  it('compiles the zone depth-first in binder order without reading _binder.json', async () => {
    const { engine, pm } = await makeFsWorld();
    const loadBinder = jest.spyOn(pm, 'loadBinder');

    const compiled = engine.toMarkdown(await engine.compileContent(projectOpts()));

    const order = ['# Opening', '# Chapter 1', '# Scene', '# Zeta'].map(h => compiled.indexOf(h));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(loadBinder).not.toHaveBeenCalled();
  });

  it('never compiles the Research zone and excludes binder-compile: false documents', async () => {
    const { engine } = await makeFsWorld();

    // includeResearch is a classic-only option — the zone boundary is the
    // compile boundary regardless
    const compiled = await engine.compileContent(projectOpts({ includeResearch: true }));

    expect(compiled).not.toContain('Research notes body.');
    expect(compiled).not.toContain('Cut body.');
  });

  it('emits folder display names as headings at depth, documents one below', async () => {
    const { engine } = await makeFsWorld();

    const compiled = engine.toMarkdown(await engine.compileContent(
      projectOpts({ includeFolderNamesAsHeadings: true })));

    expect(compiled).toContain('# Part One'); // order marker stripped
    expect(compiled).toContain('## Chapter 1');
    expect(compiled).toContain('## Act 2');
    expect(compiled).toContain('### Scene');
    expect(compiled).toContain('# Opening'); // loose at the root stays h1
  });

  it('rebases a subtree export to the right-clicked folder, which emits no heading', async () => {
    const { engine } = await makeFsWorld();

    const compiled = engine.toMarkdown(await engine.compileContent(projectOpts({
      subtreeRoot: 'Projects/My Book/020~ Part One',
      includeFolderNamesAsHeadings: true,
    })));

    expect(compiled).toContain('# Chapter 1'); // parent depth rebased to 0
    expect(compiled).toContain('# Act 2');
    expect(compiled).toContain('## Scene');
    expect(compiled).not.toContain('Part One');
    expect(compiled).not.toContain('Opening body.');
    expect(compiled).not.toContain('Zeta body.');
  });

  it('produces byte-identical output to the classic compile for a flat project', async () => {
    const { engine, plugin } = await makeFsWorld(true);

    plugin.settings.filesystemBinder = false;
    const classic = await engine.compileContent(projectOpts({ addTitlePage: true }));
    plugin.settings.filesystemBinder = true;
    const zone = await engine.compileContent(projectOpts({ addTitlePage: true }));

    expect(zone).toBe(classic);
    expect(zone).toContain('# One');
  });

  it('names a subtree export file after the folder display name', async () => {
    const { engine, files } = await makeFsWorld();

    const outputPath = await engine.export(projectOpts({
      subtreeRoot: 'Projects/My Book/020~ Part One',
    }));

    expect(outputPath).toMatch(/^Projects\/My Book\/Exports\/Part One-.*\.md$/);
    expect(files.files.get(outputPath)).toContain('Chapter body.');
  });
});

// #260: one title names the export everywhere — filename, title page, and
// metadata are identical. The engine default mirrors the dialog's: folder
// display name for a folder export, else the project title.
describe('export title authority (#260)', () => {
  const SUBTREE = 'Projects/My Book/020~ Part One';

  it('a folder export defaults to opening with only the folder display name', async () => {
    const { engine } = await makeFsWorld();

    const compiled = await engine.compileContent(projectOpts({
      subtreeRoot: SUBTREE,
      addTitlePage: true,
    }));

    const today = new Date().toLocaleDateString();
    // No project-title paragraph beneath the heading — the "Project — folder"
    // dropdown choice is the home of that combined form (#260 mock, approved)
    expect(compiled.startsWith(`# Part One\n\nBy Avery\n\n${today}`)).toBe(true);
    expect(compiled).not.toContain('My Book');
  });

  it('an explicit project-name title reproduces the pre-#244 subtree title page byte-for-byte', async () => {
    const { engine } = await makeFsWorld();

    const compiled = await engine.compileContent(projectOpts({
      subtreeRoot: SUBTREE,
      addTitlePage: true,
      exportTitle: 'My Book',
    }));

    const today = new Date().toLocaleDateString();
    expect(compiled.startsWith(`# My Book\n\nBy Avery\n\n${today}`)).toBe(true);
    expect(compiled).not.toContain('Part One\n\nMy Book');
  });

  it('a composed "Project — folder" title arrives as one heading', async () => {
    const { engine } = await makeFsWorld();

    const compiled = await engine.compileContent(projectOpts({
      subtreeRoot: SUBTREE,
      addTitlePage: true,
      exportTitle: 'My Book — Part One',
    }));

    expect(compiled.startsWith('# My Book — Part One\n\nBy Avery\n\n')).toBe(true);
  });

  it('a custom title names the filename, title page, and html metadata identically', async () => {
    const { engine, files } = await makeFsWorld();

    const outputPath = await engine.export(projectOpts({
      format: 'html',
      addTitlePage: true,
      exportTitle: 'Early Drafts',
    }));

    expect(outputPath).toMatch(/^Projects\/My Book\/Exports\/Early Drafts-.*\.html$/);
    const written = files.files.get(outputPath) ?? '';
    expect(written).toContain('<title>Early Drafts</title>');
    expect(written).toContain('Early Drafts</h1>');
  });

  it('reserved path characters in a custom title are sanitized in the filename only', async () => {
    const { engine, files } = await makeFsWorld();

    const outputPath = await engine.export(projectOpts({
      addTitlePage: true,
      exportTitle: 'Draft: v2?',
    }));

    expect(outputPath).toMatch(/^Projects\/My Book\/Exports\/Draft- v2--.*\.md$/);
    expect(files.files.get(outputPath)).toContain('# Draft: v2?');
  });

  it('a whole-project export still defaults to the project title', async () => {
    const { engine } = await makeFsWorld();

    const compiled = await engine.compileContent(projectOpts({ addTitlePage: true }));

    expect(compiled.startsWith('# My Book\n\n')).toBe(true);
  });
});

describe('ExportEngine.export markdown end to end', () => {
  it('writes the compiled markdown into the project Exports folder', async () => {
    const { engine, files } = await makeWorld();

    const outputPath = await engine.export(projectOpts());

    expect(outputPath).toMatch(/^Projects\/My Book\/Exports\/My Book-.*\.md$/);
    const written = files.files.get(outputPath);
    expect(written).toContain('First chapter body.');
    expect(files.folders).toContain('Projects/My Book/Exports');
  });
});
