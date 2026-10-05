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
      label: 'Характеристики', owner: 'sheet',
      columns: [
        { key: 'score', label: 'Значение', kind: 'number', default: 10 },
        { key: 'mod', label: 'Модификатор', kind: 'number', expr: { expr: 'округлить вниз((@строка.score - 10) / 2)' }, title: 'Модификатор: {label}' },
      ],
      rows: [{ value: 'сила', label: 'Сила' }, { value: 'ловкость', label: 'Ловкость' }],
    },
    skills: {
      label: 'Навыки', owner: 'sheet',
      columns: [
        { key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' },
        { key: 'total', label: 'Навык', kind: 'number', expr: { expr: '@строка.ability.mod + 1' } },
      ],
      rows: [{ value: 'атлетика', label: 'Атлетика', cells: { ability: 'сила' } }],
    },
  },
  blocks: [
    { name: 'Характеристики', parts: [{ table: 'abilities', columns: ['score'] }] },
    { name: 'Модификаторы', parts: [{ table: 'abilities', columns: ['mod'] }] },
    { name: 'Навыки', parts: [{ table: 'skills', by: 'ability' }] },
  ],
} as unknown as System;

const sheet = { id: 'h', systemId: 's', name: 'h', values: { 'abilities.сила.score': 16 }, has: [], effects: [] } as Sheet;

const copy = (): System => structuredClone(base) as System;

group('таблица на листе: пустая клетка — ввод, формула — считается, значение — одно на всех', () => {
  const at = (tag: string, on: System = base) => calc(on, sheet, tag, newPass(on, sheet));

  test('поля нигде не хранятся: это клетки таблиц, у которых есть владелец', () => {
    deepEq(fieldsOf(base).map(f => f.tag), ['level', 'abilities.сила.score', 'abilities.сила.mod', 'abilities.ловкость.score', 'abilities.ловкость.mod', 'skills.атлетика.total']);
    ok(world.system.safeParse(base).success);
    ok(!world.system.safeParse({ ...base, fields: [] }).success, 'хранимых полей в системе быть не может');
  });

  test('поле зовётся адресом клетки, а формула колонки пишется один раз', () => {
    eq(fieldOf(base, 'abilities.ловкость.mod')!.label, 'Модификатор: Ловкость');
    eq(fieldOf(base, 'abilities.ловкость.mod')!.group, 'Модификаторы');
    eq(fieldOf(base, 'abilities.ловкость.score')!.group, 'Характеристики');
    eq(at('abilities.сила.mod'), 3);
    eq(at('abilities.ловкость.score'), 10);
  });

  test('блок листа — кусок таблицы: колонки, строки, группировка по колонке', () => {
    const skill = fieldOf(base, 'skills.атлетика.total')!;
    eq(skill.group, 'Навыки');
    eq(skill.section, 'Сила');
    const only = copy();
    only.blocks = [{ name: 'Сила', parts: [{ table: 'abilities', rows: ['сила'] }] }];
    eq(fieldOf(only, 'abilities.сила.score')!.group, 'Сила');
    eq(fieldOf(only, 'abilities.ловкость.score')!.group, undefined);
    eq(fieldOf(only, 'level')!.group, undefined);
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
      ['округлить вниз((@abilities.сила.score - 10) / 2)', '@abilities.ловкость.score * 2']);
  });

  test('вид одной клетки лежит у строки и перебивает вид колонки', () => {
    const own = copy();
    own.tables!.abilities!.rows![0]!.view = { mod: { label: 'Мощь', roll: { die: 'к20', bonus: { expr: '@строка.mod' } } } };
    const field = fieldOf(own, 'abilities.сила.mod')!;
    eq(field.label, 'Мощь');
    eq(field.roll!.bonus!.expr, '@abilities.сила.mod');
    eq(fieldOf(own, 'abilities.ловкость.mod')!.label, 'Модификатор: Ловкость');
  });

  test('вписанное значение не становится полем — оно одинаковое у всех', () => {
    const fixed = copy();
    fixed.tables!.abilities!.rows![1]!.cells = { score: 14 };
    ok(!hasField(fixed, 'abilities.ловкость.score'));
    eq(at('abilities.ловкость.mod', fixed), 2);
  });

  test('без владельца таблица — справочник: пустая клетка просто пуста, полей нет', () => {
    const off = copy();
    delete off.tables!.skills!.owner;
    ok(!fieldsOf(off).some(f => f.cell?.table === 'skills'));
    eq(at('x', withColumn(off, { key: 'x', label: 'x', expr: { expr: '@skills.атлетика.total' } })), 4);
  });

  test('владелец таблицы — стол или группа: клетки лежат там', () => {
    const shared = copy();
    shared.tables!.abilities!.owner = 'desk';
    eq(fieldOf(shared, 'abilities.сила.score')!.lives, 'desk');
    const grouped = copy();
    grouped.tables!.лист!.owner = 'group';
    eq(fieldOf(grouped, 'level')!.lives, 'group');
  });

  test('адрес идёт по ссылке: навык → характеристика → модификатор', () => {
    eq(at('skills.атлетика.total'), 4);
    eq(at('via', withColumn(base, { key: 'via', label: 'через ссылку', expr: { expr: '@skills.атлетика.ability.mod' } })), 3);
  });

  test('выбор строки на листе по-прежнему ведёт в таблицу', () => {
    const picked = withColumn(
      withColumn(base, { key: 'pick', label: 'Выбор', kind: 'choice', from: 'abilities', default: 'сила' }),
      { key: 'picked', label: 'Модификатор выбранной', expr: { expr: '@pick.mod' } });
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
