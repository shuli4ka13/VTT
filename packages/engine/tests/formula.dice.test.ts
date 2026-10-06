import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from './play.ts';
import { compile } from '../src/formula/index.ts';
import type { System } from '../src/model/types.ts';

const система = {
  id: 'ф', name: 'ф',
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 100, min: 0 },
    { key: 'порог', label: 'Крит от', kind: 'number', default: 20 },
    { key: 'сила', label: 'Сила', kind: 'number', default: 3 },
  ] } , оружие: {
      shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      bindings: [{ label: 'Удар', effect: 'удар', args: { кость: { expr: '@кость' } } }],
    } },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }, { key: 'кость', label: 'Кость урона', kind: 'dice' }],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
        {
          id: 'урон', type: 'roll',
          fixed: { expr: 'кинуть(@кость, если(@бросок.natural >= @действующий.порог, 2, 1)) + @действующий.сила' },
        },
        { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
  },
  
} as unknown as System;

const книга = {
  records: [{ id: 'меч', table: 'оружие', label: 'Меч', cells: { кость: '1к8' } }],
} as never;

const лист = (порог: number) => ({
  id: 'я', systemId: 'ф', name: 'я',
  values: { порог }, has: [{ of: 'меч' }], effects: []
} as never);

const бей = (порог: number, выпало: number) => {
  const цель = { id: 'цель', systemId: 'ф', name: 'цель', values: {}, has: [], effects: [] } as never;
  const out = exchange({ system: система, compendium: книга, die: () => выпало, sheets: [лист(порог), цель], actionId: 'меч:0', fromId: 'я', toId: 'цель' });
  return out.reports[0]!.report.trace.find((t: Record<string, unknown>) => t.step === 'урон') as Record<string, unknown>;
};

group('кость бросается прямо в формуле', () => {
  test('кость берётся из записи, прибавка и свитч — в той же строке', () => {
    eq(бей(20, 5).total, 5 + 3, 'одна кость плюс сила');
    eq(бей(20, 20).total, 20 + 20 + 3, 'двадцатка при пороге 20 — две кости');
    eq(бей(19, 19).total, 19 + 19 + 3, 'у кого крит от 19 — девятнадцать тоже крит');
    eq(бей(20, 19).total, 19 + 3, 'у остальных девятнадцать — обычный удар');
  });

  test('без кубика «кинуть» отказывает словами, а не молча', () => {
    const беда = throws(() => compile('кинуть(1)').evaluate(() => 0));
    ok(String(беда.message).includes('кинуть'), String(беда.message));
  });

  test('сколько раз кинуть — должно быть числом', () => {
    const беда = throws(() => compile('кинуть(1, 2)').evaluate(() => 0, {
      roll: () => { throw new Error('не должно дойти'); },
    }));
    ok(беда instanceof Error);
  });
});
