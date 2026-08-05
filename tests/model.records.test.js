import { group, test, eq, ok } from './harness.js';
import { system } from '../src/model/system.js';
import { compendium } from '../src/model/compendium.js';
import { cyberpunk, cpCompendium } from '../src/model/system-cyberpunk.js';

// Роды записей компендиума объявляет СИСТЕМА, а не движок и не разметка.
// Палитра «что можно добавить», слова и подсказки выводятся из system.records —
// как словарь мишеней выводится из тегов. У движка остаётся только короткий
// базис хранения (item / effect / call / action) — как род конверта.

const BASES = ['item', 'effect', 'call', 'action'];

group('роды записей объявляет система', () => {
  test('5e объявляет свои рода, включая «Заклинание»', () => {
    const labels = Object.values(system.records).map(r => r.label);
    ok(labels.includes('Заклинание'), '5e — мир заклинаний');
    ok(labels.includes('Оружие'));
  });

  test('киберпанк «Заклинание» НЕ объявляет — палитра выводится из системы', () => {
    const labels = Object.values(cyberpunk.records).map(r => r.label);
    ok(!labels.includes('Заклинание'), 'нет в системе — нет и в палитре');
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
      const all = [...book.items, ...book.effects, ...book.actions];
      for (const record of all) {
        const decl = sys.records[record.rk];
        ok(decl, `запись «${record.id}»: род «${record.rk}» системой не объявлен`);
      }
    }
  });

  test('базис рода согласован с хранением', () => {
    for (const [sys, book] of [[system, compendium], [cyberpunk, cpCompendium]]) {
      for (const r of book.items) eq(sys.records[r.rk].kind, 'item', r.id);
      for (const r of book.effects) {
        eq(sys.records[r.rk].kind, r.rule ? 'call' : 'effect', r.id);
      }
      for (const r of book.actions) eq(sys.records[r.rk].kind, 'action', r.id);
    }
  });

  test('свойства оружия по-прежнему при роде', () => {
    ok((system.records.weapon.props || []).some(p => p.key === 'damage_dice'));
  });
});
