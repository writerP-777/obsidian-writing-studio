// Bridge wiring added at the #233 cutover: restore sticks (a restored
// project never auto-migrates again), and the one-time update notice fires
// only after the first migration that actually performs work. The engine
// itself is covered in carryOver.test.ts — here it is mocked so the tests
// pin the bridge's decisions, not the passes.

import { TFile, Notice } from 'obsidian';
import { runSilentMigration, runRestoreLayout } from '../src/carryOverBridge';
import { BinderUpdateModal } from '../modals/BinderUpdateModal';
import * as carryOver from '../src/carryOver';
import type WritingStudioPlugin from '../main';
import { WritingProject } from '../models/Project';

jest.mock('../src/carryOver', () => ({
  parseLegacyBinder: jest.fn(),
  planCarryOver: jest.fn(),
  planHasWork: jest.fn(),
  planRestore: jest.fn(),
  restoreHasWork: jest.fn(),
  runMigrationPass: jest.fn(),
  runRestorePass: jest.fn(),
}));

const mocked = carryOver as jest.Mocked<typeof carryOver>;

function makeProject(over: Partial<WritingProject> = {}): WritingProject {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    title: 'My Book',
    type: 'book',
    author: '',
    created: '2026-07-06',
    modified: '2026-07-06',
    description: '',
    folderPath: 'P',
    goals: {},
    ...over,
  };
}

function makePlugin(project: WritingProject) {
  const binderFile = new TFile('P/_binder.json', 'json');
  const saveProject = jest.fn().mockResolvedValue(undefined);
  const plugin = {
    app: {
      vault: {
        getAbstractFileByPath: (p: string) => (p === 'P/_binder.json' ? binderFile : null),
        cachedRead: jest.fn().mockResolvedValue('{}'),
      },
      metadataCache: { getFileCache: () => null },
      fileManager: {},
    },
    settings: { binderUpdateNoticeSeen: false, carryOverFailures: {} as Record<string, unknown> },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    projectManager: {
      getActiveProject: () => project,
      saveProject,
    },
  };
  return { plugin: plugin as unknown as WritingStudioPlugin, saveProject };
}

beforeEach(() => {
  jest.clearAllMocks();
  Notice.messages = [];
  mocked.parseLegacyBinder.mockReturnValue({ version: '2.0', projectId: 'p', items: [] } as never);
  mocked.planCarryOver.mockReturnValue({} as never);
  mocked.runMigrationPass.mockResolvedValue({ failures: [] } as never);
  mocked.planRestore.mockReturnValue({} as never);
  mocked.runRestorePass.mockResolvedValue({ failures: [], skipped: 0 } as never);
});

describe('restore sticks (#233)', () => {
  it('a completed restore writes binderLayoutRestored into the project record', async () => {
    const project = makeProject();
    const { plugin, saveProject } = makePlugin(project);
    mocked.restoreHasWork.mockReturnValue(true);

    await runRestoreLayout(plugin);

    expect(project.binderLayoutRestored).toBe(true);
    expect(saveProject).toHaveBeenCalledWith(project);
  });

  it('a restore with nothing to do does not set the flag', async () => {
    const project = makeProject();
    const { plugin, saveProject } = makePlugin(project);
    mocked.restoreHasWork.mockReturnValue(false);

    await runRestoreLayout(plugin);

    expect(project.binderLayoutRestored).toBeUndefined();
    expect(saveProject).not.toHaveBeenCalled();
  });

  it('silent migration skips a restored project without touching anything', async () => {
    const project = makeProject({ binderLayoutRestored: true });
    const { plugin } = makePlugin(project);
    mocked.planHasWork.mockReturnValue(true);

    await runSilentMigration(plugin);

    expect(mocked.planCarryOver).not.toHaveBeenCalled();
    expect(mocked.runMigrationPass).not.toHaveBeenCalled();
  });
});

describe('one-time update notice (#233)', () => {
  it('fires after the first migration that performs work, once per vault', async () => {
    const open = jest.spyOn(BinderUpdateModal.prototype, 'open');
    const first = makePlugin(makeProject());
    mocked.planHasWork.mockReturnValue(true);

    await runSilentMigration(first.plugin);

    expect(open).toHaveBeenCalledTimes(1);
    expect((first.plugin.settings as { binderUpdateNoticeSeen: boolean }).binderUpdateNoticeSeen).toBe(true);

    // A later migration in the same vault (flag persisted) shows nothing
    const second = makePlugin(makeProject());
    (second.plugin.settings as { binderUpdateNoticeSeen: boolean }).binderUpdateNoticeSeen = true;
    await runSilentMigration(second.plugin);

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('never fires for a project with nothing to migrate', async () => {
    const open = jest.spyOn(BinderUpdateModal.prototype, 'open');
    const { plugin } = makePlugin(makeProject());
    mocked.planHasWork.mockReturnValue(false);

    await runSilentMigration(plugin);

    expect(open).not.toHaveBeenCalled();
    expect((plugin.settings as { binderUpdateNoticeSeen: boolean }).binderUpdateNoticeSeen).toBe(false);
  });
});
