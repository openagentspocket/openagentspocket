import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const CATALOGS = fileURLToPath(new URL('../../../i18n/src/catalogs/', import.meta.url));

/** Every catalog key a source file passes to `message(...)`, unescaped. */
function messageKeys(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(/message\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
    const literal = match[1] ?? '';
    const inner = literal.slice(1, -1).replaceAll("\\'", "'").replaceAll('"', '\\"');
    keys.push(JSON.parse(`"${inner}"`));
  }
  return keys;
}

describe('the words the Blocked parsers and planners use', () => {
  const sources = readdirSync(HERE).filter(
    (file) => file.endsWith('.ts') && !file.includes('.test.'),
  );
  const keys = [
    ...new Set(sources.flatMap((file) => messageKeys(readFileSync(`${HERE}${file}`, 'utf8')))),
  ];
  const english: Record<string, string> = JSON.parse(
    readFileSync(`${CATALOGS}en/app.json`, 'utf8'),
  );
  const spanish: Record<string, string> = JSON.parse(
    readFileSync(`${CATALOGS}es/app.json`, 'utf8'),
  );

  it('finds the keys', () => {
    expect(keys.length).toBeGreaterThan(30);
  });

  it.each(keys.map((key) => [key] as const))('has a catalog entry in both languages: %s', (key) => {
    expect(english[key]).toBeDefined();
    expect(spanish[key]).toBeDefined();
  });
});
