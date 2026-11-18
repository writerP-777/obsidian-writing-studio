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

const enKeys = leafKeys(load('en'));

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

// Counts a writer can meet in the interface, plus one fraction. Exact millions are
// left out on purpose: Spanish, French, and Portuguese use a separate "many" form
// only there, and i18next falls back to the "other" form for it.
const SAMPLE_COUNTS = [...Array.from({ length: 201 }, (_, n) => n), 1000, 10000, 1.5];

describe('i18n key parity', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json has identical keys to en.json`, () => {
      const localeKeys = leafKeys(load(locale));
      const missing = enKeys.filter(k => !localeKeys.includes(k));
      expect(missing).toEqual([]);
    });
  }
});

// i18next picks a plural form with Intl.PluralRules for the interface language. A form
// that is missing falls back to another form or to English, so every form a language
// selects for these counts must be written out (Arabic needs six, Russian four).
describe('i18n plural forms', () => {
  const pluralKeys = [...new Set(enKeys.filter(k => PLURAL_SUFFIX.test(k)).map(k => k.replace(PLURAL_SUFFIX, '')))];

  for (const locale of ['en', ...LOCALES]) {
    it(`${locale}.json has every plural form its language selects`, () => {
      const localeKeys = new Set(leafKeys(load(locale)));
      const rules = new Intl.PluralRules(locale);
      const needed = [...new Set(SAMPLE_COUNTS.map(n => rules.select(n)))];
      const missing = pluralKeys.flatMap(key =>
        needed.filter(form => !localeKeys.has(`${key}_${form}`)).map(form => `${key}_${form}`));
      expect(missing).toEqual([]);
    });
  }
});
