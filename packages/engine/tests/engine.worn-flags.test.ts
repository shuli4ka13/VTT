import { group, test, eq } from './harness.ts';
import { newPass } from '../src/engine/calc.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [
    { key: 'кд', label: 'КД', expr: { expr: '10 + if(@отравлен >= 1, 0, 2)' } },
  ] } },
  effects: {
    отравлен: { label: 'Отравлен', activation: 'passive', reapply: 'stack', modifiers: [] },
    кольцо: { label: 'Кольцо', activation: 'passive', modifiers: [] },
  },
} as unknown as System;

const book = { records: [{ id: 'к', label: 'Кольцо', grants: ['кольцо'] }] } as unknown as Compendium;
const sheet = (worn: string[], equipped: string[] = []): Sheet =>
  ({ id: 'а', values: {}, has: [...equipped.map(of => ({ of }))], effects: worn.map(effectId => ({ effectId })) } as unknown as Sheet);
const read = (s: Sheet, name: string) => newPass(system, s, { compendium: book }).resolve(name);

group('висящий эффект читается в формуле как счётчик', () => {
  test('не висит — 0, висит — 1, наложен дважды — 2', () => {
    eq(read(sheet([]), 'отравлен'), 0);
    eq(read(sheet(['отравлен']), 'отравлен'), 1);
    eq(read(sheet(['отравлен', 'отравлен']), 'отравлен'), 2);
  });

  test('выданное надетой вещью тоже висит', () => {
    eq(read(sheet([], ['к']), 'кольцо'), 1);
  });

  test('поле формулой видит состояние, а линт не считает имя висячим', () => {
    eq(read(sheet([]), 'кд'), 12);
    eq(read(sheet(['отравлен']), 'кд'), 10);
    eq(errorsOf(lintSystem(system)).length, 0);
  });
});
