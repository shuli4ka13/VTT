import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { rowUsers, danglingRows, renameRow } from '../src/model/integrity.ts';
import type { System } from '../src/model/types.ts';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const red = () => clone(PLAYABLE_WORLDS.find(w => (w.system as System).tables?.armor_pass)!);

const withProbe = (tags: string[]) => {
  const мир = red();
  const system = мир.system as System;
  system.effects.проба = {
    label: 'Проба', activation: 'manual',
    params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
    steps: [{ type: 'each', of: 'цели' }, { type: 'emit', effect: 'damage', args: {
      amount: { expr: '10' },
      лист: { expr: '@цель' },
      источник: { expr: '@действующий' },
      ...Object.fromEntries(tags.map(tag => [tag.startsWith('по ') ? 'aim' : 'damage_type', { expr: JSON.stringify(tag) }])),
    } }],
  } as never;
  system.tables = { ...system.tables, проба: { shape: 'book', use: 'action', label: 'Проба' } } as never;
  const book = { records: [{ id: 'проба', table: 'проба', label: 'Проба', bindings: [{ label: 'Проба', effect: 'проба', args: {} }] }] };
  return { system, book };
};

const hit = (tags: string[]) => {
  const { system, book } = withProbe(tags);
  const target = { id: 'цель', values: { hp: 40, sp_body: 7, sp_head: 7 }, effects: [] };
  const out = exchange({
    system, compendium: book as never, die: () => 1, actionId: 'проба:0', fromId: 'стрелок', toId: 'цель',
    sheets: [{ id: 'стрелок', values: {}, effects: [], has: [{ of: 'проба' }] }, target] as never,
  });
  return out.sheets.find(x => x.id === 'цель')!.values;
};

group('условие шага «где у метки колонка = значение»', () => {
  test('пуля в тело упирается в броню: 10 − 7 = 3, броня тела −1', () => {
    const v = hit(['пуля', 'по телу']);
    eq(v.hp, 37);
    eq(v.sp_body, 6);
  });

  test('огонь в тело идёт мимо брони: весь урон, броня цела', () => {
    const v = hit(['огонь', 'по телу']);
    eq(v.hp, 30);
    eq(v.sp_body, 7);
  });

  test('яд в голову — тоже мимо брони, без удвоения за голову', () => {
    const v = hit(['яд', 'по голове']);
    eq(v.hp, 30);
    eq(v.sp_head, 7);
  });

  test('кровотечение без места попадания — мимо брони', () => {
    eq(hit(['кровотечение']).hp, 30);
  });

  test('строка «мимо брони» занята условием шага, переименование ведёт его за собой', () => {
    const system = red().system as System;
    ok(rowUsers(system, 'armor_pass', 'мимо брони').some(u => u.text === 'условие шага'));
    renameRow(system, 'armor_pass', 'мимо брони', 'в обход');
    eq(danglingRows(system).length, 0);
    const шаг = system.effects.damage!.steps!.at(-1) as { if: { expr: string } };
    ok(шаг.if.expr.includes('"в обход"'), шаг.if.expr);
    ok(!шаг.if.expr.includes('мимо брони'), шаг.if.expr);
  });

  test('условие ждёт строку, которой нет, — висячая ссылка словами', () => {
    const system = red().system as System;
    const шаг = system.effects.damage!.steps!.at(-1) as { if: { expr: string } };
    шаг.if.expr = шаг.if.expr.replace('мимо брони', 'сквозь стены');
    ok(danglingRows(system).some(d => d.text.includes('условие шага ждёт «сквозь стены»')));
  });
});
