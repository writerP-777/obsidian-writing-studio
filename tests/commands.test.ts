import { COMMAND_SPECS } from '../src/commands';
import en from '../src/i18n/en.json';

type JsonNode = string | { [key: string]: JsonNode };

function lookup(key: string): string | undefined {
  let node: JsonNode = en as { [key: string]: JsonNode };
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
    if (node === undefined) return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

describe('command registry integrity', () => {
  it('covers the full command surface', () => {
    expect(COMMAND_SPECS.length).toBe(19);
  });

  it('has unique kebab-case ids', () => {
    const ids = COMMAND_SPECS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every spec exactly one handler', () => {
    for (const spec of COMMAND_SPECS) {
      const handlers = [spec.run, spec.editorRun].filter(Boolean);
      expect(handlers).toHaveLength(1);
    }
  });

  it('resolves every name key to a non-empty English string', () => {
    for (const spec of COMMAND_SPECS) {
      const name = lookup(spec.nameKey);
      expect(name).toBeTruthy();
    }
  });

  it('uses sentence case command names', () => {
    for (const spec of COMMAND_SPECS) {
      const name = lookup(spec.nameKey) ?? '';
      // First character uppercase; second word onward lowercase unless a
      // proper noun (WordPress is the only one in use)
      expect(name[0]).toMatch(/[A-Z]/);
      const rest = name.split(' ').slice(1).filter(w => w !== 'WordPress');
      for (const word of rest) {
        expect(word[0]).toMatch(/[^A-Z]/);
      }
    }
  });
});
