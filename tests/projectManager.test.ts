import { ProjectManager } from '../src/ProjectManager';
import { Notice } from 'obsidian';
import { WritingProject, resolveDefaultDocumentType, defaultDocumentFolder, resolveDocumentFolder } from '../models/Project';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

function makePlugin() {
  return {
    app: {},
    settings: { defaultProjectFolder: 'Projects', authorName: '', removedProjectIds: [] as string[] },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function makeProject(): WritingProject {
  return {
    id: 'project-1',
    title: 'My Book',
    type: 'book',
    author: '',
    created: '2026-06-11',
    modified: '2026-06-11',
    description: '',
    folderPath: 'Projects/My Book',
    goals: {},
  };
}

beforeEach(() => {
  Notice.messages = [];
});

describe('resolveDefaultDocumentType', () => {
  it('uses the project type default for each typed project', () => {
    expect(resolveDefaultDocumentType('book', 'note')).toBe('chapter');
    expect(resolveDefaultDocumentType('series', 'note')).toBe('article');
    expect(resolveDefaultDocumentType('blog', 'note')).toBe('article');
    expect(resolveDefaultDocumentType('journal-article', 'note')).toBe('section');
    expect(resolveDefaultDocumentType('magazine-article', 'note')).toBe('section');
  });

  it('falls back to the global default for blank projects', () => {
    expect(resolveDefaultDocumentType('blank', 'section')).toBe('section');
    expect(resolveDefaultDocumentType('blank', 'chapter')).toBe('chapter');
  });

  it('ignores the global default for typed projects', () => {
    // A user who set the global to "section" still gets article in a series project.
    expect(resolveDefaultDocumentType('series', 'section')).toBe('article');
  });
});

describe('document folder resolution', () => {
  it('maps each project type to its document folder for new projects', () => {
    expect(defaultDocumentFolder('book')).toBe('Chapters');
    expect(defaultDocumentFolder('series')).toBe('Articles');
    expect(defaultDocumentFolder('blog')).toBe('Posts');
    expect(defaultDocumentFolder('journal-article')).toBe('Sections');
    expect(defaultDocumentFolder('magazine-article')).toBe('Sections');
    expect(defaultDocumentFolder('blank')).toBe('Documents');
  });

  it('falls back to Chapters when the field is absent (pre-existing projects)', () => {
    expect(resolveDocumentFolder({})).toBe('Chapters');
    expect(resolveDocumentFolder(makeProject())).toBe('Chapters');
  });

  it('uses the stored documentFolder when present', () => {
    expect(resolveDocumentFolder({ documentFolder: 'Posts' })).toBe('Posts');
  });
});

describe('createProject sets the per-type document folder', () => {
  it('creates the type-named folder and persists documentFolder', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);

    const project = await pm.createProject('My Series', 'series', '', '');

    expect(project.documentFolder).toBe('Articles');
    expect(files.folders).toContain('Projects/My Series/Articles');
    const saved = JSON.parse(files.files.get('Projects/My Series/_project.json') ?? '{}') as WritingProject;
    expect(saved.documentFolder).toBe('Articles');
  });

  it('blank projects use Documents', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);

    const project = await pm.createProject('Scratch', 'blank', '', '');

    expect(project.documentFolder).toBe('Documents');
    expect(files.folders).toContain('Projects/Scratch/Documents');
  });
});

describe('ProjectManager.createProject name collision', () => {
  it('refuses to create a project when the target folder already exists', async () => {
    const files = new InMemoryVaultFiles();
    files.folders.add('Projects/My Book');
    const pm = new ProjectManager(makePlugin(), files);

    await expect(pm.createProject('My Book', 'blank', '', '')).rejects.toThrow();

    // The existing project's files must be untouched
    expect(files.files.size).toBe(0);
  });

  it('creates the project when no folder exists', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);

    const project = await pm.createProject('Fresh Title', 'blank', '', '');

    expect(project.title).toBe('Fresh Title');
    expect(files.folders).toContain('Projects/Fresh Title');
    expect(files.files.has('Projects/Fresh Title/_project.json')).toBe(true);
    // The filesystem is the binder (#233) — no _binder.json is created
    expect(files.files.has('Projects/Fresh Title/_binder.json')).toBe(false);
  });

  it('never writes a _binder.json, even for a templated project type', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);

    await pm.createProject('My Series', 'series', '', '');

    expect([...files.files.keys()].some(p => p.endsWith('_binder.json'))).toBe(false);
    expect(files.files.has('Projects/My Series/Articles/Series Overview.md')).toBe(true);
  });
});

