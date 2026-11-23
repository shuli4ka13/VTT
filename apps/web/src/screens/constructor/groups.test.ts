import { describe, it, expect } from 'vitest';
import type { System } from '@vtt/schema';
import { groupTree, subtreeNames, newGroup } from './groups.ts';

const make = (over: Partial<System> = {}): System => ({
  tables: {
    лист: { shape: 'single', columns: [
      { key: 'str', label: 'Сила', kind: 'number', default: 10 },
      { key: 'acr', label: 'Акробатика', expr: { expr: '#dex_mod' } },
      { key: 'ath', label: 'Атлетика', expr: { expr: '#str_mod' } },
    ] },
    saves: {
      label: 'Спасброски', owner: 'sheet',
      columns: [{ key: 'bonus', label: 'Бонус', kind: 'number' }],
      rows: [{ value: 'воля' }],
    },
  },
  groups: {
    'Характеристики': {},
    'Навыки': {},
    'Навыки от ловкости': { parent: 'Навыки' },
  },
  blocks: [
    { key: 'Характеристики', parts: [{ table: 'лист', columns: ['str'] }] },
    { key: 'Навыки', parts: [{ table: 'лист', columns: ['ath'] }, { table: 'saves' }] },
    { key: 'Навыки от ловкости', parent: 'Навыки', parts: [{ table: 'лист', columns: ['acr'] }] },
  ],
  sheets: { hero: { blocks: ['Навыки'] } },
  effects: {},
  ...over,
} as System);

describe('groupTree', () => {
  it('подгруппа попадает под родителя, порядок — как в дереве блоков', () => {
    const tree = groupTree(make());
    expect(tree.map(n => n.name)).toEqual(['Характеристики', 'Навыки']);
    const skills = tree[1]!;
    expect(skills.children.map(n => n.name)).toEqual(['Навыки от ловкости']);
    expect(skills.children[0]!.fields.map(f => f.tag)).toEqual(['acr']);
  });

  it('пустая подгруппа без полей видна в дереве', () => {
    const system = make();
    system.groups!['Навыки от силы'] = { parent: 'Навыки' };
    const skills = groupTree(system).find(n => n.name === 'Навыки')!;
    expect(skills.children.map(n => n.name)).toContain('Навыки от силы');
  });

  it('цикл родителей не роняет дерево — участники всплывают в корень', () => {
    const system = make({ groups: { 'А': { parent: 'Б' }, 'Б': { parent: 'А' } } });
    const names = groupTree(system).map(n => n.name);
    expect(names).toContain('А');
    expect(names).toContain('Б');
  });
});

describe('newGroup', () => {
  it('ключ свободный, подпись не повторяет чужую', () => {
    expect(newGroup(make(), 'Навыки')).toEqual({ key: 'navyki_2', title: 'Навыки 2' });
    expect(newGroup(make(), 'Магия')).toEqual({ key: 'magiya', title: 'Магия' });
  });
});
