import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { group, test, deepEq, throws } from './harness.ts';
import { dieOf } from '../src/events/trial.ts';

const root = fileURLToPath(new URL('../src/', import.meta.url));

const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = `${dir}${name}`;
  return statSync(path).isDirectory() ? files(`${path}/`) : path.endsWith('.ts') ? [path] : [];
});

group('движок детерминирован: случайность, время и id приходят снаружи', () => {
  test('в исходниках движка нет ни своей случайности, ни своих часов', () => {
    const found = files(root).filter(path => /Math\.random|Date\.now|new Date\(|randomUUID/.test(readFileSync(path, 'utf8')));
    deepEq(found.map(path => path.slice(root.length)), []);
  });

  test('проба «случайно» без переданного источника — отказ, а не тихий бросок', () => {
    throws(() => dieOf('random'), 'источник случайности');
  });
});
