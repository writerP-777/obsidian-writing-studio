import { exportTitleChoices, resolveExportTitle, sanitizeTitleForFilename } from '../src/exportTitle';
import { defaultExportUiState } from '../src/ExportEngine';

// #260: one title dropdown resolves to the single title the export carries in
// its filename, title page, and metadata.
describe('exportTitleChoices', () => {
  it('offers all four choices for a folder export', () => {
    expect(exportTitleChoices(true)).toEqual(['folder', 'project-folder', 'project', 'custom']);
  });

  it('offers only project and custom where there is no folder', () => {
    expect(exportTitleChoices(false)).toEqual(['project', 'custom']);
  });
});

describe('resolveExportTitle', () => {
  const ctx = { projectTitle: 'My Novel', folderName: 'Chapter One' };

  it('folder → the folder display name', () => {
    expect(resolveExportTitle('folder', ctx)).toBe('Chapter One');
  });

  it('project-folder → project and folder joined with an em dash', () => {
    expect(resolveExportTitle('project-folder', ctx)).toBe('My Novel — Chapter One');
  });

  it('project → the project title', () => {
    expect(resolveExportTitle('project', ctx)).toBe('My Novel');
  });

  it('custom → the typed title verbatim', () => {
    expect(resolveExportTitle('custom', { ...ctx, customTitle: 'Early Drafts' })).toBe('Early Drafts');
  });

  it('custom with an empty or whitespace field resolves to null — Export stays disabled', () => {
    expect(resolveExportTitle('custom', ctx)).toBeNull();
    expect(resolveExportTitle('custom', { ...ctx, customTitle: '   ' })).toBeNull();
  });

  it('folder choices degrade to the project title when no folder is present', () => {
    const noFolder = { projectTitle: 'My Novel' };
    expect(resolveExportTitle('folder', noFolder)).toBe('My Novel');
    expect(resolveExportTitle('project-folder', noFolder)).toBe('My Novel');
  });
});

describe('sanitizeTitleForFilename', () => {
  it('replaces reserved path characters and keeps everything else', () => {
    expect(sanitizeTitleForFilename('A/B: C?')).toBe('A-B- C-');
    expect(sanitizeTitleForFilename('My Novel — Chapter One')).toBe('My Novel — Chapter One');
  });
});

describe('defaultExportUiState', () => {
  it('mirrors the export dialog defaults: project scope, titles on, folder headings off, title page on', () => {
    const s = defaultExportUiState();
    expect(s).toMatchObject({
      scope: 'project',
      includeFrontmatter: false,
      includeTitlesAsHeadings: true,
      includeFolderNamesAsHeadings: false,
      addTitlePage: true,
      titleChoice: 'project',
      customTitle: '',
    });
  });

  it('a folder export defaults its title to the folder', () => {
    const s = defaultExportUiState('Projects/My Book/020~ Part One');
    expect(s.titleChoice).toBe('folder');
    expect(s.subtreeRoot).toBe('Projects/My Book/020~ Part One');
  });
});