describe('ProjectManager.loadAllProjects', () => {
  it('loads projects from the immediate subfolders of the root', async () => {
    const files = new InMemoryVaultFiles();
    files.folders.add('Projects/Book A');
    files.files.set('Projects/Book A/_project.json', JSON.stringify({ ...makeProject(), id: 'a', folderPath: 'Projects/Book A' }));
    const pm = new ProjectManager(makePlugin(), files);

    await pm.loadAllProjects();

    expect(pm.getProject('a')).toBeDefined();
  });

  it('skips subfolders without a project file', async () => {
    const files = new InMemoryVaultFiles();
    files.folders.add('Projects/Not A Project');
    const pm = new ProjectManager(makePlugin(), files);

    await pm.loadAllProjects();

    expect(pm.getProjects()).toHaveLength(0);
  });
});

describe('ProjectManager change notification', () => {
  it('announces the active project on setActiveProject', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    const project = makeProject();
    await pm.saveProject(project);
    const seen: (WritingProject | null)[] = [];
    pm.onActiveProjectChanged(p => { seen.push(p); });

    await pm.setActiveProject('project-1');
    await pm.setActiveProject(null);

    expect(seen).toEqual([project, null]);
  });

  it('announces projects-changed when a project is saved', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    const events = jest.fn();
    pm.onProjectsChanged(events);

    await pm.saveProject(makeProject());

    expect(events).toHaveBeenCalledTimes(1);
  });

  it('stops announcing after offref', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    const events = jest.fn();
    const ref = pm.onProjectsChanged(events);
    pm.offref(ref);

    await pm.saveProject(makeProject());

    expect(events).not.toHaveBeenCalled();
  });
});

describe('ProjectManager edit persistence', () => {
  it('persists title, author, and goal edits through saveProject and reload', async () => {
    const files = new InMemoryVaultFiles();
    files.folders.add('Projects/My Book');
    const pm = new ProjectManager(makePlugin(), files);
    const project = makeProject();
    await pm.saveProject(project);

    // The edit-project modal mutates the live project and saves it
    project.title = 'Renamed Book';
    project.author = 'Don Pucik';
    project.goals = { totalWordCount: 80000 };
    await pm.saveProject(project);

    const pm2 = new ProjectManager(makePlugin(), files);
    await pm2.loadAllProjects();
    const reloaded = pm2.getProjects().find(p => p.id === 'project-1');
    expect(reloaded?.title).toBe('Renamed Book');
    expect(reloaded?.author).toBe('Don Pucik');
    expect(reloaded?.goals.totalWordCount).toBe(80000);
  });
});

describe('getWordCountGoalForFile — frontmatter is the sole goal authority (#229/#233)', () => {
  function makePluginWithFm(fm: Record<string, unknown> | undefined) {
    return {
      app: { metadataCache: { getFileCache: () => (fm ? { frontmatter: fm } : null) } },
      settings: { defaultProjectFolder: 'Projects', authorName: '', removedProjectIds: [] as string[] },
      saveSettings: jest.fn().mockResolvedValue(undefined),
    } as never;
  }

  const file = { path: 'Projects/My Book/Chapters/Ch 1.md' } as never;

  it('reads a numeric frontmatter goal', () => {
    const pm = new ProjectManager(makePluginWithFm({ 'word-count-goal': 300 }), new InMemoryVaultFiles());
    expect(pm.getWordCountGoalForFile(file)).toBe(300);
  });

  it('rejects a non-numeric goal instead of returning NaN', () => {
    const pm = new ProjectManager(makePluginWithFm({ 'word-count-goal': 'lots' }), new InMemoryVaultFiles());
    expect(pm.getWordCountGoalForFile(file)).toBeUndefined();
  });

  it('returns undefined when no goal is set', () => {
    const pm = new ProjectManager(makePluginWithFm(undefined), new InMemoryVaultFiles());
    expect(pm.getWordCountGoalForFile(file)).toBeUndefined();
  });
});

