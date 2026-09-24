import { group, test, eq, ok } from './harness.ts';
import { world as W } from '@vtt/schema';
import { system, compendium, cyberpunk, cpCompendium } from './fixtures.ts';

const BASES: string[] = W.recordKind.shape.kind.options;

group('роды записей объявляет система', () => {
  test('5e объявляет свои рода, включая «Заклинание»', () => {
    const labels = Object.values(system.records).map(r => r.label);
    ok(labels.some(l => l.includes('заклинание')), '5e — мир заклинаний');
    ok(labels.includes('Оружие'));
  });

  test('киберпанк «Заклинание» НЕ объявляет — палитра выводится из системы', () => {
    const labels = Object.values(cyberpunk.records).map(r => r.label);
    ok(!labels.some(l => l.toLowerCase().includes('заклинание')), 'нет в системе — нет и в палитре');
    ok(labels.includes('Оружие'));
  });

  test('каждый род назван и объяснён словами системы, базис — из словаря движка', () => {
    for (const [sysName, sys] of [['5e', system], ['киберпанк', cyberpunk]]) {
      for (const [key, decl] of Object.entries(sys.records)) {
        ok(decl.label, `${sysName}.${key}: нужен лейбл`);
        ok(decl.hint, `${sysName}.${key}: нужна подсказка — это она видна в палитре`);
        ok(BASES.includes(decl.kind), `${sysName}.${key}: базис «${decl.kind}» неизвестен движку`);
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
        const decl = sys.records[record.rk];
        ok(decl, `запись «${record.id}»: род «${record.rk}» системой не объявлен`);
      }
    }
  });

  test('базис рода согласован с хранением', () => {
    for (const [sys, book] of [[system, compendium], [cyberpunk, cpCompendium]]) {
      for (const r of book.records) ok(['item', 'action'].includes(sys.records[r.rk].kind), r.id);
      eq(book.items, undefined, 'вещи и действия лежат одним списком записей');
      eq(book.effects, undefined, 'полки эффектов в компендиуме нет: эффект — закон системы');
    }
  });

  test('род объявляет ФОРМУ: какие циферки спросить и к чему их привязать', () => {
    const weapon = system.records.weapon;
    ok(weapon.props.some(p => p.key === 'damage_dice'), 'что спросить у человека');
    ok(weapon.bindings.some(b => b.effect === 'strike'), 'к какому эффекту это привязать');

    const spell = system.records['attack-spell'];
    const args = spell.bindings[0].args;
    ok(Object.values(args).some(v => v && typeof v === 'object' && 'prop' in v),
      'хотя бы один аргумент берётся из свойств самой записи');
  });

  test('свойства оружия по-прежнему при роде', () => {
    ok((system.records.weapon.props || []).some(p => p.key === 'damage_dice'));
  });
});
