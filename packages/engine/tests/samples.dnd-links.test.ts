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
    eq(value('arven', 'stats.hit_die.value'), '1к10');
    deepEq(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => value('arven', `saves.${a}.prof`)), [1, 0, 1, 0, 0, 0]);
  });

  test('жрец колдует от Мудрости, чародей — от Харизмы: без переключателей', () => {
    eq(value('doran', 'stats.spell_mod.value'), 4);
    eq(value('mirra', 'stats.spell_mod.value'), 4);
    eq(value('doran', 'stats.spell_dc.value'), 15);
  });

  test('воин не заклинатель — запасной модификатор, а не ошибка', () => {
    eq(value('arven', 'stats.spell_mod.value'), -1);
  });

  test('скорость из расы: дварф 25, человек 30, огр 40', () => {
    eq(value('doran', 'stats.speed.value'), 25);
    eq(value('arven', 'stats.speed.value'), 30);
    eq(value('ogre', 'stats.speed.value'), 40);
  });

  test('у монстра нет класса — кость хитов по размеру: гоблин к6, огр к10', () => {
    eq(value('goblin', 'stats.hit_die.value'), '1к6');
    eq(value('ogre', 'stats.hit_die.value'), '1к10');
    eq(value('orc', 'stats.hit_die.value'), '1к8');
  });

  test('уровень 5: бонус мастерства 3, костей заговора 2, ячеек 4/3/2', () => {
    eq(value('mirra', 'stats.prof_bonus.value'), 3);
    eq(value('mirra', 'stats.cantrip_dice.value'), 2);
    deepEq([1, 2, 3, 4].map(n => value('mirra', `slots.${n}.max`)), [4, 3, 2, 0]);
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
