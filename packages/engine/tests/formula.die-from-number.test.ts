import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'л', name: 'л',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 0 },
      { key: 'победил', label: 'Победил', kind: 'number', default: 0 },
    ] },
    приёмы: { shape: 'book', use: 'action', label: 'Приёмы', columns: [], bindings: [{ label: 'Состязание', effect: 'состязание' }] },
  },
  effects: {
    состязание: {
      label: 'Состязание', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { id: 'мой', type: 'roll', die: { expr: 'die(@действующий.ловкость)' }, by: { expr: '@действующий' } },
        { type: 'each', of: 'цели' },
        { id: 'его', type: 'roll', die: { expr: 'die(@цель.ловкость)' }, by: { expr: '@цель' } },
        { id: 'итог', type: 'check', value: { expr: '@мой' }, versus: { expr: '@его' }, successWhen: 'over' },
        { type: 'branch', if: { expr: '@итог.success' } },
        { type: 'apply', target: { expr: '@действующий.победил' }, direction: 'add', value: { expr: '1' } },
        { type: 'end' },
      ],
    },
  },
} as unknown as System;
const compendium = { records: [{ id: 'приём', table: 'приёмы', label: 'Приём', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, ловкость: number): Sheet => ({ id, systemId: 'л', name: id, values: { ловкость }, has: id === 'я' ? [{ of: 'приём' }] : [], effects: [] } as unknown as Sheet);

group('«кость(грани)»: грани кости — из числа', () => {
  test('1к15 против 1к10: кость берёт грани из Ловкости каждого', () => {
    const sides: number[] = [];
    const die = (n: number) => { sides.push(n); return n; };
    const out = exchange({ system, compendium, die, sheets: [sheet('я', 15), sheet('он', 10)], actionId: 'приём:0', fromId: 'я', toId: 'он' });
    eq(sides.join(','), '15,10');
    eq(out.sheets.find(s => s.id === 'я')!.values.победил, 1);
  });

  test('не ошибка «Проблем»', () => {
    eq(errorsOf(lintSystem(system, compendium)).map(p => p.text).join('\n'), '');
  });
});
