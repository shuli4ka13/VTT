import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scan, SRC } from './words.scan.ts';

const path = join(SRC, 'common', 'words.en.ts');
const before: Record<string, string> = JSON.parse(`{${readFileSync(path, 'utf8').split('\n').filter(line => line.startsWith('  "')).join('\n').replace(/,\s*$/, '')}}`);
const found = scan();
const ids = [...new Set(found.phrases)];
writeFileSync(path, `export const EN: Readonly<Record<string, string>> = {\n${ids.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(before[id] ?? '')},`).join('\n')}\n};\n`);
console.log(`фраз ${ids.length}, без перевода ${ids.filter(id => !before[id]).length}`);
if (found.unmarked.length) console.log(`не помечено:\n${found.unmarked.join('\n')}`);
