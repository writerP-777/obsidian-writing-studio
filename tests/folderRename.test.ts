import { ProjectManager } from '../src/ProjectManager';
import { WritingProject, resolveDocumentFolder } from '../models/Project';
import {
  validateDocumentFolderName,
  RESERVED_PROJECT_FOLDERS,
  documentFolderDisplayName,
  documentFolderRenameTarget,
  projectFolderNameForTitle,
  planProjectFolderForTitle,
  validateProjectFolderName,
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

async function setup(project: WritingProject, folders: string[] = []) {
  const files = new InMemoryVaultFiles();
  folders.forEach(f => files.folders.add(f));
  const pm = new ProjectManager(makePlugin(), files);
  await pm.saveProject(project);
  return { pm, files };
}

// The edit-project modal works in display names (#233 audit ruling): the
// order marker never shows, and a rename re-attaches it — editing the field
// can never cost the folder its order.
describe('document folder display name and rename target', () => {
  it('strips the order marker for display; a plain name is unchanged', () => {
    expect(documentFolderDisplayName('005~ Chapters')).toBe('Chapters');
    expect(documentFolderDisplayName('Chapters')).toBe('Chapters');
  });

  it('a rename re-attaches the existing marker', () => {
    expect(documentFolderRenameTarget('005~ Chapters', 'Scenes')).toBe('005~ Scenes');
    expect(documentFolderRenameTarget('005~ Chapters', 'Chapters')).toBe('005~ Chapters');
  });

  it('a plain folder stays plain; typed marker syntax is kept byte-for-byte (#239 residual)', () => {
    expect(documentFolderRenameTarget('Chapters', 'Scenes')).toBe('Scenes');
    expect(documentFolderRenameTarget('005~ Chapters', '007~ Bond')).toBe('007~ Bond');
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

// Since #233 the binder renders disk truth and needs no path repair — the
// rename handler only keeps _project.json records (folderPath,
// documentFolder) in step with the folders they name.
describe('ProjectManager.handleFolderRename', () => {
  it('renaming the recorded document folder records the new name', async () => {
    const project = makeProject({ documentFolder: 'Chapters' });
    const { pm, files } = await setup(project, ['Projects/My Book/Chapters']);

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(project.documentFolder).toBe('Text');
    const saved = JSON.parse(files.files.get('Projects/My Book/_project.json') as string) as WritingProject;
    expect(saved.documentFolder).toBe('Text');
  });

  it('renaming the default Chapters folder sets the absent field (legacy projects)', async () => {
    const project = makeProject(); // no documentFolder field
    const { pm } = await setup(project, ['Projects/My Book/Chapters']);

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(project.documentFolder).toBe('Text');
  });

  it('renaming a subfolder inside the document folder leaves documentFolder untouched', async () => {
    const project = makeProject({ id: 'blog', type: 'blog', folderPath: 'Projects/Blog', documentFolder: 'Posts' });
    const { pm } = await setup(project, ['Projects/Blog/Posts', 'Projects/Blog/Posts/2026']);

    await pm.handleFolderRename('Projects/Blog/Posts/2026', 'Projects/Blog/Posts/Archive');

    expect(project.documentFolder).toBe('Posts');
  });

  it('renaming the project folder repoints folderPath and leaves documentFolder untouched', async () => {
    const project = makeProject();
    const { pm, files } = await setup(project);

    await pm.handleFolderRename('Projects/My Book', 'Projects/My Novel');

    expect(project.folderPath).toBe('Projects/My Novel');
    expect(project.documentFolder).toBeUndefined();
    expect(resolveDocumentFolder(project)).toBe('Chapters');
    expect(files.files.has('Projects/My Novel/_project.json')).toBe(true);
  });

  it('renaming an ancestor of the project folder repoints folderPath', async () => {
    const project = makeProject();
    const { pm } = await setup(project);

    await pm.handleFolderRename('Projects', 'Writing');

    expect(project.folderPath).toBe('Writing/My Book');
  });

  it('a prefix-sharing sibling folder does not repoint anything', async () => {
    const project = makeProject({ documentFolder: 'Chapters' });
    const { pm } = await setup(project, ['Projects/My Book/Chapters', 'Projects/My Book/Chapters-old']);

    await pm.handleFolderRename('Projects/My Book/Chapters-old', 'Projects/My Book/Archive');

    expect(project.documentFolder).toBe('Chapters');
    expect(project.folderPath).toBe('Projects/My Book');
  });

  it('never writes _binder.json — the legacy file is immutable (#231 defect, fixed at #233)', async () => {
    const project = makeProject({ documentFolder: 'Chapters' });
    const { pm, files } = await setup(project, ['Projects/My Book/Chapters']);
    const legacy = '{"version":"2.0","projectId":"p1","items":[{"id":"a","title":"A","filePath":"Projects/My Book/Chapters/A.md","type":"chapter","order":1,"status":"draft","includeInExport":true}]}';
    files.files.set('Projects/My Book/_binder.json', legacy);

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(files.files.get('Projects/My Book/_binder.json')).toBe(legacy);
  });

  it('replaying the same event is a no-op', async () => {
    const project = makeProject();
    const { pm } = await setup(project, ['Projects/My Book/Chapters']);
    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');
    const projectSaves = jest.spyOn(pm, 'saveProject');

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(projectSaves).not.toHaveBeenCalled();
    expect(project.documentFolder).toBe('Text');
  });
});

// #391 — renaming the project folder in Obsidian's file explorer retitles
// the project, but only when the title and the folder name were in step.
describe('ProjectManager.handleFolderRename retitles the project (#391)', () => {
  it('a title equal to the old folder name follows the rename', async () => {
    const project = makeProject({ title: 'My Book' });
    const { pm, files } = await setup(project);

    await pm.handleFolderRename('Projects/My Book', 'Projects/My Novel');

    expect(project.title).toBe('My Novel');
    expect(project.folderPath).toBe('Projects/My Novel');
    const saved = JSON.parse(files.files.get('Projects/My Novel/_project.json') as string) as WritingProject;
    expect(saved.title).toBe('My Novel');
  });

  it('a title set apart from the folder is never overwritten', async () => {
    const project = makeProject({ title: 'My Book: A Novel', folderPath: 'Projects/My Book- A Novel' });
    const { pm } = await setup(project);

    await pm.handleFolderRename('Projects/My Book- A Novel', 'Projects/Other');

    expect(project.title).toBe('My Book: A Novel');
    expect(project.folderPath).toBe('Projects/Other');
  });

  it('renaming an ancestor folder repoints the path and leaves the title alone', async () => {
    const project = makeProject({ title: 'My Book' });
    const { pm } = await setup(project);

    await pm.handleFolderRename('Projects', 'Writing');

    expect(project.folderPath).toBe('Writing/My Book');
    expect(project.title).toBe('My Book');
  });

  it('renaming the document folder leaves the title alone', async () => {
    const project = makeProject({ title: 'Chapters', documentFolder: 'Chapters' });
    const { pm } = await setup(project, ['Projects/My Book/Chapters']);

    await pm.handleFolderRename('Projects/My Book/Chapters', 'Projects/My Book/Text');

    expect(project.title).toBe('Chapters');
    expect(project.documentFolder).toBe('Text');
  });
});

// #391 — the one derivation shared by createProject and the edit modal's
// title rename: the title keeps its punctuation, the folder stays legal.
describe('projectFolderNameForTitle', () => {
  it('passes an ordinary title through unchanged', () => {
    expect(projectFolderNameForTitle('My Book')).toBe('My Book');
  });

  it('replaces every illegal filename character with a hyphen', () => {
    expect(projectFolderNameForTitle('My Book: A Novel')).toBe('My Book- A Novel');
    expect(projectFolderNameForTitle('a\\b/c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('trims the title and strips trailing dots and spaces', () => {
    expect(projectFolderNameForTitle('  Draft One. ')).toBe('Draft One');
    expect(projectFolderNameForTitle('Ending...')).toBe('Ending');
  });

  it('yields an empty name when nothing usable remains', () => {
    expect(projectFolderNameForTitle('...')).toBe('');
    expect(projectFolderNameForTitle('   ')).toBe('');
  });
});

describe('planProjectFolderForTitle', () => {
  it('reports no rename when the title maps to the current folder', () => {
    expect(planProjectFolderForTitle('My Book', 'My Book')).toEqual({ name: 'My Book', renames: false, substituted: false });
  });

  it('reports a plain rename for a legal new title', () => {
    expect(planProjectFolderForTitle('My Novel', 'My Book')).toEqual({ name: 'My Novel', renames: true, substituted: false });
  });

  it('reports a substituted rename when the title has illegal characters', () => {
    expect(planProjectFolderForTitle('My Book: A Novel', 'My Book'))
      .toEqual({ name: 'My Book- A Novel', renames: true, substituted: true });
  });

  it('a punctuated title whose folder already carries the substitution needs no rename', () => {
    expect(planProjectFolderForTitle('My Book: A Novel', 'My Book- A Novel'))
      .toEqual({ name: 'My Book- A Novel', renames: false, substituted: true });
  });
});

describe('validateProjectFolderName', () => {
  it('rejects an empty derived name', () => {
    expect(validateProjectFolderName('', 'My Book', false)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a name another folder already has', () => {
    expect(validateProjectFolderName('Other', 'My Book', true)).toEqual({ ok: false, reason: 'exists' });
  });

  it('proceeds on a case-only rename even though the target "exists"', () => {
    expect(validateProjectFolderName('my book', 'My Book', true)).toEqual({ ok: true });
  });

  it('accepts an ordinary new name', () => {
    expect(validateProjectFolderName('My Novel', 'My Book', false)).toEqual({ ok: true });
  });
});
