import { describe, it, expect } from 'vitest';
import type { System } from '@vtt/schema';
import { fieldOf, forgetFields } from '@vtt/engine/model/sheet-columns';
import { groupTree, subtreeNames, renameGroup, freeGroupName } from './groups.ts';

const make = (over: Partial<System> = {}): System => ({
  tables: {
    лист: { shape: 'single', columns: [
      { key: 'str', label: 'Сила', kind: 'number', default: 10, block: 'Характеристики' },
      { key: 'acr', label: 'Акробатика', expr: '#dex_mod', block: 'Навыки от ловкости' },
      { key: 'ath', label: 'Атлетика', expr: '#str_mod', block: 'Навыки' },
    ] },
    saves: {
      label: 'Спасброски', owner: 'sheet', block: 'Навыки',
      columns: [{ key: 'bonus', label: 'Бонус', kind: 'number', block: 'Навыки' }],
      rows: [{ value: 'воля', block: 'Навыки', view: { bonus: { block: 'Навыки' } } }],
    },
  },
  groups: {
    'Характеристики': {},
    'Навыки': {},
    'Навыки от ловкости': { parent: 'Навыки' },
  },
  records: { hero: { kind: 'sheet', blocks: ['Навыки'] } },
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

describe('renameGroup', () => {
  it('тянет за собой колонки, таблицы, строки, вид клеток, типы листов и ссылки детей', () => {
    const system = make();
    renameGroup(system, 'Навыки', 'Умения');
    forgetFields(system);
    expect(fieldOf(system, 'ath')!.group).toBe('Умения');
    expect(fieldOf(system, 'saves.воля.bonus')!.group).toBe('Умения');
    const saves = system.tables!.saves!;
    expect([saves.block, saves.columns![0]!.block, saves.rows![0]!.block, saves.rows![0]!.view!.bonus!.block]).toEqual(['Умения', 'Умения', 'Умения', 'Умения']);
    expect(system.records!.hero!.blocks).toEqual(['Умения']);
    expect(system.groups!['Умения']).toBeTruthy();
    expect(system.groups!['Навыки']).toBeUndefined();
    expect(system.groups!['Навыки от ловкости']!.parent).toBe('Умения');
    expect(subtreeNames(system, 'Умения')).toContain('Навыки от ловкости');
  });
});

describe('freeGroupName', () => {
  it('не даёт занять имя существующей группы', () => {
    expect(freeGroupName(make(), 'Навыки')).toBe('Навыки 2');
    expect(freeGroupName(make(), 'Магия')).toBe('Магия');
  });
});
