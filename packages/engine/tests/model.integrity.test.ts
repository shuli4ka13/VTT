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
    const кто = rowUsers(мир.system as System, 'damage_nature', 'fizicheskiy', мир.compendium as Compendium).map(u => u.text);
    ok(кто.some(t => t.includes('Типы урона')), кто.join(' | '));
    ok(кто.some(t => t.includes('правка')), кто.join(' | '));
  });

  test('строка «рубящий» занята записями книги', () => {
    const мир = dnd();
    const кто = rowUsers(мир.system as System, 'damage_types', 'rubyaschiy', мир.compendium as Compendium).map(u => u.text);
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
    system.tables!.damage_nature!.rows = system.tables!.damage_nature!.rows!.filter(r => r.value !== 'fizicheskiy');
    const ошибки = errorsOf(lintSystem(system, мир.compendium as Compendium)).map(p => p.text);
    ok(ошибки.some(t => t.includes('fizicheskiy') && t.includes('Природа урона')), ошибки.slice(0, 4).join('\n'));
  });

  test('переименование ключа ведёт за собой все ссылки — и в системе, и в книге', () => {
    const мир = dnd();
    const system = мир.system as System;
    const книга = мир.compendium as Compendium;
    renameRow(system, 'damage_types', 'rubyaschiy', 'режущий');
    renameRowInBook(system, книга, 'damage_types', 'rubyaschiy', 'режущий');
    eq(danglingRows(system, книга).length, 0, 'ни одной висячей ссылки');
    eq(книга.records!.find(i => i.id === 'longsword')!.cells!.damage_type, 'режущий');
    ok(rowUsers(system, 'damage_types', 'режущий', книга).length > 0, 'ссылки переехали');
    eq(rowUsers(system, 'damage_types', 'rubyaschiy', книга).length, 0, 'на старое имя не смотрит никто');
  });

  test('переименовали природу — правка ярости поехала следом', () => {
    const мир = dnd();
    const system = мир.system as System;
    renameRow(system, 'damage_nature', 'fizicheskiy', 'телесный');
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

  test('переименовали характеристику — переименованы пути в формулах и аргументы в подписках; линт как до', () => {
    const мир = dnd();
    const system = мир.system as System;
    eq(errorsOf(lintSystem(system, мир.compendium as Compendium)).length, 0);
    renameRow(system, 'abilities', 'constitution', 'выносливость');
    renameRowInBook(system, мир.compendium as Compendium, 'abilities', 'constitution', 'выносливость');
    eq(errorsOf(lintSystem(system, мир.compendium as Compendium)).map(p => p.text).join('\n'), '');
    ok(JSON.stringify(system.tables).includes('@abilities.выносливость.mod'));
    ok(!JSON.stringify(system.effects).includes('"\\"constitution\\""'));
  });
});


group('строка справочника у основы типа записи', () => {
  const наследие = (): { system: System; книга: Compendium } => ({
    system: {
      id: 'н', name: 'н',
      tables: {
        сорта: { label: 'Сорта', key: 'word', columns: [], rows: [{ value: 'стандарт' }, { value: 'альфа' }] },
        снаряжение: { shape: 'book', use: 'item', label: 'Снаряжение', columns: [
          { key: 'grade', label: 'Сорт', kind: 'choice', from: 'сорта' },
        ] },
        имплант: { shape: 'book', use: 'item', label: 'Имплант', extends: 'снаряжение', columns: [] },
      },
      effects: {},
    } as unknown as System,
    книга: { records: [{ id: 'мышцы', table: 'имплант', label: 'Замена мускулов', cells: { grade: 'стандарт' } }] } as unknown as Compendium,
  });

  test('колонка-выбор объявлена у основы, запись — у наследника: строка видна и переименовывается в клетке', () => {
    const { system, книга } = наследие();
    const кто = rowUsers(system, 'сорта', 'стандарт', книга).map(u => u.text);
    eq(кто.length, 1, кто.join(' | '));
    ok(кто[0]!.includes('Замена мускулов'), кто.join(' | '));
    renameRow(system, 'сорта', 'стандарт', 'норма');
    renameRowInBook(system, книга, 'сорта', 'стандарт', 'норма');
    eq(книга.records!.find(r => r.id === 'мышцы')!.cells!.grade, 'норма');
    eq(danglingRows(system, книга).length, 0);
  });
});
