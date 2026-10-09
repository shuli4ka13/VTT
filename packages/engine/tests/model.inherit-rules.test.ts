import { group, test, deepEq } from './harness.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System } from '../src/model/types.ts';

group('наследование типов: списки складываются, своя кнопка на том же месте правит кнопку основы', () => {
  const system = flattenSystem({
    id: 's', name: 's', sheets: { gear: { label: 'Снаряжение', grants: ['a'], blocks: ['Бой'] }, ring: { label: 'Кольцо', extends: 'gear', grants: ['b'] } },
    effects: {
      base: { label: 'Основа', activation: 'passive', grants: ['a'], on: [{ on: 'affected', of: 'x', steps: [] }] },
      own: { label: 'Своё', activation: 'passive', extends: 'base', grants: ['b'], on: [{ on: 'affected', of: 'y', steps: [] }] },
      a: { label: 'A', activation: 'passive' }, b: { label: 'B', activation: 'passive' },
    },
    
  } as unknown as System);

  test('тип на основе получает выдачу и блоки основы', () => {
    deepEq(system.sheets!.ring!.grants, ['a', 'b']);
    deepEq(system.sheets!.ring!.blocks, ['Бой']);
  });
});
