import { TypographyMode } from '../src/TypographyMode';
import { WritingModes } from '../src/WritingModes';
import { Notice } from 'obsidian';

// TypographyMode touches the Obsidian `activeDocument` global; fake it for node
const fakeActiveDocument = {
  body: { classList: { add: jest.fn(), remove: jest.fn() } },
  documentElement: {
    style: { setProperty: jest.fn(), removeProperty: jest.fn() },
    setCssProps: jest.fn(),
  },
};
(globalThis as { activeDocument?: unknown }).activeDocument = fakeActiveDocument;

function makeTypographyPlugin() {
  return {
    settings: {
      typographyModeActive: false,
      persistTypography: true,
      typographyFont: 'mono',
      customFontName: '',
      maxLineLength: 65,
      typographyFontSize: 18,
      lineHeight: 1.7,
      letterSpacing: 'normal',
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TypographyMode teardown must not write settings', () => {
  it('destroy() leaves the persisted active state untouched', async () => {
    const plugin = makeTypographyPlugin();
    const mode = new TypographyMode(plugin as never);

    await mode.enable();
    expect(plugin.settings.typographyModeActive).toBe(true);
    const savesAfterEnable = plugin.saveSettings.mock.calls.length;

    mode.destroy();

    expect(plugin.settings.typographyModeActive).toBe(true);
    expect(plugin.saveSettings.mock.calls.length).toBe(savesAfterEnable);
    expect(mode.isActive()).toBe(false);
  });

  it('user disable() still persists the off state', async () => {
    const plugin = makeTypographyPlugin();
    const mode = new TypographyMode(plugin as never);

    await mode.enable();
    await mode.disable();

    expect(plugin.settings.typographyModeActive).toBe(false);
  });
});

function makeWritingModesPlugin() {
  return {
    app: {
      workspace: {
        leftSplit: null,
        rightSplit: null,
        getMostRecentLeaf: () => null,
      },
    },
    settings: { currentWritingMode: 'none' },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    activateStudio: jest.fn(),
    focusMode: { isActive: () => false, enable: jest.fn(), disable: jest.fn() },
    typographyMode: {
      isActive: () => false,
      enable: jest.fn().mockResolvedValue(undefined),
      disable: jest.fn().mockResolvedValue(undefined),
    },
    openBinder: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  Notice.messages = [];
});

describe('WritingModes teardown must not write settings', () => {
  it('destroy() leaves the persisted mode untouched', async () => {
    const plugin = makeWritingModesPlugin();
    const wm = new WritingModes(plugin as never);

    await wm.switchMode('draft');
    expect(plugin.settings.currentWritingMode).toBe('draft');
    const savesAfterSwitch = plugin.saveSettings.mock.calls.length;

    wm.destroy();

    expect(plugin.settings.currentWritingMode).toBe('draft');
    expect(plugin.saveSettings.mock.calls.length).toBe(savesAfterSwitch);
    expect(wm.getCurrentMode()).toBe('none');
  });

  it('user switch to none still persists none', async () => {
    const plugin = makeWritingModesPlugin();
    const wm = new WritingModes(plugin as never);

    await wm.switchMode('draft');
    await wm.switchMode('none');

    expect(plugin.settings.currentWritingMode).toBe('none');
  });
});

describe('startup gating (#150)', () => {
  it('TypographyMode does not restore itself at construction', () => {
    const plugin = makeTypographyPlugin();
    plugin.settings.typographyModeActive = true;

    const mode = new TypographyMode(plugin as never);

    expect(mode.isActive()).toBe(false);
  });

  it('restorePersisted() enables when both flags are set', () => {
    const plugin = makeTypographyPlugin();
    plugin.settings.typographyModeActive = true;

    const mode = new TypographyMode(plugin as never);
    mode.restorePersisted();

    expect(mode.isActive()).toBe(true);
  });

  it('restorePersisted() does nothing when persistence is off', () => {
    const plugin = makeTypographyPlugin();
    plugin.settings.typographyModeActive = true;
    plugin.settings.persistTypography = false;

    const mode = new TypographyMode(plugin as never);
    mode.restorePersisted();

    expect(mode.isActive()).toBe(false);
  });

  it('an explicit mode switch launches the studio', async () => {
    const plugin = makeWritingModesPlugin();
    const wm = new WritingModes(plugin as never);

    await wm.switchMode('draft');

    expect(plugin.activateStudio).toHaveBeenCalled();
  });
});

describe('WritingModes startup restore', () => {
  it('restore() switches silently to the saved mode', async () => {
    const plugin = makeWritingModesPlugin();
    plugin.settings.currentWritingMode = 'edit';
    const wm = new WritingModes(plugin as never);
    const spy = jest.spyOn(wm, 'switchMode');

    wm.restore();
    await Promise.all(spy.mock.results.map(r => r.value as Promise<void>));

    expect(spy).toHaveBeenCalledWith('edit', true);
    expect(wm.getCurrentMode()).toBe('edit');
    expect(Notice.messages).toEqual([]);
  });

  it('a user-initiated switch still shows a notice', async () => {
    const plugin = makeWritingModesPlugin();
    const wm = new WritingModes(plugin as never);

    await wm.switchMode('draft');

    expect(Notice.messages.length).toBe(1);
  });
});
