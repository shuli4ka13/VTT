import { group, test, eq } from './harness.ts';
import { momentsOfTurn } from '../src/events/moments.ts';
import { fireMoments } from './legacy.ts';
import { grantedTo } from '../src/engine/effects.ts';
import { idleClock, startCombat } from '../src/engine/clock.ts';
import type { System, Sheet } from '../src/model/types.ts';

const tick = { type: 'apply', target: { tag: 'раунды' }, direction: 'set', value: { expr: 'если(@moment.round > 1, @стол.раунды + 1, 0)' }, targetModifiers: false };

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
    let clock = startCombat(idleClock(), ids);
    let now = fireMoments(momentsOfTurn('start', idleClock(), clock, sheets()), sheets(), { system, compendium: {}, die: () => 1, clock }).sheets;
    const desk = () => now.find(s => s.id === 'стол')!.values.раунды ?? 0;
    eq(desk(), 0, 'первый раунд — ноль');
    for (let turn = 0; turn < 3; turn++) {
      const next = { ...clock, active: ids[(turn + 1) % 3]!, round: turn === 2 ? clock.round + 1 : clock.round };
      now = fireMoments(momentsOfTurn('next', clock, next, now), now, { system, compendium: {}, die: () => 1, clock: next }).sheets;
      clock = next;
    }
    eq(desk(), 1, 'второй раунд — один раз, а не по разу на лист');
  });
});
