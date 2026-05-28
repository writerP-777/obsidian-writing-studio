import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(__dirname, '../src/i18n');
const LOCALES = ['zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt-BR', 'ru', 'ja', 'de', 'ko'];

type JsonNode = string | { [key: string]: JsonNode };

function leafKeys(obj: { [key: string]: JsonNode }, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      keys.push(...leafKeys(v as { [key: string]: JsonNode }, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

function load(locale: string): { [key: string]: JsonNode } {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf-8')) as { [key: string]: JsonNode };
}

describe('i18n key parity', () => {
  const enKeys = leafKeys(load('en'));

  for (const locale of LOCALES) {
    it(`${locale}.json has identical keys to en.json`, () => {
      const localeKeys = leafKeys(load(locale));
      const missing = enKeys.filter(k => !localeKeys.includes(k));
      expect(missing).toEqual([]);
    });
  }
});
