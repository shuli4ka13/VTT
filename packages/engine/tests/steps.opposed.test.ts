import { group, test, eq, ok, deepEq } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'пулы', name: 'пулы',
  fields: [
    { tag: 'ловкость', label: 'Ловкость', value: { kind: 'stored', type: 'number', default: 3 } },
    { tag: 'стрельба', label: 'Стрельба', value: { kind: 'stored', type: 'number', default: 3 } },
    { tag: 'реакция', label: 'Реакция', value: { kind: 'stored', type: 'number', default: 2 } },
    { tag: 'хп', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } },
  ],
  constants: {
    пул_атаки: { label: 'Пул атаки', kind: 'die', dice: [{ count: { expr: '@отправитель.ловкость + @отправитель.стрельба' }, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
    пул_защиты: { label: 'Пул защиты', kind: 'die', dice: [{ count: { expr: '@получатель.реакция' }, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  },
  rolls: [{ tag: 'защита', label: 'Защита' }],
  effects: {
    вырваться: {
      label: 'Вырваться', activation: 'manual',
      steps: [
        {
          id: 'вырвался', type: 'threshold', side: 'target', roll: { die: { constant: 'пул_защиты' } },
          versus: { roll: { die: { constant: 'пул_атаки' } } }, successWhen: 'atLeast',
        },
      ],
    },
    выстрел: {
      label: 'Выстрел', activation: 'manual',
      steps: [
        {
          id: 'попал', type: 'threshold', roll: { die: { constant: 'пул_атаки' } },
          versus: { roll: { die: { constant: 'пул_защиты' }, check: 'защита' } }, successWhen: 'over',
        },
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '2 + @попал.margin' } },
      ],
    },
  },
  records: { приём: { kind: 'action', label: 'Приём' } },
} as unknown as System;

const book = { items: [], actions: [{ id: 'выстрел', rk: 'приём', label: 'Выстрел', effect: 'выстрел' }, { id: 'вырваться', rk: 'приём', label: 'Вырваться', effect: 'вырваться' }] } as unknown as Compendium;
const sheet = (id: string, effects: unknown[] = []): Sheet =>
  ({ id, systemId: 'пулы', kind: 'pc', name: id, values: {}, equipped: [], effects, actions: ['выстрел', 'вырваться'] } as unknown as Sheet);

const queue = (...values: number[]) => () => values.shift() ?? 1;

const shoot = (senderDice: number[], receiverDice: number[], target = sheet('цель')) => {
  const env = send('выстрел:0', { system, sheet: sheet('стрелок'), compendium: book, die: queue(...senderDice) });
  return receive(env, { system, sheet: target, compendium: book, die: queue(...receiverDice) });
};

group('встречный бросок: каждая сторона бросает свой пул', () => {
  test('6 костей атаки (3 успеха) против 2 костей защиты (1 успех) — чистых 2, урон 4', () => {
    const out = shoot([6, 5, 5, 1, 2, 3], [6, 1]);
    eq(out.sheet.values.хп, 10 - 4);
    const hit = out.results.попал as { margin: number; against: { natural: number } };
    eq(hit.margin, 2);
    eq(hit.against.natural, 1);
  });

  test('защита бросается костями получателя, а не отправителя', () => {
    const out = shoot([6, 6, 1, 1, 1, 1], [5, 5]);
    eq((out.results.попал as { success: boolean }).success, false, '2 успеха против 2 — ничья у защиты');
  });

  test('в журнале видно обе стороны', () => {
    const line = JSON.stringify(shoot([6, 5, 5, 1, 2, 3], [6, 1]).report.trace);
    ok(line.includes('"against"'), line.slice(0, 200));
  });

  test('проверка со встречным броском проходит линт', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
  });

  test('зеркально: бросает получатель, встречно — отправитель при сборке', () => {
    const env = send('вырваться:0', { system, sheet: sheet('держит'), compendium: book, die: queue(5, 1, 1, 1, 1, 1) });
    const out = receive(env, { system, sheet: sheet('рвётся'), compendium: book, die: queue(6, 6) });
    const got = out.results.вырвался as { success: boolean; natural: number; against: { natural: number } };
    eq(got.against.natural, 1, 'пул отправителя брошен у отправителя: один успех');
    eq(got.natural, 2);
    eq(got.success, true);
  });
});
