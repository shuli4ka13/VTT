import { group, test, eq, ok, deepEq } from './harness.ts';
import { withTableFields } from '../src/model/sheet-columns.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet } from '../src/model/types.ts';

const base = {
  id: 's', name: 's', effects: {},
  fields: [{ tag: 'level', label: 'Уровень', value: { kind: 'stored', type: 'number', default: 1 } }],
  tables: {
    abilities: {
      label: 'Характеристики',
      columns: [
        { key: 'score', label: 'Значение', kind: 'number' },
        { key: 'mod', label: 'Модификатор', kind: 'number', expr: 'округлить вниз((@строка.score - 10) / 2)' },
      ],
      rows: [{ value: 'сила', key: 'str', label: 'Сила' }, { value: 'ловкость', key: 'dex', label: 'Ловкость' }],
      sheet: { group: 'Характеристики', columns: { score: { start: 10 }, mod: { label: 'Модификатор: {label}', group: 'Модификаторы' } } },
    },
    skills: {
      label: 'Навыки',
      columns: [
        { key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' },
        { key: 'total', label: 'Навык', kind: 'number', expr: '@строка.ability.mod + 1' },
      ],
      rows: [{ value: 'атлетика', key: 'athletics', label: 'Атлетика', cells: { ability: 'сила' } }],
      sheet: { group: 'Навыки' },
    },
  },
} as unknown as System;

const sheet = { id: 'h', systemId: 's', name: 'h', values: { 'abilities.str.score': 16 }, has: [], effects: [] } as Sheet;

group('таблица на листе: пустая клетка — ввод, формула — считается, значение — одно на всех', () => {
  const system = withTableFields(base);
  const at = (tag: string, on: System = system) => calc(on, sheet, tag, newPass(on, sheet));

  test('поле зовётся адресом клетки, а формула колонки пишется один раз', () => {
    deepEq(system.fields.map(f => f.tag), ['level', 'abilities.str.score', 'abilities.str.mod', 'abilities.dex.score', 'abilities.dex.mod', 'skills.athletics.total']);
    eq(system.fields.find(f => f.tag === 'abilities.dex.mod')!.label, 'Модификатор: Ловкость');
    eq(at('abilities.str.mod'), 3);
    eq(at('abilities.dex.score'), 10);
  });

  test('своя формула в клетке перебивает формулу колонки', () => {
    const own = structuredClone(base) as System;
    own.tables!.abilities!.rows![1]!.cells = { mod: { expr: '@строка.score * 2' } };
    const built = withTableFields(own);
    deepEq(built.fields.filter(f => f.cell?.column === 'mod').map(f => (f.value as { expr: string }).expr),
      ['округлить вниз((@abilities.str.score - 10) / 2)', '@abilities.dex.score * 2']);
  });

  test('вписанное значение не становится полем — оно одинаковое у всех', () => {
    const fixed = structuredClone(base) as System;
    fixed.tables!.abilities!.rows![1]!.cells = { score: 14 };
    const built = withTableFields(fixed);
    ok(!built.fields.some(f => f.tag === 'abilities.dex.score'));
    eq(at('abilities.dex.mod', built), 2);
  });

  test('без листа пустая клетка — просто пусто, полей нет', () => {
    const off = structuredClone(base) as System;
    delete off.tables!.skills!.sheet;
    const built = withTableFields(off);
    ok(!built.fields.some(f => f.cell?.table === 'skills'));
    const reader = { ...built, fields: [...built.fields, { tag: 'x', label: 'x', value: { kind: 'formula', expr: '@skills.athletics.total' } }] } as System;
    eq(at('x', reader), 4);
  });

  test('адрес идёт по ссылке: навык → характеристика → модификатор', () => {
    eq(at('skills.athletics.total'), 4);
    const withPath = { ...system, fields: [...system.fields, { tag: 'via', label: 'через ссылку', value: { kind: 'formula', expr: '@skills.athletics.ability.mod' } }] } as System;
    eq(at('via', withPath), 3);
  });

  test('выбор строки на листе по-прежнему ведёт в таблицу', () => {
    const withLookup = { ...system, fields: [...system.fields, { tag: 'pick', label: 'Выбор', value: { kind: 'stored', type: 'choice', from: 'abilities', default: 'сила' } }, { tag: 'picked', label: 'Модификатор выбранной', value: { kind: 'formula', expr: '@pick.mod' } }] } as System;
    eq(at('picked', withLookup), 3);
  });

  test('повторная сборка ничего не меняет, а правка поля в обход таблицы — ошибка проверки', () => {
    ok(withTableFields(system) === system);
    deepEq(errorsOf(lintSystem(system)).map(e => e.text), []);
    const broken = { ...system, fields: system.fields.map(f => (f.tag === 'abilities.str.mod' ? { ...f, label: 'руками' } : f)) } as System;
    ok(errorsOf(lintSystem(broken)).some(e => e.text.includes('разошлись')));
  });
});
