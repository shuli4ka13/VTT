import { group, test, eq, ok } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
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
    steps: [{ type: 'emit', event: 'damage', amount: { const: 10 }, tags }],
  } as never;
  system.records = { ...system.records, проба: { kind: 'action', label: 'Проба' } } as never;
  const book = { items: [], actions: [{ id: 'проба', rk: 'проба', label: 'Проба', effect: 'проба' }] };
  return { system, book };
};

const hit = (tags: string[]) => {
  const { system, book } = withProbe(tags);
  const target = { id: 'цель', values: { hp: 40, sp_body: 7, sp_head: 7 }, effects: [] };
  const env = send('проба:0', { system, sheet: { id: 'стрелок', values: {}, effects: [], actions: ['проба'] }, compendium: book, die: () => 1 });
  return receive(env, { system, sheet: target, compendium: book, die: () => 1 }).sheet.values;
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
    const шаг = system.effects.damage!.steps!.at(-1) as { when: { where: { is: string } } };
    eq(шаг.when.where.is, 'в обход');
  });

  test('условие ждёт строку, которой нет, — висячая ссылка словами', () => {
    const system = red().system as System;
    (system.effects.damage!.steps!.at(-1) as { when: { where: { is: string } } }).when.where.is = 'сквозь стены';
    ok(danglingRows(system).some(d => d.text.includes('условие шага ждёт «сквозь стены»')));
  });
});
