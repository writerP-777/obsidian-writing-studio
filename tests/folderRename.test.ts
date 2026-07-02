import { ProjectManager } from '../src/ProjectManager';
import { WritingProject, resolveDocumentFolder } from '../models/Project';
import { BinderItem } from '../models/BinderItem';
import {
  rewriteBinderPaths,
  validateDocumentFolderName,
  RESERVED_PROJECT_FOLDERS,
} from '../src/folderRename';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

function makePlugin() {
  return {
    app: {},
    settings: { defaultProjectFolder: 'Projects', authorName: '', removedProjectIds: [] as string[] },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function makeProject(over: Partial<WritingProject> = {}): WritingProject {
  return {
    id: 'p1',
    title: 'My Book',
    type: 'book',
    author: '',
    created: '2026-07-01',
    modified: '2026-07-01',
    description: '',
    folderPath: 'Projects/My Book',
    goals: {},
    ...over,
  };
}

function doc(id: string, filePath: string, title = id): BinderItem {
  return { id, title, filePath, type: 'chapter', order: 1, status: 'draft', includeInExport: true };
}

async function setup(project: WritingProject, items: BinderItem[], folders: string[] = []) {
  const files = new InMemoryVaultFiles();
  folders.forEach(f => files.folders.add(f));
  const pm = new ProjectManager(makePlugin(), files);
  await pm.saveProject(project);
  await pm.saveBinder({ version: '2.0', projectId: project.id, items });
  return { pm, files };
}

describe('rewriteBinderPaths', () => {
  it('rewrites every path under the old prefix, including nested children', () => {
    const items: BinderItem[] = [
      { ...doc('part', '', 'Part 1'), type: 'part', children: [
        doc('a', 'Projects/My Book/Chapters/Ch 1.md'),
      ] },
      doc('b', 'Projects/My Book/Chapters/Ch 2.md'),
    ];

    const changed = rewriteBinderPaths(items, 'Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(changed).toBe(true);
    expect(items[0].children![0].filePath).toBe('Projects/My Book/Text/Ch 1.md');
    expect(items[1].filePath).toBe('Projects/My Book/Text/Ch 2.md');
  });

  it('returns false and leaves items untouched when nothing matches', () => {
    const items = [doc('a', 'Elsewhere/Ch 1.md')];

    const changed = rewriteBinderPaths(items, 'Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(changed).toBe(false);
    expect(items[0].filePath).toBe('Elsewhere/Ch 1.md');
  });

  it('respects segment boundaries — a prefix-sharing sibling folder is not rewritten', () => {
    const items = [
      doc('a', 'Projects/My Book/Chapters/Ch 1.md'),
      doc('old', 'Projects/My Book/Chapters-old/Draft.md'),
    ];

    rewriteBinderPaths(items, 'Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(items[0].filePath).toBe('Projects/My Book/Text/Ch 1.md');
    expect(items[1].filePath).toBe('Projects/My Book/Chapters-old/Draft.md');
  });

  it('is idempotent — a second pass over the same rename changes nothing', () => {
    const items = [doc('a', 'Projects/My Book/Chapters/Ch 1.md')];
    rewriteBinderPaths(items, 'Projects/My Book/Chapters', 'Projects/My Book/Text');

    const changedAgain = rewriteBinderPaths(items, 'Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(changedAgain).toBe(false);
    expect(items[0].filePath).toBe('Projects/My Book/Text/Ch 1.md');
  });
});

describe('validateDocumentFolderName', () => {
  it('rejects an empty name', () => {
    expect(validateDocumentFolderName('', 'Chapters', false)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a whitespace-only name', () => {
    expect(validateDocumentFolderName('   ', 'Chapters', false)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects the reserved Research folder', () => {
    expect(validateDocumentFolderName('Research', 'Chapters', false)).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects the reserved Exports folder', () => {
    expect(validateDocumentFolderName('Exports', 'Chapters', false)).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects reserved names regardless of case', () => {
    for (const reserved of RESERVED_PROJECT_FOLDERS) {
      expect(validateDocumentFolderName(reserved.toUpperCase(), 'Chapters', false).ok).toBe(false);
      expect(validateDocumentFolderName(reserved.toLowerCase(), 'Chapters', false).ok).toBe(false);
    }
  });

  it('rejects every forbidden filename character', () => {
    for (const ch of '\\/:*?"<>|') {
      expect(validateDocumentFolderName(`My${ch}Docs`, 'Chapters', false)).toEqual({ ok: false, reason: 'invalid-chars' });
    }
  });

  it('rejects a trailing space', () => {
    expect(validateDocumentFolderName('Text ', 'Chapters', false)).toEqual({ ok: false, reason: 'trailing' });
  });

  it('rejects a trailing period', () => {
    expect(validateDocumentFolderName('Text.', 'Chapters', false)).toEqual({ ok: false, reason: 'trailing' });
  });

  it('rejects a name whose target folder already exists', () => {
    expect(validateDocumentFolderName('Text', 'Chapters', true)).toEqual({ ok: false, reason: 'exists' });
  });

  it('proceeds on a case-only rename even though the target "exists"', () => {
    // On a case-insensitive filesystem the target is the same folder.
    expect(validateDocumentFolderName('CHAPTERS', 'Chapters', true)).toEqual({ ok: true });
  });

  it('accepts an ordinary new name', () => {
    expect(validateDocumentFolderName('Text', 'Chapters', false)).toEqual({ ok: true });
  });
});

describe('ProjectManager.handleFolderRename', () => {
  it('renaming the document folder rewrites paths in one save and records the new name (absent field set)', async () => {
    const project = makeProject(); // legacy — no documentFolder field
    const { pm, files } = await setup(project, [
      doc('a', 'Projects/My Book/Chapters/Ch 1.md'),
      doc('b', 'Projects/My Book/Chapters/Ch 2.md'),
    ], ['Projects/My Book/Chapters']);
    const saves = jest.spyOn(pm, 'saveBinder');

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    const binder = await pm.loadBinder(project);
    expect(binder.items.map(i => i.filePath)).toEqual([
      'Projects/My Book/Text/Ch 1.md',
      'Projects/My Book/Text/Ch 2.md',
    ]);
    expect(saves).toHaveBeenCalledTimes(1);
    expect(project.documentFolder).toBe('Text');
    const saved = JSON.parse(files.files.get('Projects/My Book/_project.json') as string) as WritingProject;
    expect(saved.documentFolder).toBe('Text');
  });

  it('renaming a subfolder inside the document folder leaves documentFolder untouched', async () => {
    const project = makeProject({ id: 'blog', type: 'blog', folderPath: 'Projects/Blog', documentFolder: 'Posts' });
    const { pm } = await setup(project, [
      doc('post', 'Projects/Blog/Posts/2026/2026-07-01-first.md'),
    ], ['Projects/Blog/Posts', 'Projects/Blog/Posts/2026']);

    await pm.handleFolderRename('Projects/Blog/Posts/2026', 'Projects/Blog/Posts/Archive');

    const binder = await pm.loadBinder(project);
    expect(binder.items[0].filePath).toBe('Projects/Blog/Posts/Archive/2026-07-01-first.md');
    expect(project.documentFolder).toBe('Posts');
  });

  it('renaming the project folder repoints folderPath and leaves documentFolder untouched', async () => {
    const project = makeProject();
    const { pm, files } = await setup(project, [doc('a', 'Projects/My Book/Chapters/Ch 1.md')]);

    await pm.handleFolderRename('Projects/My Book', 'Projects/My Novel');

    expect(project.folderPath).toBe('Projects/My Novel');
    expect(project.documentFolder).toBeUndefined();
    expect(resolveDocumentFolder(project)).toBe('Chapters');
    const binder = await pm.loadBinder(project);
    expect(binder.items[0].filePath).toBe('Projects/My Novel/Chapters/Ch 1.md');
    // Project and binder records land at the new location
    expect(files.files.has('Projects/My Novel/_project.json')).toBe(true);
    expect(files.files.has('Projects/My Novel/_binder.json')).toBe(true);
  });

  it('renaming an ancestor of the project folder repoints folderPath', async () => {
    const project = makeProject();
    const { pm } = await setup(project, [doc('a', 'Projects/My Book/Chapters/Ch 1.md')]);

    await pm.handleFolderRename('Projects', 'Writing');

    expect(project.folderPath).toBe('Writing/My Book');
    const binder = await pm.loadBinder(project);
    expect(binder.items[0].filePath).toBe('Writing/My Book/Chapters/Ch 1.md');
  });

  it('rewrites an uncached binder by reading it from the moved project folder', async () => {
    // Registry loaded before the rename; binder never loaded (not cached).
    const files = new InMemoryVaultFiles();
    files.folders.add('Projects/My Book');
    files.files.set('Projects/My Book/_project.json', JSON.stringify(makeProject()));
    files.files.set('Projects/My Book/_binder.json', JSON.stringify({
      version: '2.0', projectId: 'p1', items: [doc('a', 'Projects/My Book/Chapters/Ch 1.md')],
    }));
    const pm = new ProjectManager(makePlugin(), files);
    await pm.loadAllProjects();
    // Obsidian moves the files before the event fires
    files.files.set('Projects/My Novel/_project.json', files.files.get('Projects/My Book/_project.json') as string);
    files.files.set('Projects/My Novel/_binder.json', files.files.get('Projects/My Book/_binder.json') as string);
    files.files.delete('Projects/My Book/_project.json');
    files.files.delete('Projects/My Book/_binder.json');

    await pm.handleFolderRename('Projects/My Book', 'Projects/My Novel');

    const saved = JSON.parse(files.files.get('Projects/My Novel/_binder.json') as string) as { items: BinderItem[] };
    expect(saved.items[0].filePath).toBe('Projects/My Novel/Chapters/Ch 1.md');
  });

  it('leaves a prefix-sharing sibling folder unrewritten and other projects untouched', async () => {
    const project = makeProject();
    const { pm, files } = await setup(project, [
      doc('a', 'Projects/My Book/Chapters/Ch 1.md'),
      doc('old', 'Projects/My Book/Chapters-old/Draft.md'),
    ], ['Projects/My Book/Chapters', 'Projects/My Book/Chapters-old']);
    const other = makeProject({ id: 'p2', title: 'Other', folderPath: 'Projects/Other' });
    await pm.saveProject(other);
    await pm.saveBinder({ version: '2.0', projectId: 'p2', items: [doc('x', 'Projects/Other/Chapters/X.md')] });
    const otherBinderBefore = files.files.get('Projects/Other/_binder.json');

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    const binder = await pm.loadBinder(project);
    expect(binder.items.map(i => i.filePath)).toEqual([
      'Projects/My Book/Text/Ch 1.md',
      'Projects/My Book/Chapters-old/Draft.md',
    ]);
    expect(files.files.get('Projects/Other/_binder.json')).toBe(otherBinderBefore);
    expect(other.documentFolder).toBeUndefined();
  });

  it('updates a stale documentFolder when the renamed folder holds the binder documents', async () => {
    // Recorded name points at a folder that no longer exists (renamed while
    // the plugin was off); the documents physically live under Posts.
    const project = makeProject({ documentFolder: 'Chapters' });
    const { pm } = await setup(project, [
      doc('a', 'Projects/My Book/Posts/Ch 1.md'),
    ], ['Projects/My Book/Posts']);

    await pm.handleFolderRename('Projects/My Book/Posts', 'Projects/My Book/Essays');

    expect(project.documentFolder).toBe('Essays');
  });

  it('does not clobber documentFolder when another document-holding folder is renamed', async () => {
    // The Research folder holds a user-added binder item, but the real
    // document folder still exists — renaming Research must not repoint it.
    const project = makeProject();
    const { pm } = await setup(project, [
      doc('a', 'Projects/My Book/Chapters/Ch 1.md'),
      doc('r', 'Projects/My Book/Research/Notes.md'),
    ], ['Projects/My Book/Chapters', 'Projects/My Book/Research']);

    await pm.handleFolderRename('Projects/My Book/Research', 'Projects/My Book/Archive');

    expect(project.documentFolder).toBeUndefined();
    const binder = await pm.loadBinder(project);
    expect(binder.items[1].filePath).toBe('Projects/My Book/Archive/Notes.md');
  });

  it('replaying the same event is a no-op', async () => {
    const project = makeProject();
    const { pm } = await setup(project, [doc('a', 'Projects/My Book/Chapters/Ch 1.md')], ['Projects/My Book/Chapters']);
    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');
    const saves = jest.spyOn(pm, 'saveBinder');
    const projectSaves = jest.spyOn(pm, 'saveProject');

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(saves).not.toHaveBeenCalled();
    expect(projectSaves).not.toHaveBeenCalled();
    expect(project.documentFolder).toBe('Text');
  });
});

describe('ProjectManager.repairBinderPaths (single-file rename)', () => {
  it('keeps the user-set title on a pure move (basename unchanged)', async () => {
    const project = makeProject();
    const { pm } = await setup(project, [
      doc('a', 'Projects/My Book/Chapters/Part 1 - Chapter 1.md', 'Chapter One'),
    ]);

    await pm.repairBinderPaths(
      'Projects/My Book/Chapters/Part 1 - Chapter 1.md',
      'Projects/My Book/Text/Part 1 - Chapter 1.md',
      'Part 1 - Chapter 1',
    );

    const binder = await pm.loadBinder(project);
    expect(binder.items[0].filePath).toBe('Projects/My Book/Text/Part 1 - Chapter 1.md');
    expect(binder.items[0].title).toBe('Chapter One');
  });

  it('updates the title when the basename actually changed', async () => {
    const project = makeProject();
    const { pm } = await setup(project, [
      doc('a', 'Projects/My Book/Chapters/Ch 1.md', 'Ch 1'),
    ]);

    await pm.repairBinderPaths(
      'Projects/My Book/Chapters/Ch 1.md',
      'Projects/My Book/Chapters/Chapter One.md',
      'Chapter One',
    );

    const binder = await pm.loadBinder(project);
    expect(binder.items[0].filePath).toBe('Projects/My Book/Chapters/Chapter One.md');
    expect(binder.items[0].title).toBe('Chapter One');
  });
});

// A folder rename fires one TFolder event plus one TFile event per child, in
// no guaranteed order. Both orders must converge on the same records.
describe('folder rename event-order convergence', () => {
  interface Fixture {
    name: string;
    project: () => WritingProject;
    items: () => BinderItem[];
    folders: string[];
    oldFolder: string;
    newFolder: string;
  }

  const fixtures: Fixture[] = [
    {
      name: 'flat document folder',
      project: () => makeProject(),
      items: () => [
        doc('a', 'Projects/My Book/Chapters/Ch 1.md', 'Chapter One'),
        doc('b', 'Projects/My Book/Chapters/Ch 2.md', 'Chapter Two'),
      ],
      folders: ['Projects/My Book/Chapters'],
      oldFolder: 'Projects/My Book/Chapters',
      newFolder: 'Projects/My Book/Text',
    },
    {
      name: 'blog year subfolder',
      project: () => makeProject({ id: 'blog', type: 'blog', folderPath: 'Projects/Blog', documentFolder: 'Posts' }),
      items: () => [doc('post', 'Projects/Blog/Posts/2026/2026-07-01-first.md', 'First Post')],
      folders: ['Projects/Blog/Posts', 'Projects/Blog/Posts/2026'],
      oldFolder: 'Projects/Blog/Posts/2026',
      newFolder: 'Projects/Blog/Posts/Archive',
    },
    {
      name: 'ancestor rename',
      project: () => makeProject(),
      items: () => [doc('a', 'Projects/My Book/Chapters/Ch 1.md', 'Chapter One')],
      folders: ['Projects/My Book/Chapters'],
      oldFolder: 'Projects/My Book',
      newFolder: 'Projects/My Novel',
    },
    {
      name: 'prefix-sharing sibling',
      project: () => makeProject(),
      items: () => [
        doc('a', 'Projects/My Book/Chapters/Ch 1.md', 'Chapter One'),
        doc('old', 'Projects/My Book/Chapters-old/Draft.md', 'Old Draft'),
      ],
      folders: ['Projects/My Book/Chapters', 'Projects/My Book/Chapters-old'],
      oldFolder: 'Projects/My Book/Chapters',
      newFolder: 'Projects/My Book/Text',
    },
  ];

  function rewrite(path: string, oldPrefix: string, newPrefix: string): string {
    return path === oldPrefix || path.startsWith(oldPrefix + '/')
      ? newPrefix + path.slice(oldPrefix.length)
      : path;
  }

  interface FinalState {
    items: BinderItem[];
    documentFolder: string | undefined;
    folderPath: string;
    binderOnDisk: string | undefined;
  }

  async function run(f: Fixture, folderEventFirst: boolean): Promise<FinalState> {
    const project = f.project();
    const items = f.items();
    const { pm, files } = await setup(project, items, f.folders);
    // The .md children Obsidian fires TFile rename events for
    const childMoves = items
      .filter(i => i.filePath.startsWith(f.oldFolder + '/'))
      .map(i => ({ oldPath: i.filePath, newPath: rewrite(i.filePath, f.oldFolder, f.newFolder) }));
    // Obsidian has already moved everything before any event fires
    for (const [p, content] of [...files.files]) {
      const moved = rewrite(p, f.oldFolder, f.newFolder);
      if (moved !== p) {
        files.files.delete(p);
        files.files.set(moved, content);
      }
    }
    files.folders = new Set([...files.folders].map(p => rewrite(p, f.oldFolder, f.newFolder)));

    const fireFolder = () => pm.handleFolderRename(f.oldFolder, f.newFolder);
    const fireFiles = async () => {
      for (const m of childMoves) {
        const base = m.newPath.slice(m.newPath.lastIndexOf('/') + 1).replace(/\.md$/, '');
        await pm.repairBinderPaths(m.oldPath, m.newPath, base);
      }
    };
    if (folderEventFirst) {
      await fireFolder();
      await fireFiles();
    } else {
      await fireFiles();
      await fireFolder();
    }
    // Idempotence: replaying the whole event storm changes nothing further
    await fireFolder();
    await fireFiles();

    const binder = await pm.loadBinder(project);
    return {
      items: JSON.parse(JSON.stringify(binder.items)) as BinderItem[],
      documentFolder: project.documentFolder,
      folderPath: project.folderPath,
      binderOnDisk: files.files.get(`${project.folderPath}/_binder.json`) as string | undefined,
    };
  }

  for (const f of fixtures) {
    it(`converges in both orders: ${f.name}`, async () => {
      const folderFirst = await run(f, true);
      const filesFirst = await run(f, false);

      expect(filesFirst).toEqual(folderFirst);
      // Every path that was under the renamed folder now points at the new one
      for (const item of folderFirst.items) {
        expect(item.filePath.startsWith(f.oldFolder + '/')).toBe(false);
      }
      expect(folderFirst.binderOnDisk).toBeDefined();
    });
  }

  it('preserves user-set titles through a folder rename in both orders', async () => {
    for (const folderEventFirst of [true, false]) {
      const state = await run(fixtures[0], folderEventFirst);
      expect(state.items.map(i => i.title)).toEqual(['Chapter One', 'Chapter Two']);
    }
  });
});
