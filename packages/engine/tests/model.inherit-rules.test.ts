import { group, test, deepEq } from './harness.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System } from '../src/model/types.ts';

group('наследование: списки складываются, своя кнопка на том же месте правит кнопку основы', () => {
  const system = flattenSystem({
    id: 's', name: 's', tables: {},
    effects: {
      base: { label: 'Основа', activation: 'passive', grants: ['a'], on: [{ on: 'x', steps: [] }] },
      own: { label: 'Своё', activation: 'passive', extends: 'base', grants: ['b'], on: [{ on: 'y', steps: [] }] },
      a: { label: 'A', activation: 'passive' }, b: { label: 'B', activation: 'passive' },
    },
    records: {
      gear: { kind: 'item', label: 'Снаряжение', grants: ['a'], blocks: ['Бой'] },
      ring: { kind: 'item', label: 'Кольцо', extends: 'gear', grants: ['b'] },
    },
  } as unknown as System);

  test('эффект на основе получает и выдачу, и подписки основы', () => {
    deepEq(system.effects.own!.grants, ['a', 'b']);
    deepEq((system.effects.own!.on ?? []).map(h => h.on), ['x', 'y']);
  });

  test('тип на основе получает выдачу и блоки основы', () => {
    deepEq(system.records!.ring!.grants, ['a', 'b']);
    deepEq(system.records!.ring!.blocks, ['Бой']);
  });
});
