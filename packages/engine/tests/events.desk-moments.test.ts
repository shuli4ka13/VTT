import { group, test, eq } from './harness.ts';
import { perform } from '../src/core/perform.ts';
import { grantedTo } from '../src/engine/effects.ts';
import { idleClock } from '../src/engine/clock.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const tick = { type: 'apply', target: { expr: '@носитель.раунды' }, direction: 'set', value: { expr: 'if(@moment.round > 1, @носитель.раунды + 1, 0)' } };

const system = {
  id: 'с', name: 'с',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 5 }] },
    стол: { shape: 'single', owner: 'desk', columns: [{ key: 'раунды', label: 'Раунды', kind: 'number', default: 0 }] },
  },
  sheets: { стол: { label: 'Стол', grants: ['счёт'] } },
  grants: ['всем'],
  effects: {
    счёт: { label: 'Счёт', activation: 'passive', on: [{ on: 'moment:round-start', steps: [tick] }] },
    всем: { label: 'Всем', activation: 'passive', modifiers: [] },
  },
} as unknown as System;

const sheets = (): Sheet[] => [
  ...['а', 'б', 'в'].map(id => ({ id, systemId: 'с', name: id, values: {}, has: [], effects: [] } as unknown as Sheet)),
  { id: 'стол', systemId: 'с', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet,
];

group('моменты стола', () => {
  test('выдача типом «стол» висит на столе, «у всех листов» — нет', () => {
    const [a, , , desk] = sheets();
    eq(grantedTo(system, desk!, null).join(','), 'счёт');
    eq(grantedTo(system, a!, null).join(','), 'всем');
  });

  test('начало раунда на столе срабатывает раз за раунд и видит номер раунда', () => {
    const ids = ['а', 'б', 'в'];
    const compendium = { records: [] } as unknown as Compendium;
    let out = perform({ system, compendium, clock: idleClock(), sheets: sheets(), die: () => 1 }, { op: 'turn', turn: 'start', order: ids });
    if (out.kind !== 'done') throw new Error('ход не дошёл до конца');
    const desk = () => out.kind === 'done' ? out.sheets.find(s => s.id === 'стол')!.values.раунды ?? 0 : -1;
    eq(desk(), 0, 'первый раунд — ноль');
    for (let turn = 0; turn < 3; turn++) {
      if (out.kind !== 'done') throw new Error('ход не дошёл до конца');
      out = perform({ system, compendium, clock: out.clock, sheets: out.sheets, die: () => 1 }, { op: 'turn', turn: 'next' });
    }
    eq(desk(), 1, 'второй раунд — один раз, а не по разу на лист');
  });
});
