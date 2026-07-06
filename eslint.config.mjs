import tsparser from "./node_modules/eslint-plugin-obsidianmd/node_modules/@typescript-eslint/parser/dist/index.js";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json"
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": "off",
      // Advisory rule new in 0.4.1: adopting getSettingDefinitions() is a
      // real refactor of the tabbed settings surface, tracked as its own
      // issue — off until that ships, not suppressed inline.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off"
    }
  },
];
