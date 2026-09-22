import { group, test, eq, deepEq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { calc } from '../src/engine/calc.ts';
import { compile } from '../src/formula/index.ts';
import type { System, Sheet } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const sheetOf = (id: string) => (dnd.sheets as Sheet[]).find(s => s.id === id)!;
const value = (id: string, tag: string) => calc(system, sheetOf(id), tag);

group('D&D: класс и раса — ссылки, остальное из них следует', () => {
  test('воин: кость хитов к10, спасброски Силы и Телосложения из класса', () => {
    eq(value('arven', 'hit_die'), '1к10');
    deepEq(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => value('arven', `${a}_save_prof`)), [1, 0, 1, 0, 0, 0]);
  });

  test('жрец колдует от Мудрости, чародей — от Харизмы: без переключателей', () => {
    eq(value('doran', 'spell_mod'), 4);
    eq(value('mirra', 'spell_mod'), 4);
    eq(value('doran', 'spell_dc'), 15);
  });

  test('воин не заклинатель — запасной модификатор, а не ошибка', () => {
    eq(value('arven', 'spell_mod'), -1);
  });

  test('скорость из расы: дварф 25, человек 30, огр 40', () => {
    eq(value('doran', 'speed'), 25);
    eq(value('arven', 'speed'), 30);
    eq(value('ogre', 'speed'), 40);
  });

  test('у монстра нет класса — кость хитов по размеру: гоблин к6, огр к10', () => {
    eq(value('goblin', 'hit_die'), '1к6');
    eq(value('ogre', 'hit_die'), '1к10');
    eq(value('orc', 'hit_die'), '1к8');
  });

  test('уровень 5: бонус мастерства 3, костей заговора 2, ячеек 4/3/2', () => {
    eq(value('mirra', 'prof_bonus'), 3);
    eq(value('mirra', 'cantrip_dice'), 2);
    deepEq([1, 2, 3, 4].map(n => value('mirra', `slots_${n}_max`)), [4, 3, 2, 0]);
  });

  test('девять таблиц ячеек слиты в одну, три таблицы по уровню — в одну', () => {
    const ids = Object.keys(system.tables ?? {});
    eq(ids.filter(id => id.startsWith('slots_')).length, 0);
    eq(['proficiency', 'cantrip_dice', 'rage_damage'].filter(id => ids.includes(id)).length, 0);
  });
});

group('функция «или»', () => {
  const run = (src: string, names: Record<string, unknown> = {}) => compile(src).evaluate(name => names[name] as never);
  test('берёт первое заданное', () => {
    eq(run('или(@a, 7)', { a: null }), 7);
    eq(run('или(@a, 7)', { a: 3 }), 3);
    eq(run('или(@a, @b, "1к8")', { a: '', b: null }), '1к8');
  });
});
