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
  },
];
