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

describe('addDocumentToBinder places files in the project document folder', () => {
  it('writes to the stored folder when the field is set', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);
    const blog: WritingProject = { ...makeProject(), id: 'blog-1', type: 'blog', documentFolder: 'Posts' };
    await pm.saveBinder({ version: '2.0', projectId: blog.id, items: [] });

    const item = await pm.addDocumentToBinder(blog, 'New Post', 'article');

    expect(item.filePath).toBe('Projects/My Book/Posts/New Post.md');
    expect(files.files.has('Projects/My Book/Posts/New Post.md')).toBe(true);
  });

  it('writes to Chapters for legacy projects without the field', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);
    const legacy = makeProject();
    await pm.saveBinder({ version: '2.0', projectId: legacy.id, items: [] });

    const item = await pm.addDocumentToBinder(legacy, 'New Chapter', 'chapter');

    expect(item.filePath).toBe('Projects/My Book/Chapters/New Chapter.md');
  });
});

describe('addDocumentToBinder honors the resolved project-type default', () => {
  it('adds an article-typed item in a series project', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);
    const series: WritingProject = { ...makeProject(), id: 'series-1', title: 'My Series', type: 'series', folderPath: 'Projects/My Series' };
    await pm.saveBinder({ version: '2.0', projectId: series.id, items: [] });

    const resolved = resolveDefaultDocumentType(series.type, 'chapter');
    const item = await pm.addDocumentToBinder(series, 'Article Two', resolved);

    expect(item.type).toBe('article');
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

describe('ProjectManager.findBinderEntryForFile', () => {
  it('returns the writable entry for a file in the active binder, including nested items', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    await pm.setActiveProject('project-1');
    await pm.saveBinder({
      version: '2.0', projectId: 'project-1', items: [
        { id: 'g1', title: 'Part 1', filePath: '', type: 'part', order: 1, status: 'draft', includeInExport: true, children: [
          { id: 'c1', title: 'Ch 1', filePath: 'Projects/My Book/Chapters/Ch 1.md', type: 'chapter', order: 1, status: 'draft', includeInExport: true, wordCountGoal: 250 },
        ] },
      ],
    });

    const entry = await pm.findBinderEntryForFile('Projects/My Book/Chapters/Ch 1.md');

    expect(entry).not.toBeNull();
    expect(entry!.item.id).toBe('c1');
    expect(entry!.item.wordCountGoal).toBe(250);
  });

  it('persists a goal written through the returned entry (the modal save path)', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    await pm.setActiveProject('project-1');
    const item = await pm.addDocumentToBinder(makeProject(), 'Chapter One', 'chapter');

    const entry = await pm.findBinderEntryForFile(item.filePath);
    entry!.item.wordCountGoal = 500;
    await pm.saveBinder(entry!.binder);

    const reloaded = await pm.findBinderEntryForFile(item.filePath);
    expect(reloaded!.item.wordCountGoal).toBe(500);
  });

  it('returns null for files outside the binder and when no project is active', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());

    // No active project yet
    expect(await pm.findBinderEntryForFile('anything.md')).toBeNull();

    await pm.setActiveProject('project-1');
    expect(await pm.findBinderEntryForFile('not-in-binder.md')).toBeNull();
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

describe('ProjectManager.removeFromBinderPromoteChildren', () => {
  function entry(id: string, order: number, children?: BinderItem[]): BinderItem {
    return {
      id, title: id, filePath: `Projects/My Book/Chapters/${id}.md`,
      type: 'chapter', order, status: 'draft', includeInExport: true, children,
    };
  }

  async function setup(items: BinderItem[]) {
    const files = new InMemoryVaultFiles();
    files.files.set('Projects/My Book/Chapters/a.md', 'content');
    const pm = new ProjectManager(makePlugin(), files);
    await pm.saveProject(makeProject());
    await pm.saveBinder({ version: '2.0', projectId: 'project-1', items });
    return { pm, files };
  }

  it('removes the entry and leaves the file untouched', async () => {
    const { pm, files } = await setup([entry('a', 1), entry('b', 2)]);

    await pm.removeFromBinderPromoteChildren(makeProject(), 'a');

    const binder = await pm.loadBinder(makeProject());
    expect(binder.items.map(i => i.id)).toEqual(['b']);
    expect(files.files.get('Projects/My Book/Chapters/a.md')).toBe('content');
  });

  it('promotes children into the removed parent position and renumbers orders', async () => {
    const { pm } = await setup([
      entry('a', 1),
      entry('parent', 2, [entry('c1', 1), entry('c2', 2)]),
      entry('b', 3),
    ]);

    await pm.removeFromBinderPromoteChildren(makeProject(), 'parent');

    const binder = await pm.loadBinder(makeProject());
    expect(binder.items.map(i => i.id)).toEqual(['a', 'c1', 'c2', 'b']);
    expect(binder.items.map(i => i.order)).toEqual([1, 2, 3, 4]);
  });

  it('removes a nested entry without disturbing its siblings', async () => {
    const { pm } = await setup([
      entry('parent', 1, [entry('c1', 1), entry('c2', 2, [entry('g1', 1)]), entry('c3', 3)]),
    ]);

    await pm.removeFromBinderPromoteChildren(makeProject(), 'c2');

    const binder = await pm.loadBinder(makeProject());
    expect(binder.items[0].children!.map(i => i.id)).toEqual(['c1', 'g1', 'c3']);
  });

  it('announces binder-changed so views refresh', async () => {
    const { pm } = await setup([entry('a', 1)]);
    const events = jest.fn();
    pm.onBinderChanged(events);

    await pm.removeFromBinderPromoteChildren(makeProject(), 'a');

    expect(events).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectManager.addStructuralItem', () => {
  it('creates a file-less item at the root and writes no document file', async () => {
    const files = new InMemoryVaultFiles();
    const pm = new ProjectManager(makePlugin(), files);
    await pm.saveProject(makeProject());

    const item = await pm.addStructuralItem(makeProject(), 'Part 1', 'part');

    expect(item.type).toBe('part');
    expect(item.filePath).toBe('');
    const binder = await pm.loadBinder(makeProject());
    expect(binder.items.map(i => i.id)).toEqual([item.id]);
    // Only project metadata exists — no .md was created
    expect([...files.files.keys()].sort()).toEqual([
      'Projects/My Book/_binder.json',
      'Projects/My Book/_project.json',
    ]);
  });

  it('nests a group under a parent item', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    const parent = await pm.addStructuralItem(makeProject(), 'Part 1', 'part');

    const child = await pm.addStructuralItem(makeProject(), 'Act 1', 'group', parent.id);

    const binder = await pm.loadBinder(makeProject());
    expect(binder.items[0].children!.map(i => i.id)).toEqual([child.id]);
  });
});

describe('ProjectManager.updateItemType', () => {
  it('changes a document item type and persists it', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    const item = await pm.addDocumentToBinder(makeProject(), 'Chapter One', 'chapter');

    await pm.updateItemType(makeProject(), item.id, 'note');

    const binder = await pm.loadBinder(makeProject());
    expect(binder.items[0].type).toBe('note');
  });

  it('refuses to change structural items', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    const group = await pm.addStructuralItem(makeProject(), 'Act 1', 'group');
    const events = jest.fn();
    pm.onBinderChanged(events);

    await pm.updateItemType(makeProject(), group.id, 'chapter');

    const binder = await pm.loadBinder(makeProject());
    expect(binder.items[0].type).toBe('group');
    expect(events).not.toHaveBeenCalled();
  });

  it('does not announce a change when the type is already set', async () => {
    const pm = new ProjectManager(makePlugin(), new InMemoryVaultFiles());
    await pm.saveProject(makeProject());
    const item = await pm.addDocumentToBinder(makeProject(), 'Chapter One', 'chapter');
    const events = jest.fn();
    pm.onBinderChanged(events);

    await pm.updateItemType(makeProject(), item.id, 'chapter');

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
