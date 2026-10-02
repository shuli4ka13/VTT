import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { compile } from '../src/formula/index.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { breaches, newBreaches } from '../src/engine/limits.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const run = (source: string, rows?: Record<string, unknown[]>) =>
  compile(source).evaluate(() => undefined, rows ? { rows: (table, column) => rows[`${table}.${column}`] as never } : {});

group('итоги по строкам — как SUM, COUNT, AVG в SQL', () => {
  test('сумма, среднее, сколько, большее и меньшее принимают список', () => {
    const rows = { 'вещи.вес': [3, 55, 2], 'вещи.настройка': [true, false, true] };
    eq(run('сумма(строки("вещи", "вес"))', rows), 60);
    eq(run('среднее(строки("вещи", "вес"))', rows), 20);
    eq(run('большее из(строки("вещи", "вес"))', rows), 55);
    eq(run('меньшее из(строки("вещи", "вес"), 1)', rows), 1);
    eq(run('сколько(строки("вещи", "вес"))', rows), 3);
    eq(run('сколько(строки("вещи", "настройка"), да)', rows), 2);
  });

  test('пустой список: сумма и сколько — ноль, среднее и большее — внятный отказ', () => {
    const rows = { 'вещи.вес': [] };
    eq(run('сумма(строки("вещи", "вес"))', rows), 0);
    eq(run('сколько(строки("вещи", "вес"))', rows), 0);
    throws(() => run('среднее(строки("вещи", "вес"))', rows), 'пуст');
    throws(() => run('большее из(строки("вещи", "вес"))', rows), 'пуст');
  });

  test('«пусто» — как IS NULL: незаполненное отличимо от нуля', () => {
    eq(run('пусто("")'), true);
    eq(run('пусто(0)'), false);
  });
});

const system = {
  id: 'с', name: 'с', effects: {},
  tables: {
    лист: { shape: 'single', columns: [
      { key: 'нагрузка', label: 'Нагрузка', kind: 'number' },
      { key: 'настроено', label: 'Настроено', expr: { expr: 'сколько(строки("вещь", "настройка"), да)' }, max: 3 },
      { key: 'вес_всего', label: 'Вес всего', expr: { expr: 'сумма(строки("вещь", "вес"))' } },
    ] },
    материал: { label: 'Материал', key: 'word', columns: [{ key: 'множитель', label: 'Множитель', kind: 'number' }], rows: [{ value: 'сталь', cells: { множитель: 2 } }] },
    вещь: {
      shape: 'book', use: 'item', label: 'Вещь',
      columns: [
        { key: 'вес', label: 'Вес', kind: 'number' },
        { key: 'настройка', label: 'Требует настройки', kind: 'boolean' },
        { key: 'материал', label: 'Материал', kind: 'choice', from: 'материал' },
      ],
      modifiers: [{ kind: 'value', target: 'нагрузка', op: 'add', value: { expr: '@строка.вес * @строка.материал.множитель' } }],
    },
  },
} as unknown as System;

const ring = (id: string, weight = 1) => ({ id, table: 'вещь', label: id, cells: { вес: weight, настройка: true, материал: 'сталь' } });
const book = { records: [ring('а'), ring('б'), ring('в'), ring('г'), { id: 'меч', table: 'вещь', label: 'Меч', cells: { вес: 3, настройка: false, материал: 'сталь' } }] } as unknown as Compendium;
const hero = (...has: string[]): Sheet => ({ id: 'г', systemId: 'с', name: 'Герой', values: {}, has: has.map(of => ({ of })), effects: [] } as unknown as Sheet);
const at = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium: book }));

group('правило, написанное у типа, видит свою запись', () => {
  test('каждая надетая вещь прибавляет к нагрузке свой вес, путь по ссылке тоже работает', () => {
    eq(at(hero('меч'), 'нагрузка'), 6);
    eq(at(hero('меч', 'а'), 'нагрузка'), 8);
  });

  test('«строки» у таблицы-типа — это записи листа: снятое не считается', () => {
    eq(at(hero('меч', 'а', 'б'), 'настроено'), 2);
    eq(at(hero('меч', 'а', 'б'), 'вес_всего'), 5);
    const off = { ...hero('а', 'б'), has: [{ of: 'а' }, { of: 'б', off: true }] } as Sheet;
    eq(at(off, 'настроено'), 1);
  });

  test('проверка знает @строка у типа и ловит колонку, которой нет', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
    const typo = structuredClone(system);
    (typo.tables!.вещь!.modifiers![0] as { value: { expr: string } }).value.expr = '@строка.веc';
    ok(errorsOf(lintSystem(typo, book)).length > 0);
  });
});

group('граница вычисляемой колонки — ограничение, как CHECK', () => {
  test('четвёртый настроенный предмет — нарушение, названное словами', () => {
    deepEq(breaches(system, hero('а', 'б', 'в'), { compendium: book }), []);
    deepEq(breaches(system, hero('а', 'б', 'в', 'г'), { compendium: book }).map(b => b.text), ['«Настроено»: 4 — больше 3']);
  });

  test('отказывают только новому нарушению: снять лишнее можно всегда', () => {
    const four = hero('а', 'б', 'в', 'г');
    eq(newBreaches(system, hero('а', 'б', 'в'), four, { compendium: book }).length, 1);
    eq(newBreaches(system, four, hero('а', 'б', 'в'), { compendium: book }).length, 0);
  });
});

group('D&D: прогрессия класса — своя таблица с промежутками, на неё указывает колонка «таблица»', () => {
  const dnd = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;
  const as = (cls: string, level: number) => ({ ...dnd.sheets[0]!, values: { ...dnd.sheets[0]!.values, class_name: cls, level } }) as Sheet;
  const rage = (sheet: Sheet) => calc(dnd.system, sheet, 'rage_damage', newPass(dnd.system, sheet, { compendium: dnd.compendium }));

  test('у варвара урон ярости растёт по промежуткам, у воина его нет', () => {
    deepEq([1, 8, 9, 15, 16, 20].map(level => rage(as('варвар', level))), [2, 2, 3, 3, 4, 4]);
    eq(rage(as('воин', 20)), 0);
  });

  test('настроить можно не больше трёх чудесных вещей', () => {
    const field = dnd.system.tables!['лист']!.columns!.find(c => c.key === 'attuned')!;
    eq(field.max, 3);
  });
});
