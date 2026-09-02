import { describe, it, expect } from 'vitest';
import type { System, FieldValue } from '@vtt/schema';
import {
  sameValue, effectiveDefault, defaultSource, groupTree, subtreeNames,
  setGroupDefault, applyDefaultToAll, renameGroup, freeGroupName,
} from './groups.ts';

const stored = (def: number): FieldValue => ({ kind: 'stored', type: 'number', default: def });
const formula = (expr: string): FieldValue => ({ kind: 'formula', expr });

const make = (over: Partial<System> = {}): System => ({
  fields: [
    { tag: 'str', label: 'Сила', group: 'Характеристики', value: stored(10) },
    { tag: 'dex', label: 'Ловкость', group: 'Характеристики', value: stored(10) },
    { tag: 'cha', label: 'Харизма', group: 'Характеристики', value: stored(8) },
    { tag: 'acr', label: 'Акробатика', group: 'Навыки от ловкости', value: formula('#dex_mod') },
    { tag: 'ath', label: 'Атлетика', group: 'Навыки', value: formula('#str_mod') },
  ],
  groups: {
    'Характеристики': { default: stored(10) },
    'Навыки': {},
    'Навыки от ловкости': { parent: 'Навыки', default: formula('#dex_mod') },
  },
  effects: {},
  ...over,
} as System);

describe('sameValue', () => {
  it('сравнивает по существу, пробелы в формуле не считаются', () => {
    expect(sameValue(stored(10), stored(10))).toBe(true);
    expect(sameValue(stored(10), stored(12))).toBe(false);
    expect(sameValue(formula('#dex_mod'), formula(' #dex_mod '))).toBe(true);
    expect(sameValue(stored(10), formula('10'))).toBe(false);
    expect(sameValue(undefined, stored(10))).toBe(false);
  });
});

describe('effectiveDefault / defaultSource', () => {
  it('своя группа важнее родителя, без своего — берётся родительский', () => {
    const system = make();
    expect(effectiveDefault(system, 'Навыки от ловкости')).toEqual(formula('#dex_mod'));
    expect(defaultSource(system, 'Навыки от ловкости')).toBe('Навыки от ловкости');

    const inherited = make();
    delete inherited.groups!['Навыки от ловкости']!.default;
    inherited.groups!['Навыки']!.default = formula('#str_mod');
    expect(effectiveDefault(inherited, 'Навыки от ловкости')).toEqual(formula('#str_mod'));
    expect(defaultSource(inherited, 'Навыки от ловкости')).toBe('Навыки');
  });

  it('без дефолтов по всей цепочке — undefined', () => {
    expect(effectiveDefault(make(), 'Навыки')).toBeUndefined();
    expect(effectiveDefault(make(), undefined)).toBeUndefined();
  });
});

describe('groupTree', () => {
  it('подгруппа попадает под родителя, порядок — по первому полю', () => {
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

describe('setGroupDefault — каскад', () => {
  it('поля со старым дефолтом получают новый, ручные не трогаются', () => {
    const system = make();
    setGroupDefault(system, 'Характеристики', stored(12));
    const byTag = Object.fromEntries(system.fields.map(f => [f.tag, f.value]));
    expect(byTag['str']).toEqual(stored(12));
    expect(byTag['dex']).toEqual(stored(12));
    expect(byTag['cha']).toEqual(stored(8));
  });

  it('дефолт родителя каскадит в подгруппу без своего дефолта', () => {
    const system = make();
    delete system.groups!['Навыки от ловкости']!.default;
    system.groups!['Навыки']!.default = formula('#dex_mod');
    setGroupDefault(system, 'Навыки', formula('#dex_mod + 1'));
    expect(system.fields.find(f => f.tag === 'acr')!.value).toEqual(formula('#dex_mod + 1'));
  });

  it('свой дефолт подгруппы экранирует изменения родителя', () => {
    const system = make();
    system.groups!['Навыки']!.default = formula('#str_mod');
    setGroupDefault(system, 'Навыки', formula('#str_mod + 1'));
    expect(system.fields.find(f => f.tag === 'acr')!.value).toEqual(formula('#dex_mod'));
    expect(system.fields.find(f => f.tag === 'ath')!.value).toEqual(formula('#str_mod + 1'));
  });

  it('первое задание дефолта ничего не переписывает само', () => {
    const system = make();
    setGroupDefault(system, 'Навыки', formula('#dex_mod'));
    expect(system.fields.find(f => f.tag === 'ath')!.value).toEqual(formula('#str_mod'));
  });
});

describe('applyDefaultToAll', () => {
  it('принудительно раздаёт дефолт всем полям поддерева и считает затронутые', () => {
    const system = make();
    system.groups!['Навыки']!.default = formula('#dex_mod');
    const touched = applyDefaultToAll(system, 'Навыки');
    expect(touched).toBe(1);
    expect(system.fields.find(f => f.tag === 'ath')!.value).toEqual(formula('#dex_mod'));
    expect(system.fields.find(f => f.tag === 'acr')!.value).toEqual(formula('#dex_mod'));
    expect(system.fields.find(f => f.tag === 'str')!.value).toEqual(stored(10));
  });

  it('подгруппа со своим дефолтом раздаёт его, а не родительский', () => {
    const system = make();
    system.fields.find(f => f.tag === 'acr')!.value = formula('#int_mod');
    applyDefaultToAll(system, 'Навыки от ловкости');
    expect(system.fields.find(f => f.tag === 'acr')!.value).toEqual(formula('#dex_mod'));
  });
});

describe('renameGroup', () => {
  it('тянет за собой поля, ключ настроек и ссылки детей', () => {
    const system = make();
    renameGroup(system, 'Навыки', 'Умения');
    expect(system.fields.find(f => f.tag === 'ath')!.group).toBe('Умения');
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
