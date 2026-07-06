import type { Editor, MarkdownView, MarkdownFileInfo } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { t } from './i18n';

export interface CommandSpec {
  id: string;
  nameKey: string;
  run?: (plugin: WritingStudioPlugin) => void | Promise<void>;
  editorRun?: (plugin: WritingStudioPlugin, editor: Editor, view: MarkdownView | MarkdownFileInfo) => void;
}

// The full command palette surface, as data. Each spec calls one entry-point
// method on the plugin facade — no modals or views are imported here, which
// keeps the table loadable in tests without an Obsidian instance.
// Naming convention (enforced by tests/commands.test.ts): sentence case,
// verb-first ("Open …", "Toggle …", "Create …"). Command ids are permanent —
// user hotkeys bind to them — so rename names freely but never ids.
export const COMMAND_SPECS: CommandSpec[] = [
  { id: 'open-launcher', nameKey: 'main.cmd.openLauncher', run: p => p.openLauncher() },
  { id: 'open-binder', nameKey: 'main.cmd.openBinder', run: p => p.openBinder() },
  { id: 'toggle-focus-mode', nameKey: 'main.cmd.toggleFocusMode', run: p => { p.focusMode.toggle(); } },
  { id: 'toggle-typography-mode', nameKey: 'main.cmd.toggleTypographyMode', run: p => p.typographyMode.toggle() },
  { id: 'switch-draft-mode', nameKey: 'main.cmd.switchDraftMode', run: p => p.writingModes.switchMode('draft') },
  { id: 'switch-edit-mode', nameKey: 'main.cmd.switchEditMode', run: p => p.writingModes.switchMode('edit') },
  { id: 'switch-review-mode', nameKey: 'main.cmd.switchReviewMode', run: p => p.writingModes.switchMode('review') },
  { id: 'start-sprint', nameKey: 'main.cmd.startSprint', run: p => { p.startSprint(); } },
  { id: 'export-document', nameKey: 'main.cmd.exportDocument', run: p => { p.exportDocument(); } },
  { id: 'export-project', nameKey: 'main.cmd.exportProject', run: p => { p.exportProject(); } },
  { id: 'preview-manuscript', nameKey: 'main.cmd.previewManuscript', run: p => p.openCompilePreview() },
  { id: 'publish-wordpress', nameKey: 'main.cmd.publishWordPress', run: p => { p.publishCurrentFile(); } },
  { id: 'new-project', nameKey: 'main.cmd.newProject', run: p => { p.newProject(); } },
  { id: 'open-dashboard', nameKey: 'main.cmd.openDashboard', run: p => { p.openWritingDashboard(); } },
  { id: 'open-targets-dashboard', nameKey: 'main.cmd.openTargetsDashboard', run: p => { p.openTargetsDashboard(); } },
  { id: 'set-word-count-goal', nameKey: 'main.cmd.setWordCountGoal', editorRun: (p, _editor, view) => { p.setWordCountGoal(view.file); } },
  { id: 'open-writing-log', nameKey: 'main.cmd.openWritingLog', run: p => p.openWritingLog() },
  { id: 'open-folder-sidebar', nameKey: 'main.cmd.openFolderSidebar', run: p => { p.openFolderPicker(); } },
  { id: 'add-files-to-binder', nameKey: 'main.cmd.addFilesToBinder', run: p => p.addFilesToBinder() },
  { id: 'preview-carry-over', nameKey: 'main.cmd.previewCarryOver', run: p => p.previewCarryOver() },
];

export function registerCommands(plugin: WritingStudioPlugin): void {
  for (const spec of COMMAND_SPECS) {
    const { run, editorRun } = spec;
    if (editorRun) {
      plugin.addCommand({
        id: spec.id,
        name: t(spec.nameKey),
        editorCallback: (editor, view) => { editorRun(plugin, editor, view); },
      });
    } else if (run) {
      plugin.addCommand({
        id: spec.id,
        name: t(spec.nameKey),
        callback: () => { void run(plugin); },
      });
    }
  }
}
