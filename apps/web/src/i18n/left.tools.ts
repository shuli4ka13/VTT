import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { cyrillicIn, exempt, sourcesOf } from './scan.tools.ts';

const HERE = import.meta.dirname;
const SRC = resolve(HERE, '..');
const args = process.argv.slice(2);
const write = args.includes('--write');
const wanted = args.filter(arg => !arg.startsWith('--')).map(arg => arg.replace(/^(apps\/web\/)?src\//, ''));

const all = sourcesOf(SRC).map(path => ({ rel: relative(SRC, path).split('\\').join('/'), path })).filter(file => !exempt(file.rel));
const left = new Map(all.map(file => [file.rel, cyrillicIn(file.path, readFileSync(file.path, 'utf8'))] as const));

if (write) {
  const before: string[] = JSON.parse(readFileSync(join(HERE, 'pending.json'), 'utf8'));
  const dirty = [...left].filter(([, places]) => places.length).map(([rel]) => rel).sort();
  const fresh = dirty.filter(rel => !before.includes(rel));
  if (fresh.length) {
    console.error(`в списке «ещё не переведено» этих файлов не было — список только уменьшается:\n${fresh.join('\n')}`);
    process.exit(1);
  }
  writeFileSync(join(HERE, 'pending.json'), `${JSON.stringify(dirty, null, 2)}\n`);
  const count = dirty.reduce((sum, rel) => sum + left.get(rel)!.length, 0);
  console.log(`pending.json: файлов ${dirty.length} (было ${before.length}), мест ${count}`);
} else {
  const files = wanted.length ? wanted : [...left.keys()];
  let total = 0;
  for (const rel of files) {
    const places = left.get(rel);
    if (!places) { console.log(`${rel}: нет такого файла среди проверяемых`); continue; }
    total += places.length;
    for (const place of places) console.log(`${rel}:${place.line}: ${place.text}`);
  }
  console.log(total ? `осталось мест: ${total}` : 'русских литералов нет');
  process.exit(total ? 1 : 0);
}
