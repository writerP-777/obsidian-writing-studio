export class App {}

export interface EventRef {
  name: string;
  callback: (...data: unknown[]) => unknown;
}

export class Events {
  private handlers = new Map<string, Set<(...data: unknown[]) => unknown>>();

  on(name: string, callback: (...data: unknown[]) => unknown): EventRef {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(callback);
    return { name, callback };
  }

  off(name: string, callback: (...data: unknown[]) => unknown): void {
    this.handlers.get(name)?.delete(callback);
  }

  offref(ref: EventRef): void {
    this.off(ref.name, ref.callback);
  }

  trigger(name: string, ...data: unknown[]): void {
    for (const cb of this.handlers.get(name) ?? []) cb(...data);
  }
}

export class TFile {
  path: string;
  extension: string;
  name: string;
  constructor(path = '', extension = 'md') {
    this.path = path;
    this.extension = extension;
    this.name = path.split('/').pop() ?? '';
  }
}

export class TFolder {
  path: string;
  name: string;
  children: (TFile | TFolder)[] = [];
  constructor(path = '') {
    this.path = path;
    this.name = path.split('/').pop() ?? '';
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

export class FileSystemAdapter {}

export function getLanguage(): string {
  return 'en';
}

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

// Minimal base so modules importing modal classes load; tests never open one
export class Modal {
  app: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class FuzzySuggestModal extends Modal {}

export class TAbstractFile {}

// Minimal view base so view modules load and construct; the app rides in on
// the leaf, as in the real API. Rendering is never driven in tests.
export class ItemView extends Component {
  leaf: unknown;
  app: unknown;
  constructor(leaf: unknown) {
    super();
    this.leaf = leaf;
    this.app = (leaf as { app?: unknown } | undefined)?.app;
  }
  registerEvent(_ref?: unknown): void {}
  registerDomEvent(): void {}
}

export class Menu {
  addItem(): this {
    return this;
  }
  addSeparator(): this {
    return this;
  }
  showAtMouseEvent(): void {}
}

export function setIcon(): void {}

export function setTooltip(): void {}
