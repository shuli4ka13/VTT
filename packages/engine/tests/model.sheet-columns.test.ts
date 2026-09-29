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
        { key: 'score', label: 'Значение', sheet: { tag: '{key}', label: '{label}', group: 'Характеристики', value: { kind: 'stored', type: 'number', default: 10 } } },
        { key: 'mod', label: 'Модификатор', sheet: { tag: '{key}_mod', label: 'Модификатор: {label}', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((@{key} - 10) / 2)' } } },
      ],
      rows: [{ value: 'сила', key: 'str', label: 'Сила' }, { value: 'ловкость', key: 'dex', label: 'Ловкость' }],
    },
    skills: {
      label: 'Навыки',
      columns: [
        { key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' },
        { key: 'total', label: 'Навык', sheet: { tag: '{key}', label: '{label}', group: 'Навыки', value: { kind: 'formula', expr: '@{ability.key}_mod + 1' } } },
      ],
      rows: [{ value: 'атлетика', key: 'athletics', label: 'Атлетика', cells: { ability: 'сила' } }],
    },
  },
} as unknown as System;

const sheet = { id: 'h', systemId: 's', name: 'h', values: { str: 16 }, has: [], effects: [] } as Sheet;

group('колонка таблицы, своя у каждого листа', () => {
  const system = withTableFields(base);
  const at = (tag: string) => calc(system, sheet, tag, newPass(system, sheet));

  test('формула колонки пишется один раз — поля по строкам появляются сами', () => {
    deepEq(system.fields.map(f => f.tag), ['level', 'str', 'str_mod', 'dex', 'dex_mod', 'athletics']);
    eq(system.fields.find(f => f.tag === 'dex_mod')!.label, 'Модификатор: Ловкость');
    eq(at('str_mod'), 3);
  });

  test('строка ссылается на строку другой таблицы: навык берёт модификатор своей характеристики', () => {
    eq(at('athletics'), 4);
  });

  test('таблица по-прежнему таблица: поиск по слову читает ячейку с листа', () => {
    const withLookup = { ...system, fields: [...system.fields, { tag: 'pick', label: 'Выбор', value: { kind: 'stored', type: 'choice', from: 'abilities', default: 'сила' } }, { tag: 'picked', label: 'Модификатор выбранной', value: { kind: 'formula', expr: '@pick.mod' } }] } as System;
    eq(calc(withLookup, sheet, 'picked', newPass(withLookup, sheet)), 3);
  });

  test('повторная сборка ничего не меняет, а правка поля в обход таблицы — ошибка проверки', () => {
    ok(withTableFields(system) === system);
    deepEq(errorsOf(lintSystem(system)).map(e => e.text), []);
    const broken = { ...system, fields: system.fields.map(f => (f.tag === 'str_mod' ? { ...f, label: 'руками' } : f)) } as System;
    ok(errorsOf(lintSystem(broken)).some(e => e.text.includes('разошлись')));
  });
});
