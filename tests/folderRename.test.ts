import { ProjectManager } from '../src/ProjectManager';
import { WritingProject, resolveDocumentFolder } from '../models/Project';
import {
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

async function setup(project: WritingProject, folders: string[] = []) {
  const files = new InMemoryVaultFiles();
  folders.forEach(f => files.folders.add(f));
  const pm = new ProjectManager(makePlugin(), files);
  await pm.saveProject(project);
  return { pm, files };
}

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
