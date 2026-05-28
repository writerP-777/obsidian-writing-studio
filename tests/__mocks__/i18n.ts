import en from '../../src/i18n/en.json';

type JsonNode = string | { [key: string]: JsonNode };

function lookup(obj: { [key: string]: JsonNode }, key: string): string {
  const parts = key.split('.');
  let node: JsonNode = obj;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return key;
    node = node[part];
    if (node === undefined) return key;
  }
  return typeof node === 'string' ? node : key;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let value = lookup(en as { [key: string]: JsonNode }, key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return value;
}

export function initI18n(): void { /* no-op in tests */ }
