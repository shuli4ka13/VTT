import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const ENGINE = join(HERE, '..', '..', '..', '..', 'packages', 'engine', 'src', 'words', 'en');
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
  const english = Object.fromEntries(flat(JSON.parse(readFileSync(join(HERE, 'en', name), 'utf8'))));
  for (const [key, text] of flat(JSON.parse(readFileSync(join(HERE, 'ru', name), 'utf8')))) {
    if (!text.toLowerCase().includes(needle)) continue;
    found += 1;
    console.log(`${text.toLowerCase() === needle ? '=' : '~'} ${area}:${key}\t${text}\t→ ${english[key] ?? ''}`);
  }
}
for (const name of readdirSync(ENGINE).filter(file => file.endsWith('.ts') && file !== 'index.ts').sort()) {
  const lines = readFileSync(join(ENGINE, name), 'utf8').split('\n').filter(line => line.startsWith('  "'));
  const table = JSON.parse(`{${lines.join('\n').replace(/,\s*$/, '')}}`) as Record<string, string>;
  for (const [text, english] of Object.entries(table)) {
    if (!text.toLowerCase().includes(needle)) continue;
    found += 1;
    console.log(`${text.toLowerCase() === needle ? '=' : '~'} слово движка (${name.replace(/\.ts$/, '')})\t${text}\t→ ${english}`);
  }
}
if (!found) console.log('в словарях и в словах движка такого текста нет');
