import { WritingStudioSettingsTab } from '../src/SettingsTab';

// Runtime members of Obsidian's SettingTab base class that are NOT declared
// in the public obsidian.d.ts (harvested from Obsidian 1.13.1 app.js). Because
// they are invisible to TypeScript, a same-named member here compiles cleanly
// but silently shadows the app's own machinery at runtime. That is exactly how
// #135 happened: Obsidian 1.13 made tab.renderTab() the entry point for
// opening a settings tab, and our private helper of the same name swallowed
// the call — the settings pane opened blank with no error.
//
// display() and hide() are deliberately not listed: they are the documented
// extension points, and overriding them is correct.
//
// When a new Obsidian version lands, re-harvest with:
//   npx @electron/asar extract-file %APPDATA%\obsidian\obsidian-X.Y.Z.asar app.js
// then search app.js for `prototype.<name>=function` on the SettingTab base.
const RESERVED_SETTING_TAB_MEMBERS = [
  'renderTab',
  'settingItems',
  'renderedItems',
  'refreshDomState',
  'getElementForDefinition',
  'getDefinitionForElement',
];

type CtorArgs = ConstructorParameters<typeof WritingStudioSettingsTab>;

describe('WritingStudioSettingsTab must not shadow SettingTab internals', () => {
  test('no prototype member collides with a reserved base-class member', () => {
    const ownMembers = Object.getOwnPropertyNames(WritingStudioSettingsTab.prototype);
    const collisions = ownMembers.filter(n => RESERVED_SETTING_TAB_MEMBERS.includes(n));
    expect(collisions).toEqual([]);
  });

  test('no instance field collides with a reserved base-class member', () => {
    const tab = new WritingStudioSettingsTab({} as CtorArgs[0], {} as CtorArgs[1]);
    const collisions = Object.keys(tab).filter(n => RESERVED_SETTING_TAB_MEMBERS.includes(n));
    expect(collisions).toEqual([]);
  });
});
