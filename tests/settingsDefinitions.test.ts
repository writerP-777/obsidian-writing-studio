import { WritingStudioSettingsTab } from '../src/SettingsTab';
import type {
  SettingControl,
  SettingDefinitionItem,
  SettingDefinitionList,
  SettingDefinitionPage,
} from 'obsidian';

type CtorArgs = ConstructorParameters<typeof WritingStudioSettingsTab>;

// Mirrors every settings property the definitions bind. If a definition gains
// a key that is missing here, the shape test fails — update both together.
const baseSettings = () => ({
  openOnStartup: true,
  defaultProjectFolder: 'Projects',
  authorName: 'Don',
  defaultDocumentType: 'chapter',
  frontmatterAutoUpdate: true,
  focusUnit: 'paragraph',
  dimOpacity: 30,
  focusFontSize: 0,
  focusAutoHideSidebars: false,
  typewriterScroll: false,
  typographyFont: 'serif',
  customFontName: '',
  maxLineLength: 65,
  typographyFontSize: 18,
  lineHeight: 1.7,
  letterSpacing: '0',
  persistTypography: false,
  defaultSprintDuration: 25,
  defaultDailyWordGoal: 500,
  soundNotifications: true,
  sprintHistoryRetention: 365,
  inlineGoalBanner: true,
  appendToDailyNote: false,
  defaultExportFormat: 'md',
  defaultPaperSize: 'letter',
  defaultExportFont: 'Georgia',
  defaultExportFontSize: 12,
  pandocPath: '',
  pdfEngine: 'auto',
  pdfEnginePath: '',
  epubLanguage: 'en',
  epubIncludeCover: true,
  wordPressSites: [
    {
      id: 'site-1',
      nickname: 'My blog',
      url: 'https://example.com',
      username: 'don',
      appPassword: 'secret',
      defaultStatus: 'draft',
      wikilinkHandling: 'strip',
    },
  ],
  wikilinkHandling: 'strip',
});

function makePlugin() {
  return {
    settings: baseSettings(),
    saveSettings: jest.fn(async () => {}),
    focusMode: { applyDimOpacity: jest.fn(), applyFontSize: jest.fn() },
    typographyMode: { isActive: jest.fn(() => true), refreshStyles: jest.fn() },
    wpClient: { testConnection: jest.fn() },
  };
}

function makeTab() {
  const plugin = makePlugin();
  const tab = new WritingStudioSettingsTab({} as CtorArgs[0], plugin as unknown as CtorArgs[1]);
  return { tab, plugin };
}

interface FlatSetting {
  name: string;
  desc?: string;
  control?: SettingControl;
  hasRender: boolean;
}

// Depth-first walk over the definition tree, collecting every setting row
function flatten(items: SettingDefinitionItem[], out: FlatSetting[] = []): FlatSetting[] {
  for (const item of items) {
    if ('type' in item && (item.type === 'group' || item.type === 'list' || item.type === 'page')) {
      const children = (item as { items?: SettingDefinitionItem[] }).items;
      if (children) flatten(children, out);
      continue;
    }
    const def = item as {
      name: string;
      desc?: string | DocumentFragment;
      control?: SettingControl;
      render?: unknown;
    };
    out.push({
      name: def.name,
      desc: typeof def.desc === 'string' ? def.desc : undefined,
      control: def.control,
      hasRender: def.render !== undefined,
    });
  }
  return out;
}

const looksLikeI18nKey = (s: string) => /^(settings|exportModal)\./.test(s);

describe('getSettingDefinitions shape', () => {
  test('every declarative control key names a real settings property or a site field', () => {
    const { tab, plugin } = makeTab();
    for (const def of flatten(tab.getSettingDefinitions())) {
      if (!def.control) continue;
      const key = def.control.key;
      const m = key.match(/^wpSite\.(.+)\.(\w+)$/);
      if (m) {
        const site = plugin.settings.wordPressSites.find(s => s.id === m[1]);
        expect(site).toBeDefined();
        expect(Object.keys(plugin.settings.wordPressSites[0])).toContain(m[2]);
      } else {
        expect(Object.keys(plugin.settings)).toContain(key);
      }
    }
  });

  test('every name and desc resolves to a translated string, not a raw key', () => {
    const { tab } = makeTab();
    for (const def of flatten(tab.getSettingDefinitions())) {
      expect(looksLikeI18nKey(def.name)).toBe(false);
      if (def.desc !== undefined) expect(looksLikeI18nKey(def.desc)).toBe(false);
    }
  });

  test('dropdown option labels resolve too', () => {
    const { tab } = makeTab();
    for (const def of flatten(tab.getSettingDefinitions())) {
      if (def.control?.type !== 'dropdown') continue;
      for (const label of Object.values(def.control.options)) {
        expect(looksLikeI18nKey(label)).toBe(false);
      }
    }
  });

  test('top-level page names are unique', () => {
    const { tab } = makeTab();
    const names = tab.getSettingDefinitions()
      .filter((i): i is SettingDefinitionPage => 'type' in i && i.type === 'page')
      .map(p => p.name);
    expect(names).toEqual([...new Set(names)]);
    expect(names).toHaveLength(7);
  });

  test('app password and test connection render imperatively; nothing else does', () => {
    const { tab } = makeTab();
    const rendered = flatten(tab.getSettingDefinitions()).filter(d => d.hasRender);
    expect(rendered.map(d => d.name).sort()).toEqual(['Application password', 'Test connection']);
  });

  test('one site page per configured site, named by nickname with the url surfaced', () => {
    const { tab, plugin } = makeTab();
    plugin.settings.wordPressSites.push({
      id: 'site-2', nickname: '', url: 'https://b.example', username: '',
      appPassword: '', defaultStatus: 'draft', wikilinkHandling: 'strip',
    });
    const wpPage = tab.getSettingDefinitions()
      .filter((i): i is SettingDefinitionPage => 'type' in i && i.type === 'page')
      .find(p => p.name === 'WordPress');
    const list = (wpPage?.items ?? []).find(
      (i): i is SettingDefinitionList => 'type' in i && i.type === 'list',
    );
    const sitePages = (list?.items ?? []).filter(
      (i): i is SettingDefinitionPage => 'type' in i && i.type === 'page',
    );
    expect(sitePages.map(p => p.name)).toEqual(['My blog', 'Unnamed']);
    const dv = sitePages[0].displayValue;
    expect(typeof dv === 'function' ? dv() : dv).toBe('https://example.com');
  });
});