describe('ProjectManager.deleteProject', () => {
  function seededFiles(): InMemoryVaultFiles {
    const files = new InMemoryVaultFiles();
    files.folders.add('Projects/My Book');
    files.files.set('Projects/My Book/_project.json', JSON.stringify(makeProject()));
    files.files.set('Projects/My Book/_binder.json', '{"version":"2.0","projectId":"project-1","items":[]}');
    files.files.set('Projects/My Book/Chapters/Ch 1.md', 'words');
    return files;
  }

  it('removes the project from the registry without touching any vault file', async () => {
    const files = seededFiles();
    const pm = new ProjectManager(makePlugin(), files);
    await pm.loadAllProjects();
    const filesBefore = new Map(files.files);
    const events = jest.fn();
    pm.onProjectsChanged(events);

    await pm.deleteProject('project-1');

    expect(pm.getProjects()).toHaveLength(0);
    expect(events).toHaveBeenCalledTimes(1);
    expect(files.files).toEqual(filesBefore);
    expect(files.folders).toContain('Projects/My Book');
  });

  it('clears the active project and announces it when the deleted project was active', async () => {
    const pm = new ProjectManager(makePlugin(), seededFiles());
    await pm.loadAllProjects();
    await pm.setActiveProject('project-1');
    const seen: (WritingProject | null)[] = [];
    pm.onActiveProjectChanged(p => { seen.push(p); });

    await pm.deleteProject('project-1');

    expect(pm.getActiveProject()).toBeNull();
    expect(seen).toEqual([null]);
  });

  it('keeps the active project when a different project is deleted', async () => {
    const plugin = makePlugin();
    const files = seededFiles();
    files.folders.add('Projects/Other');
    files.files.set('Projects/Other/_project.json', JSON.stringify({ ...makeProject(), id: 'other', folderPath: 'Projects/Other' }));
    const pm = new ProjectManager(plugin, files);
    await pm.loadAllProjects();
    await pm.setActiveProject('project-1');

    await pm.deleteProject('other');

    expect(pm.getActiveProject()?.id).toBe('project-1');
    expect((plugin as { saveSettings: jest.Mock }).saveSettings).toHaveBeenCalled();
  });

  it('does not resurrect a deleted project on the next folder scan', async () => {
    const plugin = makePlugin();
    const files = seededFiles();
    const pm = new ProjectManager(plugin, files);
    await pm.loadAllProjects();
    await pm.deleteProject('project-1');

    // Same persisted settings, fresh manager — simulates a plugin reload
    const pm2 = new ProjectManager(plugin, files);
    await pm2.loadAllProjects();

    expect(pm2.getProjects()).toHaveLength(0);
  });

  it('ignores ids that are not in the registry', async () => {
    const plugin = makePlugin();
    const pm = new ProjectManager(plugin, new InMemoryVaultFiles());
    const events = jest.fn();
    pm.onProjectsChanged(events);

    await pm.deleteProject('ghost');

    expect(events).not.toHaveBeenCalled();
    expect((plugin as { settings: { removedProjectIds: string[] } }).settings.removedProjectIds).toEqual([]);
  });
});

// The binder CRUD surface (addDocumentToBinder, structural items, item type
// and status updates, removeFromBinder, loadBinder/saveBinder) was retired at
// the #233 cutover — the filesystem is the binder, so those operations are
// file operations now, covered by the binder view and carry-over suites.
