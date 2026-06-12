import { ExportEngine, ExportOptions } from '../src/ExportEngine';
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
