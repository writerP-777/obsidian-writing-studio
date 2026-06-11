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

export class Notice {
  static messages: string[] = [];
  constructor(message = '') {
    Notice.messages.push(message);
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}
