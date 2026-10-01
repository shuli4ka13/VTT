import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'пулы', name: 'пулы',
  constants: {
    пул_атаки: { label: 'Пул атаки', kind: 'die', dice: [{ count: { expr: '@отправитель.ловкость + @отправитель.стрельба' }, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
    пул_защиты: { label: 'Пул защиты', kind: 'die', dice: [{ count: { expr: '@получатель.реакция' }, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  },
  tables: { лист: { shape: 'single', columns: [
    { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 3 },
    { key: 'стрельба', label: 'Стрельба', kind: 'number', default: 3 },
    { key: 'реакция', label: 'Реакция', kind: 'number', default: 2 },
    { key: 'хп', label: 'Хиты', kind: 'number', default: 10 },
  ] }, rolls: { label: 'Броски', key: 'word', rows: [{ value: 'защита' }] } , приём: { shape: 'book', use: 'action', label: 'Приём' } },
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
          versus: { roll: { die: { constant: 'пул_защиты' }, tags: ['защита'] } }, successWhen: 'over',
        },
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '2 + @попал.margin' } },
      ],
    },
  },
  
} as unknown as System;

const book = { records: [{ id: 'выстрел', table: 'приём', label: 'Выстрел', bindings: [{ label: 'Выстрел', effect: 'выстрел', args: {} }] }, { id: 'вырваться', table: 'приём', label: 'Вырваться', bindings: [{ label: 'Вырваться', effect: 'вырваться', args: {} }] }] } as unknown as Compendium;
const sheet = (id: string, effects: unknown[] = []): Sheet =>
  ({ id, systemId: 'пулы', name: id, values: {}, has: [{ of: 'выстрел' }, { of: 'вырваться' }], effects } as unknown as Sheet);

const queue = (...values: number[]) => () => values.shift() ?? 1;

type Hit = { success: boolean; margin: number; natural?: number; total: number; against: { natural: number } };

const play = (action: string, from: string, to: string, dice: number[], target = sheet(to)) => {
  const out = exchange({
    system, compendium: book, die: queue(...dice), sheets: [sheet(from), target],
    actionId: `${action}:0`, fromId: from, toId: to,
  });
  const report = out.reports.find(entry => entry.toId === to && !entry.report.reply)!.report;
  const trace = (id: string) => report.trace.find(t => t.step === id) as unknown as Hit;
  return { sheet: out.sheets.find(s => s.id === to)!, report, trace };
};

const shoot = (senderDice: number[], receiverDice: number[], target = sheet('цель')) =>
  play('выстрел', 'стрелок', 'цель', [...senderDice, ...receiverDice], target);

group('встречный бросок: каждая сторона бросает свой пул', () => {
  test('6 костей атаки (3 успеха) против 2 костей защиты (1 успех) — чистых 2, урон 4', () => {
    const out = shoot([6, 5, 5, 1, 2, 3], [6, 1]);
    eq(out.sheet.values.хп, 10 - 4);
    const hit = out.trace('попал');
    eq(hit.margin, 2);
    eq(hit.against.natural, 1);
  });

  test('защита бросается костями получателя, а не отправителя', () => {
    const out = shoot([6, 6, 1, 1, 1, 1], [5, 5]);
    eq(out.trace('попал').success, false, '2 успеха против 2 — ничья у защиты');
  });

  test('в журнале видно обе стороны', () => {
    const line = JSON.stringify(shoot([6, 5, 5, 1, 2, 3], [6, 1]).report.trace);
    ok(line.includes('"against"'), line.slice(0, 200));
  });

  test('проверка со встречным броском проходит линт', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
  });

  test('зеркально: бросает получатель, встречно — отправитель при сборке', () => {
    const out = play('вырваться', 'держит', 'рвётся', [5, 1, 1, 1, 1, 1, 6, 6]);
    const got = out.trace('вырвался');
    eq(got.against.natural, 1, 'пул отправителя брошен у отправителя: один успех');
    eq(got.total, 2);
    eq(got.success, true);
  });
});
