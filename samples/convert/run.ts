import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convert } from './index.ts';

const dir = fileURLToPath(new URL('../', import.meta.url));
const given = process.argv.slice(2);
const paths = given.length ? given : readdirSync(dir).filter(file => file.endsWith('.world.json')).map(name => `${dir}${name}`);

for (const path of paths) {
  const world = convert(JSON.parse(readFileSync(path, 'utf8')));
  writeFileSync(path, `${JSON.stringify(world, null, 2)}\n`);
  console.log(path.split('/').pop(), Object.keys(world.system.tables ?? {}).length, 'таблиц');
}
