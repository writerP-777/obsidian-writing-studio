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
      // Skip sentence-case check on symbol/emoji-prefixed strings; bot uses an older rule version that flags them.
      "obsidianmd/ui/sentence-case": ["error", {
        enforceCamelCaseLower: true,
        ignoreRegex: ["^[^A-Za-z(']"]
      }]
    }
  },
];
