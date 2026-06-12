import { ProjectManager } from '../src/ProjectManager';
import { Notice } from 'obsidian';
import { WritingProject } from '../models/Project';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

function makePlugin() {
  return {
    app: {},
    settings: { defaultProjectFolder: 'Projects', authorName: '' },
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
    expect(files.files.has('Projects/Fresh Title/_binder.json')).toBe(true);
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

describe('ProjectManager.loadBinder corrupt file handling', () => {
  function corruptFiles(): InMemoryVaultFiles {
    const files = new InMemoryVaultFiles();
    files.files.set('Projects/My Book/_binder.json', '{ not valid json');
    return files;
  }

  it('backs up a corrupt binder before returning an empty one', async () => {
    const files = corruptFiles();
    const pm = new ProjectManager(makePlugin(), files);

    const binder = await pm.loadBinder(makeProject());

    expect(binder.items).toEqual([]);
    expect(files.files.get('Projects/My Book/_binder.json.bak')).toBe('{ not valid json');
    expect(Notice.messages.length).toBe(1);
  });

  it('does not cache the empty binder so a repaired file is picked up', async () => {
    const files = corruptFiles();
    const read = jest.spyOn(files, 'readText');
    const pm = new ProjectManager(makePlugin(), files);
    const project = makeProject();

    await pm.loadBinder(project);
    await pm.loadBinder(project);

    // Cached results would skip the second read
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('caches a valid binder', async () => {
    const files = new InMemoryVaultFiles();
    files.files.set('Projects/My Book/_binder.json', '{"version":"2.0","projectId":"project-1","items":[]}');
    const read = jest.spyOn(files, 'readText');
    const pm = new ProjectManager(makePlugin(), files);
    const project = makeProject();

    await pm.loadBinder(project);
    await pm.loadBinder(project);

    expect(read).toHaveBeenCalledTimes(1);
    expect(files.files.has('Projects/My Book/_binder.json.bak')).toBe(false);
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

  it('announces binder-changed with the saved binder', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    const seen: string[] = [];
    pm.onBinderChanged(binder => { seen.push(binder.projectId); });

    await pm.saveBinder({ version: '2.0', projectId: 'project-1', items: [] });

    expect(seen).toEqual(['project-1']);
  });

  it('announces projects-changed when a project is saved', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    const events = jest.fn();
    pm.onProjectsChanged(events);

    await pm.saveProject(makeProject());

    expect(events).toHaveBeenCalledTimes(1);
  });

  it('does not announce binder-changed for an unknown project', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    const events = jest.fn();
    pm.onBinderChanged(events);

    // saveBinder returns early when the project is not loaded
    await pm.saveBinder({ version: '2.0', projectId: 'ghost', items: [] });

    expect(events).not.toHaveBeenCalled();
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

describe('ProjectManager.addDocumentToBinder filename de-duplication', () => {
  it('suffixes the filename when the target file already exists', async () => {
    const files = new InMemoryVaultFiles();
    files.files.set('Projects/My Book/Chapters/Interlude.md', 'x');
    files.files.set('Projects/My Book/Chapters/Interlude 2.md', 'x');
    const pm = new ProjectManager(makePlugin(), files);
    await pm.saveProject(makeProject());

    const item = await pm.addDocumentToBinder(makeProject(), 'Interlude', 'chapter');

    expect(item.filePath).toBe('Projects/My Book/Chapters/Interlude 3.md');
    expect(item.title).toBe('Interlude');
    expect(files.files.get('Projects/My Book/Chapters/Interlude 3.md')).toContain('title: "Interlude"');
  });

  it('uses the plain filename when no collision exists', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);
    await pm.saveProject(makeProject());

    const item = await pm.addDocumentToBinder(makeProject(), 'Chapter One', 'chapter');

    expect(item.filePath).toBe('Projects/My Book/Chapters/Chapter One.md');
  });
});
