import { ProjectManager } from '../src/ProjectManager';
import { TFile, TFolder, Notice } from 'obsidian';
import { WritingProject } from '../models/Project';

interface MockVault {
  getAbstractFileByPath: jest.Mock;
  read: jest.Mock;
  create: jest.Mock;
  createFolder: jest.Mock;
  modify: jest.Mock;
}

function makeVault(): MockVault {
  return {
    getAbstractFileByPath: jest.fn().mockReturnValue(null),
    read: jest.fn(),
    create: jest.fn().mockResolvedValue(undefined),
    createFolder: jest.fn().mockResolvedValue(undefined),
    modify: jest.fn().mockResolvedValue(undefined),
  };
}

function makePlugin(vault: MockVault) {
  return {
    app: { vault },
    settings: { defaultProjectFolder: 'Projects', authorName: '' },
    statsTracker: { invalidateWordCountCache: jest.fn() },
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
    const vault = makeVault();
    vault.getAbstractFileByPath.mockImplementation((path: string) =>
      path === 'Projects/My Book' ? new TFolder('Projects/My Book') : null
    );
    const pm = new ProjectManager(makePlugin(vault));

    await expect(pm.createProject('My Book', 'blank', '', '')).rejects.toThrow();

    // The existing project's files must be untouched
    expect(vault.create).not.toHaveBeenCalled();
    expect(vault.modify).not.toHaveBeenCalled();
    expect(vault.createFolder).not.toHaveBeenCalled();
  });

  it('creates the project when no folder exists', async () => {
    const vault = makeVault();
    const pm = new ProjectManager(makePlugin(vault));

    const project = await pm.createProject('Fresh Title', 'blank', '', '');

    expect(project.title).toBe('Fresh Title');
    expect(vault.createFolder).toHaveBeenCalledWith('Projects/Fresh Title');
  });
});

describe('ProjectManager.loadBinder corrupt file handling', () => {
  function corruptVault(): MockVault {
    const vault = makeVault();
    vault.getAbstractFileByPath.mockImplementation((path: string) =>
      path === 'Projects/My Book/_binder.json' ? new TFile(path) : null
    );
    vault.read.mockResolvedValue('{ not valid json');
    return vault;
  }

  it('backs up a corrupt binder before returning an empty one', async () => {
    const vault = corruptVault();
    const pm = new ProjectManager(makePlugin(vault));

    const binder = await pm.loadBinder(makeProject());

    expect(binder.items).toEqual([]);
    expect(vault.create).toHaveBeenCalledWith(
      'Projects/My Book/_binder.json.bak',
      '{ not valid json'
    );
    expect(Notice.messages.length).toBe(1);
  });

  it('does not cache the empty binder so a repaired file is picked up', async () => {
    const vault = corruptVault();
    const pm = new ProjectManager(makePlugin(vault));
    const project = makeProject();

    await pm.loadBinder(project);
    await pm.loadBinder(project);

    // Cached results would skip the second read
    expect(vault.read).toHaveBeenCalledTimes(2);
  });

  it('caches a valid binder', async () => {
    const vault = corruptVault();
    vault.read.mockResolvedValue('{"version":"2.0","projectId":"project-1","items":[]}');
    const pm = new ProjectManager(makePlugin(vault));
    const project = makeProject();

    await pm.loadBinder(project);
    await pm.loadBinder(project);

    expect(vault.read).toHaveBeenCalledTimes(1);
    expect(vault.create).not.toHaveBeenCalled();
  });
});

describe('ProjectManager.addDocumentToBinder filename de-duplication', () => {
  it('suffixes the filename when the target file already exists', async () => {
    const vault = makeVault();
    const existing = new Set([
      'Projects/My Book/Chapters/Interlude.md',
      'Projects/My Book/Chapters/Interlude 2.md',
    ]);
    vault.getAbstractFileByPath.mockImplementation((path: string) =>
      existing.has(path) ? new TFile(path) : null
    );
    const pm = new ProjectManager(makePlugin(vault));

    const item = await pm.addDocumentToBinder(makeProject(), 'Interlude', 'chapter');

    expect(item.filePath).toBe('Projects/My Book/Chapters/Interlude 3.md');
    expect(item.title).toBe('Interlude');
    expect(vault.create).toHaveBeenCalledWith(
      'Projects/My Book/Chapters/Interlude 3.md',
      expect.stringContaining('title: "Interlude"')
    );
  });

  it('uses the plain filename when no collision exists', async () => {
    const vault = makeVault();
    const pm = new ProjectManager(makePlugin(vault));

    const item = await pm.addDocumentToBinder(makeProject(), 'Chapter One', 'chapter');

    expect(item.filePath).toBe('Projects/My Book/Chapters/Chapter One.md');
  });
});
