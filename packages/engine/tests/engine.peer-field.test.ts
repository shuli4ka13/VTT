import { group, test, eq } from './harness.ts';
import { Views } from '../src/core/view.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: {
      shape: 'single',
      columns: [
        { key: 'навык', label: 'Навык', kind: 'number' },
        { key: 'водитель', label: 'Водитель', kind: 'sheet' },
        { key: 'управление', label: 'Управление', kind: 'number', expr: { expr: 'if(empty(@водитель), 0, @водитель.навык)' } },
      ],
    },
  },
  effects: {},
} as unknown as System;
const compendium = { records: [] } as unknown as Compendium;
const sheet = (id: string, values: Record<string, unknown>): Sheet => ({ id, systemId: 'x', name: id, values, has: [], effects: [] } as unknown as Sheet);

group('поле листа через поле-лист', () => {
  test('формула читает поле листа, на который указывает поле', () => {
    const sheets = [sheet('машина', { водитель: 'рокер' }), sheet('рокер', { навык: 5 })];
    eq(new Views(system, compendium).of(sheets, 'машина').resolve('управление'), 5);
  });

  test('пустая ссылка — ноль по формуле', () => {
    eq(new Views(system, compendium).of([sheet('машина', {})], 'машина').resolve('управление'), 0);
  });
});

import { errorsOf, lintSystem } from '../src/model/lint.ts';
group('поле листа через поле-лист: проверка системы', () => {
  test('не ошибка «Проблем»', () => {
    eq(errorsOf(lintSystem(system, compendium)).map(p => p.text).join('\n'), '');
  });
});
