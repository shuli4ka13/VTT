import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC, places } from './tongue.scan.ts';

const groups = process.argv.slice(2);
if (!groups.length) { console.log('какую группу проверить: npx tsx packages/engine/tests/tongue.check.ts <группа> …'); process.exit(1); }

let bad = 0;
for (const group of groups) {
  const text = readFileSync(join(SRC, 'words', 'en', `${group}.ts`), 'utf8');
  const lines = text.split('\n').filter(line => line.startsWith('  "'));
  let table: Record<string, string>;
  try { table = JSON.parse(`{${lines.join('\n').replace(/,\s*$/, '')}}`); } catch (err) {
    console.log(`${group}: файл не разбирается — каждая строка обязана иметь вид   "русская фраза": "english phrase",  (${(err as Error).message})`);
    bad += 1;
    continue;
  }
  const empty = Object.entries(table).filter(([, value]) => !value.trim()).map(([id]) => id);
  const off = Object.entries(table).filter(([id, value]) => value.trim() && places(id).join() !== places(value).join()).map(([id]) => id);
  const spoken = Object.entries(table).filter(([, value]) => /[Ѐ-ӿ]/u.test(value)).map(([id]) => id);
  for (const id of empty.slice(0, 10)) console.log(`${group}: нет перевода — ${id}`);
  for (const id of off) console.log(`${group}: места {0}, {1} не совпали — ${id}`);
  for (const id of spoken) console.log(`${group}: в переводе остались русские буквы — ${id}`);
  console.log(`${group}: фраз ${Object.keys(table).length}, без перевода ${empty.length}, не те места ${off.length}, с русскими буквами ${spoken.length}`);
  bad += empty.length + off.length + spoken.length;
}
process.exit(bad ? 1 : 0);
