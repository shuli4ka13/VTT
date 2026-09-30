import { group, test, eq, ok } from './harness.ts';
import { compile } from '../src/formula/index.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { rowUsers, danglingRows, renameRow, renameRowInBook } from '../src/model/integrity.ts';
import type { System, Compendium } from '../src/model/types.ts';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

group('ссылка «несколько значений» — многие ко многим', () => {
  test('есть(список, значение) отвечает да или нет', () => {
    const свойства = ['лёгкое', 'фехтовальное'];
    const спросить = (слово: string) => compile(`есть(@свойства, '${слово}')`).evaluate(() => свойства);
    eq(спросить('лёгкое'), true);
    eq(спросить('тяжёлое'), false);
  });

  test('у кинжала три свойства, и каждое занимает свою строку таблицы', () => {
    const мир = clone(PLAYABLE_WORLDS[0]!);
    const кинжал = мир.compendium.records!.find(i => i.id === 'dagger')!;
    eq(JSON.stringify(кинжал.cells!.properties), JSON.stringify(['лёгкое', 'фехтовальное', 'метательное']));
    const кто = rowUsers(мир.system as System, 'weapon_properties', 'метательное', мир.compendium as Compendium);
    ok(кто.some(u => u.text.includes('Кинжал')), кто.map(u => u.text).join(' | '));
  });

  test('переименование свойства правит его внутри списков, соседей не трогает', () => {
    const мир = clone(PLAYABLE_WORLDS[0]!);
    const system = мир.system as System;
    const книга = мир.compendium as Compendium;
    renameRow(system, 'weapon_properties', 'метательное', 'бросковое');
    renameRowInBook(system, книга, 'weapon_properties', 'метательное', 'бросковое');
    const кинжал = книга.records!.find(i => i.id === 'dagger')!;
    eq(JSON.stringify(кинжал.cells!.properties), JSON.stringify(['лёгкое', 'фехтовальное', 'бросковое']));
    eq(danglingRows(system, книга).length, 0);
  });

  test('одно пропавшее значение в списке — ошибка словами, с его именем', () => {
    const мир = clone(PLAYABLE_WORLDS[0]!);
    const system = мир.system as System;
    system.tables!.weapon_properties!.rows = system.tables!.weapon_properties!.rows!.filter(r => r.value !== 'лёгкое');
    const висят = danglingRows(system, мир.compendium as Compendium).map(d => d.text);
    ok(висят.some(t => t.includes('Кинжал') && t.includes('лёгкое')), висят.slice(0, 3).join('\n'));
  });
});
