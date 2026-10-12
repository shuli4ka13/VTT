import { group, test, eq, ok } from './harness.ts';
import { world as W } from '@vtt/schema';
import { system, compendium, cyberpunk, cpCompendium } from './fixtures.ts';
import { recordKinds, recordKindOf } from '../src/model/owned.ts';

const BASES: string[] = W.tableUse.options;

group('роды записей объявляет система', () => {
  test('5e объявляет свои рода, включая «Заклинание»', () => {
    const labels = recordKinds(system).map(([, r]) => r.label);
    ok(labels.some(l => l.includes('заклинание')), '5e — мир заклинаний');
    ok(labels.includes('Оружие'));
  });

  test('киберпанк «Заклинание» НЕ объявляет — палитра выводится из системы', () => {
    const labels = recordKinds(cyberpunk).map(([, r]) => r.label);
    ok(!labels.some(l => l.toLowerCase().includes('заклинание')), 'нет в системе — нет и в палитре');
    ok(labels.includes('Оружие'));
  });

  test('каждый род назван и объяснён словами системы, базис — из словаря движка', () => {
    for (const [sysName, sys] of [['5e', system], ['киберпанк', cyberpunk]]) {
      for (const [key, decl] of recordKinds(sys)) {
        ok(decl.label, `${sysName}.${key}: нужен лейбл`);
        ok(decl.hint, `${sysName}.${key}: нужна подсказка — это она видна в палитре`);
        ok(BASES.includes(decl.use), `${sysName}.${key}: базис «${decl.use}» неизвестен движку`);
      }
    }
  });

  test('каждая запись образца ссылается на объявленный род своей системы', () => {
    const pairs = [
      [system, compendium],
      [cyberpunk, cpCompendium],
    ];
    for (const [sys, book] of pairs) {
      const all = book.records;
      for (const record of all) {
        const decl = recordKindOf(sys, record.table);
        ok(decl, `запись «${record.id}»: род «${record.table}» системой не объявлен`);
      }
    }
  });

  test('базис рода согласован с хранением', () => {
    for (const [sys, book] of [[system, compendium], [cyberpunk, cpCompendium]]) {
      for (const r of book.records) ok(['item', 'action'].includes(sys.tables[r.table].use), r.id);
      eq(book.items, undefined, 'вещи и действия лежат одним списком записей');
      eq(book.effects, undefined, 'полки эффектов в компендиуме нет: эффект — закон системы');
    }
  });

  test('род объявляет ФОРМУ: какие циферки спросить и к чему их привязать', () => {
    const weapon = system.tables.weapon;
    ok(weapon.columns.some(p => p.key === 'damage_dice'), 'что спросить у человека');
    ok(weapon.bindings.some(b => b.effect === 'strike'), 'к какому эффекту это привязать');

    const spell = system.tables['attack-spell'];
    const effect = system.effects[spell.bindings[0].effect];
    const props = new Set((spell.columns ?? []).map(p => p.key));
    const named = (effect.params ?? []).filter(p => props.has(p.key));
    ok(named.length > 0 && named.every(p => (spell.bindings[0].args ?? {})[p.key]),
      'вход с тем же именем, что свойство записи, кнопка передаёт явным аргументом');
  });

  test('свойства оружия по-прежнему при роде', () => {
    ok((system.tables.weapon.columns || []).some(p => p.key === 'damage_dice'));
  });
});
