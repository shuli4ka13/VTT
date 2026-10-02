import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { rowUsers, danglingRows, renameRow, renameRowInBook } from '../src/model/integrity.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Compendium } from '../src/model/types.ts';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const dnd = () => clone(PLAYABLE_WORLDS[0]!);

group('целостность ссылок на строки таблиц', () => {
  test('строка «физический» занята: на неё смотрят типы урона и правки', () => {
    const мир = dnd();
    const кто = rowUsers(мир.system as System, 'damage_nature', 'физический', мир.compendium as Compendium).map(u => u.text);
    ok(кто.some(t => t.includes('Типы урона')), кто.join(' | '));
    ok(кто.some(t => t.includes('правка')), кто.join(' | '));
  });

  test('строка «рубящий» занята записями книги', () => {
    const мир = dnd();
    const кто = rowUsers(мир.system as System, 'damage_types', 'рубящий', мир.compendium as Compendium).map(u => u.text);
    ok(кто.some(t => t.includes('Длинный меч')), кто.slice(0, 5).join(' | '));
  });

  test('образцы без висячих ссылок', () => {
    for (const мир of PLAYABLE_WORLDS) {
      const висят = danglingRows(мир.system as System, мир.compendium as Compendium);
      eq(висят.length, 0, висят.map(d => d.text).join('\n'));
    }
  });

  test('удалили строку, на которую ссылаются, — линт называет ошибку словами', () => {
    const мир = dnd();
    const system = мир.system as System;
    system.tables!.damage_nature!.rows = system.tables!.damage_nature!.rows!.filter(r => r.value !== 'физический');
    const ошибки = errorsOf(lintSystem(system, мир.compendium as Compendium)).map(p => p.text);
    ok(ошибки.some(t => t.includes('физический') && t.includes('Природа урона')), ошибки.slice(0, 4).join('\n'));
  });

  test('переименование ключа ведёт за собой все ссылки — и в системе, и в книге', () => {
    const мир = dnd();
    const system = мир.system as System;
    const книга = мир.compendium as Compendium;
    renameRow(system, 'damage_types', 'рубящий', 'режущий');
    renameRowInBook(system, книга, 'damage_types', 'рубящий', 'режущий');
    eq(danglingRows(system, книга).length, 0, 'ни одной висячей ссылки');
    eq(книга.records!.find(i => i.id === 'longsword')!.cells!.damage_type, 'режущий');
    ok(rowUsers(system, 'damage_types', 'режущий', книга).length > 0, 'ссылки переехали');
    eq(rowUsers(system, 'damage_types', 'рубящий', книга).length, 0, 'на старое имя не смотрит никто');
  });

  test('переименовали природу — правка ярости поехала следом', () => {
    const мир = dnd();
    const system = мир.system as System;
    renameRow(system, 'damage_nature', 'физический', 'телесный');
    const ярость = system.effects.raging!.modifiers!.find(m => (m as { where?: unknown }).where) as { where: { is: string } };
    eq(ярость.where.is, 'телесный');
    eq(danglingRows(system, мир.compendium as Compendium).length, 0);
  });
});

group('ключ строке без ключа — не переименование', () => {
  test('у строки не было ключа: умолчание колонки, которая ссылается на таблицу, не трогается', () => {
    const system = {
      id: 'с', name: 'с', effects: {},
      tables: {
        хват: { rows: [{ cells: {} }] },
        оружие: { shape: 'book', columns: [{ key: 'хват', kind: 'choice', from: 'хват' }] },
      },
    } as unknown as System;
    renameRow(system, 'хват', undefined, 'двуручный');
    eq(system.tables!.оружие!.columns![0]!.default, undefined);
  });
});
