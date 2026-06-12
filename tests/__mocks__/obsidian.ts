export class App {}

export class TFile {
  path: string;
  extension: string;
  constructor(path = '', extension = 'md') {
    this.path = path;
    this.extension = extension;
  }
}

export class TFolder {
  path: string;
  children: (TFile | TFolder)[] = [];
  constructor(path = '') {
    this.path = path;
  }
}

export function moment(input?: Date | string): { format(fmt?: string): string } {
  const d = input !== undefined ? new Date(input) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // Local date regardless of requested format — sufficient for tests
  return { format: () => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
}

export class MarkdownView {}

export class WorkspaceLeaf {}

export class Notice {
  static messages: string[] = [];
  constructor(message = '') {
    Notice.messages.push(message);
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export class Component {
  load(): void {}
  unload(): void {}
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_el?: unknown) {}
}

export class MarkdownRenderer {
  static async render(): Promise<void> {}
}