describe('getControlValue', () => {
  test('plain keys read from plugin settings', () => {
    const { tab } = makeTab();
    expect(tab.getControlValue('dimOpacity')).toBe(30);
    expect(tab.getControlValue('defaultProjectFolder')).toBe('Projects');
  });

  test('wpSite keys route to the matching site', () => {
    const { tab } = makeTab();
    expect(tab.getControlValue('wpSite.site-1.nickname')).toBe('My blog');
    expect(tab.getControlValue('wpSite.site-1.defaultStatus')).toBe('draft');
    expect(tab.getControlValue('wpSite.missing.nickname')).toBeUndefined();
  });
});

describe('setControlValue', () => {
  test('persists a plain key', async () => {
    const { tab, plugin } = makeTab();
    await tab.setControlValue('authorName', 'New name');
    expect(plugin.settings.authorName).toBe('New name');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  test('dispatches the focus-mode side effects', async () => {
    const { tab, plugin } = makeTab();
    await tab.setControlValue('dimOpacity', 40);
    expect(plugin.focusMode.applyDimOpacity).toHaveBeenCalledTimes(1);
    await tab.setControlValue('focusFontSize', 16);
    expect(plugin.focusMode.applyFontSize).toHaveBeenCalledTimes(1);
  });

  test('refreshes typography styles only while typography mode is active', async () => {
    const { tab, plugin } = makeTab();
    await tab.setControlValue('typographyFont', 'lora');
    expect(plugin.typographyMode.refreshStyles).toHaveBeenCalledTimes(1);
    plugin.typographyMode.isActive.mockReturnValue(false);
    await tab.setControlValue('typographyFont', 'inter');
    expect(plugin.typographyMode.refreshStyles).toHaveBeenCalledTimes(1);
  });

  test('coerces an empty epub language to en', async () => {
    const { tab, plugin } = makeTab();
    await tab.setControlValue('epubLanguage', '   ');
    expect(plugin.settings.epubLanguage).toBe('en');
    await tab.setControlValue('epubLanguage', ' fr ');
    expect(plugin.settings.epubLanguage).toBe('fr');
  });

  test('wpSite keys mutate the matching site and persist', async () => {
    const { tab, plugin } = makeTab();
    await tab.setControlValue('wpSite.site-1.url', 'https://new.example');
    expect(plugin.settings.wordPressSites[0].url).toBe('https://new.example');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    await tab.setControlValue('wpSite.missing.url', 'https://x');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe('numeric validation', () => {
  function validatorFor(key: string) {
    const { tab } = makeTab();
    const def = flatten(tab.getSettingDefinitions()).find(d => d.control?.key === key);
    const control = def?.control as { validate?: (v: number) => string | undefined } | undefined;
    if (!control?.validate) throw new Error(`no validator on ${key}`);
    return control.validate;
  }

  test('focus font size accepts 0 (clears the override) and 8-72', () => {
    const v = validatorFor('focusFontSize');
    expect(v(0)).toBeUndefined();
    expect(v(8)).toBeUndefined();
    expect(v(72)).toBeUndefined();
    expect(typeof v(5)).toBe('string');
    expect(typeof v(73)).toBe('string');
    expect(typeof v(16.5)).toBe('string');
  });

  test('range validators enforce the pre-migration bounds', () => {
    const cases: Array<[string, number, number]> = [
      ['typographyFontSize', 8, 72],
      ['defaultSprintDuration', 1, 600],
      ['defaultDailyWordGoal', 0, 1000000],
      ['sprintHistoryRetention', 1, 3650],
      ['defaultExportFontSize', 6, 72],
    ];
    for (const [key, min, max] of cases) {
      const v = validatorFor(key);
      expect(v(min)).toBeUndefined();
      expect(v(max)).toBeUndefined();
      expect(typeof v(min - 1)).toBe('string');
      expect(typeof v(max + 1)).toBe('string');
    }
  });

  test('validation messages carry the interpolated bounds', () => {
    const v = validatorFor('defaultSprintDuration');
    const msg = v(0);
    expect(msg).toContain('1');
    expect(msg).toContain('600');
  });
});

describe('site list mutation', () => {
  test('add creates a site and re-renders; delete removes by index', async () => {
    const { tab, plugin } = makeTab();
    const update = jest.spyOn(tab, 'update');
    const priv = tab as unknown as {
      addWordPressSite(): Promise<void>;
      deleteWordPressSite(index: number): Promise<void>;
    };
    await priv.addWordPressSite();
    expect(plugin.settings.wordPressSites).toHaveLength(2);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    await priv.deleteWordPressSite(0);
    expect(plugin.settings.wordPressSites).toHaveLength(1);
    expect(plugin.settings.wordPressSites[0].id).not.toBe('site-1');
    expect(update).toHaveBeenCalledTimes(2);
  });
});
