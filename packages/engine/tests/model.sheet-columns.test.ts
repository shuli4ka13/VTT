import { group, test, eq, ok, deepEq } from './harness.ts';
import { fieldsOf, fieldOf, hasField, withColumn, fieldProblems } from '../src/model/sheet-columns.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { world } from '@vtt/schema';
import type { System, Sheet } from '../src/model/types.ts';

const base = {
  id: 's', name: 's', effects: {},
  tables: {
    лист: { shape: 'single', columns: [{ key: 'level', label: 'Уровень', kind: 'number', default: 1 }] },
    abilities: {
      label: 'Характеристики', owner: 'sheet', block: 'Характеристики',
      columns: [
        { key: 'score', label: 'Значение', kind: 'number', default: 10 },
        { key: 'mod', label: 'Модификатор', kind: 'number', expr: 'округлить вниз((@строка.score - 10) / 2)', title: 'Модификатор: {label}', block: 'Модификаторы' },
      ],
      rows: [{ value: 'сила', key: 'str', label: 'Сила' }, { value: 'ловкость', key: 'dex', label: 'Ловкость' }],
    },
    skills: {
      label: 'Навыки', owner: 'sheet', block: 'Навыки',
      columns: [
        { key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' },
        { key: 'total', label: 'Навык', kind: 'number', expr: '@строка.ability.mod + 1' },
      ],
      rows: [{ value: 'атлетика', key: 'athletics', label: 'Атлетика', cells: { ability: 'сила' } }],
    },
  },
} as unknown as System;

const sheet = { id: 'h', systemId: 's', name: 'h', values: { 'abilities.str.score': 16 }, has: [], effects: [] } as Sheet;

const copy = (): System => structuredClone(base) as System;

group('таблица на листе: пустая клетка — ввод, формула — считается, значение — одно на всех', () => {
  const at = (tag: string, on: System = base) => calc(on, sheet, tag, newPass(on, sheet));

  test('поля нигде не хранятся: это клетки таблиц, у которых есть владелец', () => {
    deepEq(fieldsOf(base).map(f => f.tag), ['level', 'abilities.str.score', 'abilities.str.mod', 'abilities.dex.score', 'abilities.dex.mod', 'skills.athletics.total']);
    ok(world.system.safeParse(base).success);
    ok(!world.system.safeParse({ ...base, fields: [] }).success, 'хранимых полей в системе быть не может');
  });

  test('поле зовётся адресом клетки, а формула колонки пишется один раз', () => {
    eq(fieldOf(base, 'abilities.dex.mod')!.label, 'Модификатор: Ловкость');
    eq(fieldOf(base, 'abilities.dex.mod')!.group, 'Модификаторы');
    eq(fieldOf(base, 'abilities.dex.score')!.group, 'Характеристики');
    eq(at('abilities.str.mod'), 3);
    eq(at('abilities.dex.score'), 10);
  });

  test('таблица листа из одной строки: колонка зовётся своим именем', () => {
    const field = fieldOf(base, 'level')!;
    eq(field.home, 'лист');
    ok(!field.cell);
    eq(at('level'), 1);
  });

  test('своя формула в клетке перебивает формулу колонки', () => {
    const own = copy();
    own.tables!.abilities!.rows![1]!.cells = { mod: { expr: '@строка.score * 2' } };
    deepEq(fieldsOf(own).filter(f => f.cell?.column === 'mod').map(f => (f.value as { expr: string }).expr),
      ['округлить вниз((@abilities.str.score - 10) / 2)', '@abilities.dex.score * 2']);
  });

  test('вид одной клетки лежит у строки и перебивает вид колонки', () => {
    const own = copy();
    own.tables!.abilities!.rows![0]!.view = { mod: { label: 'Мощь', block: 'Бой', roll: { die: { constant: 'к20' }, bonus: { expr: '@строка.mod' } } } };
    const field = fieldOf(own, 'abilities.str.mod')!;
    eq(field.label, 'Мощь');
    eq(field.group, 'Бой');
    eq(field.roll!.bonus!.expr, '@abilities.str.mod');
    eq(fieldOf(own, 'abilities.dex.mod')!.label, 'Модификатор: Ловкость');
  });

  test('вписанное значение не становится полем — оно одинаковое у всех', () => {
    const fixed = copy();
    fixed.tables!.abilities!.rows![1]!.cells = { score: 14 };
    ok(!hasField(fixed, 'abilities.dex.score'));
    eq(at('abilities.dex.mod', fixed), 2);
  });

  test('без владельца таблица — справочник: пустая клетка просто пуста, полей нет', () => {
    const off = copy();
    delete off.tables!.skills!.owner;
    ok(!fieldsOf(off).some(f => f.cell?.table === 'skills'));
    eq(at('x', withColumn(off, { key: 'x', label: 'x', expr: '@skills.athletics.total' })), 4);
  });

  test('владелец таблицы — стол или группа: клетки лежат там', () => {
    const shared = copy();
    shared.tables!.abilities!.owner = 'desk';
    eq(fieldOf(shared, 'abilities.str.score')!.lives, 'desk');
    const grouped = copy();
    grouped.tables!.лист!.owner = 'group';
    eq(fieldOf(grouped, 'level')!.lives, 'group');
  });

  test('адрес идёт по ссылке: навык → характеристика → модификатор', () => {
    eq(at('skills.athletics.total'), 4);
    eq(at('via', withColumn(base, { key: 'via', label: 'через ссылку', expr: '@skills.athletics.ability.mod' })), 3);
  });

  test('выбор строки на листе по-прежнему ведёт в таблицу', () => {
    const picked = withColumn(
      withColumn(base, { key: 'pick', label: 'Выбор', kind: 'choice', from: 'abilities', default: 'сила' }),
      { key: 'picked', label: 'Модификатор выбранной', expr: '@pick.mod' });
    eq(at('picked', picked), 3);
  });

  test('сломанный шаблон подписи — находка проверки, а не падение', () => {
    deepEq(errorsOf(lintSystem(base)).map(e => e.text), []);
    const broken = copy();
    broken.tables!.abilities!.columns![1]!.title = '{нет_такой}: {label}';
    eq(fieldProblems(broken).length, 1);
    ok(!fieldsOf(broken).some(f => f.cell?.table === 'abilities'));
    ok(errorsOf(lintSystem(broken)).some(e => e.text.includes('нет_такой')));
  });
});
