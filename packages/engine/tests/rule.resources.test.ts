import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { fireMoments } from '../src/events/moments.ts';
import { spendAction, startCombat, idleClock, limitOf } from '../src/engine/clock.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'r', name: 'r',
  fields: [
    { tag: 'уровень', label: 'Уровень', value: { kind: 'stored', type: 'number', default: 5 } },
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 40, min: 0 } },
    { tag: 'ячейки_1', label: 'Ячейки 1-го круга', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
    { tag: 'ячейки_2', label: 'Ячейки 2-го круга', value: { kind: 'stored', type: 'number', default: 0, min: 0 } },
    { tag: 'ячейки_1_всего', label: 'Всего ячеек 1-го круга', value: { kind: 'stored', type: 'number', default: 4 } },
    { tag: 'атак', label: 'Атак за действие', value: { kind: 'formula', expr: '#уровень >= 5 ? 2 : 1' } },
  ],
  action_types: { атака: { label: 'Атака', perTurnField: 'атак' }, действие: { label: 'Действие', perTurn: 1 } },
  events: {
    ячейка: {
      label: 'Ячейка заклинания',
      receive: [
        { id: 'есть_1', type: 'compare', value: { tag: 'ячейки_1' }, versus: { const: 1 }, breakIf: 'less', when: { ref: 'event.amount', is: 1 } },
        { type: 'apply', target: { tag: 'ячейки_1' }, direction: 'subtract', value: { const: 1 }, when: { ref: 'event.amount', is: 1 } },
        { id: 'есть_2', type: 'compare', value: { tag: 'ячейки_2' }, versus: { const: 1 }, breakIf: 'less', when: { ref: 'event.amount', is: 2 } },
        { type: 'apply', target: { tag: 'ячейки_2' }, direction: 'subtract', value: { const: 1 }, when: { ref: 'event.amount', is: 2 } },
      ],
    },
  },
  effects: {
    стрела: {
      label: 'Волшебная стрела', activation: 'manual', cost: 'действие',
      params: [{ key: 'круг', label: 'Каким кругом', kind: 'number', ask: { by: 'actor', kind: 'number', min: 1, max: 2 } }],
      self: [{ type: 'emit', event: 'ячейка', amount: { param: 'круг' }, strict: true }],
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d4' }, count: { expr: '2 + #круг' }, bonus: { expr: '2 + #круг' } },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { ref: 'урон' } },
      ],
    },
    скрытая: {
      label: 'Скрытая атака', activation: 'manual', cost: 'атака',
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d6' }, count: { expr: 'ceil(#уровень / 2)' } },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { ref: 'урон' } },
      ],
    },
    сон: {
      label: 'Долгий отдых: ячейки', activation: 'triggered', trigger: { on: 'moment:long-rest' },
      steps: [{ type: 'apply', target: { tag: 'ячейки_1' }, direction: 'set', value: { expr: '#ячейки_1_всего', of: 'target' } }],
    },
  },
  room_rules: ['сон'],
  records: {
    чары: { kind: 'action', label: 'Чары', props: [], bindings: [{ label: 'Сотворить', effect: 'стрела', args: {} }] },
    приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Ударить', effect: 'скрытая', args: {} }] },
  },
} as unknown as System;
const book = { items: [], actions: [
  { id: 'стрела', rk: 'чары', label: 'Волшебная стрела', props: {} },
  { id: 'скрытая', rk: 'приём', label: 'Скрытая атака', props: {} },
] } as unknown as Compendium;
const sheet = (id: string, values: Record<string, number> = {}): Sheet => ({
  id, systemId: 'r', kind: 'pc', name: id, values, equipped: [], effects: [], actions: ['стрела', 'скрытая'],
} as unknown as Sheet);
const cast = (slot: number, sheets = [sheet('маг'), sheet('цель')]) => exchange({
  system, compendium: book, die: () => 3, sheets, actionId: 'стрела:0', fromId: 'маг', toId: 'цель', inputs: { круг: slot },
});

group('счёт костей числом и названное игроком в формулах', () => {
  test('образец чист для линта: имена потребностей в формулах — не поля', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
  });

  test('«круг» из вопроса входит и в число костей, и в прибавку', () => {
    const out = cast(1);
    const trace = out.reports.at(-1)!.report.trace[0] as { rolls: number[]; bonus: number; times: number };
    eq(trace.rolls.length, 3, 'две кости плюс круг');
    eq(trace.times, 3);
    eq(trace.bonus, 3);
    eq(out.sheets.find(s => s.id === 'цель')!.values.хиты, 40 - 9 - 3);
  });

  test('кости по формуле от уровня: скрытая атака пятого уровня — три кости', () => {
    const out = exchange({
      system, compendium: book, die: () => 6, sheets: [sheet('плут'), sheet('цель')],
      actionId: 'скрытая:0', fromId: 'плут', toId: 'цель',
    });
    eq((out.reports[0]!.report.trace[0] as { rolls: number[] }).rolls.length, 3);
  });

  test('ноль раз — костей нет вовсе, а шаг не падает', () => {
    const none = { ...system, effects: { ...system.effects, скрытая: { ...system.effects.скрытая, steps: [
      { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d6' }, count: { const: 0 }, bonus: { const: 2 } },
      { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { ref: 'урон' } },
    ] } } } as unknown as System;
    const out = exchange({
      system: none, compendium: book, die: () => { throw new Error('кость не должна кидаться'); },
      sheets: [sheet('плут'), sheet('цель')], actionId: 'скрытая:0', fromId: 'плут', toId: 'цель',
    });
    eq(out.sheets.find(s => s.id === 'цель')!.values.хиты, 38);
  });
});

group('плата ресурсом: общий эффект оборвался — действие не состоялось', () => {
  test('ячейка есть — тратится одна, заклинание проходит', () => {
    const out = cast(1);
    eq(out.sheets.find(s => s.id === 'маг')!.values.ячейки_1, 0);
  });

  test('ячейки нет — отказ словами, с именем поля и остатком', () => {
    throws(() => cast(2), 'не хватает «Ячейки 2-го круга»');
    throws(() => cast(1, [sheet('маг', { ячейки_1: 0 }), sheet('цель')]), 'сейчас 0');
  });
});

group('отдых — момент, как начало хода', () => {
  test('долгий отдых возвращает ячейки по формуле листа', () => {
    const tired = sheet('маг', { ячейки_1: 0 });
    const out = fireMoments([{ moment: 'long-rest', sheetId: 'маг' }], [tired], { system, compendium: book, die: () => 1 });
    eq(out.sheets[0]!.values.ячейки_1, 4);
    eq(fireMoments([{ moment: 'short-rest', sheetId: 'маг' }], [tired], { system, compendium: book, die: () => 1 }).reports.length, 0);
  });
});

group('лимит действий с листа', () => {
  test('у пятого уровня две атаки за ход, третья — отказ; у первого — одна', () => {
    const clock = startCombat(idleClock(), ['воин']);
    const strike = system.effects.скрытая!;
    const five = (tag: string) => (tag === 'атак' ? 2 : undefined);
    const once = spendAction(system, clock, 'воин', strike, five);
    const twice = spendAction(system, once, 'воин', strike, five);
    throws(() => spendAction(system, twice, 'воин', strike, five), '2 из 2');
    throws(() => spendAction(system, once, 'воин', strike, () => 1), '1 из 1');
    eq(limitOf({ perTurn: 1 }), 1);
    eq(limitOf({ perTurnField: 'атак' }), null, 'без листа лимит из поля не читается');
    ok(limitOf(undefined) === null);
  });
});
