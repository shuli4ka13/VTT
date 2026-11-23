import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const needle = process.argv.slice(2).join(' ').trim().toLowerCase();

const flat = (value: unknown, prefix = ''): [string, string][] =>
  Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return inner && typeof inner === 'object' ? flat(inner, path) : [[path, String(inner)] as [string, string]];
  });

if (!needle) { console.log('что искать: npx tsx src/i18n/find.tools.ts <русский текст>'); process.exit(1); }

let found = 0;
for (const name of readdirSync(join(HERE, 'ru')).filter(file => file.endsWith('.json')).sort()) {
  const area = name.replace(/\.json$/, '');
  for (const [key, text] of flat(JSON.parse(readFileSync(join(HERE, 'ru', name), 'utf8')))) {
    if (!text.toLowerCase().includes(needle)) continue;
    found += 1;
    console.log(`${text.toLowerCase() === needle ? '=' : '~'} ${area}:${key}\t${text}`);
  }
}
if (!found) console.log('в словарях такого текста нет');
