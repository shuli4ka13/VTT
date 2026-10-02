import { group, test, eq, ok, throws } from './harness.ts';
import { lookupTable, lookupDegree, isCases } from '../src/engine/tables.ts';
import { exchange } from './play.ts';
import type { System } from '../src/model/types.ts';

const system = {
  id: 'т', name: 'т', effects: {},
  tables: {
    по_уровню: {
      label: 'По уровню', key: 'range', columns: [{ key: 'value', label: 'значение', kind: 'number' }],
      rows: [{ from: 1, to: 4, cells: { value: 2 } }, { from: 5, to: 8, cells: { value: 3 } }],
    },
    чем_бьёт: {
      label: 'Чем бьёт', key: 'word', columns: [{ key: 'value', label: 'формула', kind: 'expr' }],
      rows: [
        { value: 'сила', cells: { value: '@melee_attack' } },
        { value: 'ловкость', cells: { value: '@ranged_attack' } },
        { value: 'лучшее', cells: { value: 'большее из(@melee_attack, @ranged_attack)' } },
      ],
    },
    ступени: {
      label: 'Ступени', key: 'word', columns: [{ key: 'value', label: 'ступень', kind: 'text' }],
      rows: [{ value: 0, cells: { value: 'нет' } }, { value: 1, cells: { value: 'владение' } }],
      otherwise: 'мастерство',
    },
  },
} as unknown as System;

group('таблица умеет и диапазоны, и соответствия', () => {
  test('диапазоны считаются как раньше', () => {
    eq(lookupTable(system, 'по_уровню', 3), 2);
    eq(lookupTable(system, 'по_уровню', 7), 3);
    eq(isCases(system.tables!.по_уровню!), false);
  });

  test('соответствие по слову даёт свою формулу', () => {
    eq(lookupTable(system, 'чем_бьёт', 'сила'), '@melee_attack');
    eq(lookupTable(system, 'чем_бьёт', 'ловкость'), '@ranged_attack');
    ok(isCases(system.tables!.чем_бьёт!));
  });

  test('число и строка считаются одним и тем же ключом', () => {
    eq(lookupTable(system, 'ступени', 1), 'владение');
    eq(lookupTable(system, 'ступени', '1'), 'владение');
  });

  test('«иначе» ловит всё, чего нет в списке', () => {
    eq(lookupTable(system, 'ступени', 2), 'мастерство');
    eq(lookupTable(system, 'ступени', 'что угодно'), 'мастерство');
  });

  test('без «иначе» непонятное значение — внятная ошибка со списком', () => {
    const беда = throws(() => lookupTable(system, 'чем_бьёт', 'телекинез'));
    ok(String(беда.message).includes('телекинез'), String(беда.message));
    ok(String(беда.message).includes('сила'), String(беда.message));
  });

  test('степени по таблице соответствий читаются как обычный поиск', () => {
    eq(lookupDegree(system, 'ступени', 0), 'нет');
  });
});

group('формула видит результат шага выше', () => {
  test('крит пишется формулой, порог берётся с листа', () => {
    const система = {
      id: 'к', name: 'к',
      tables: { лист: { shape: 'single', owner: 'sheet', columns: [
        { key: 'хиты', label: 'Хиты', kind: 'number', default: 100, min: 0 },
        { key: 'порог', label: 'Крит от', kind: 'number', default: 20 },
      ] } , приём: { shape: 'book', use: 'action', label: 'Приём', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
      constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      effects: {
        удар: {
          label: 'Удар', activation: 'manual',
          params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
          steps: [
            { type: 'each', of: 'цели', as: 'цель' },
            { id: 'бросок', type: 'roll', die: { constant: 'к20' }, by: { expr: '@действующий' } },
            { id: 'урон', type: 'roll', die: { const: '1d6' },
              count: { expr: 'если(@бросок.natural >= @действующий.порог, 2, 1)' } },
            { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } },
          ],
        },
      },
      
    } as unknown as System;
    const книга = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as never;
    const лист = (порог: number) => ({
      id: 'я', systemId: 'к', name: 'я',
      values: { порог }, has: [{ of: 'приём' }], effects: []
    } as never);

    const кости = (порог: number, выпало: number): string => {
      const цель = { id: 'цель', systemId: 'к', name: 'цель', values: {}, has: [], effects: [] } as never;
      const итог = exchange({ system: система, compendium: книга, die: () => выпало, sheets: [лист(порог), цель], actionId: 'приём:0', fromId: 'я', toId: 'цель' });
      const брошено = (итог.reports[0]!.report.trace.find((t: Record<string, unknown>) => t.step === 'урон')?.rolls ?? []) as number[];
      return `${брошено.length}d6`;
    };

    eq(кости(20, 10), '1d6', 'обычный бросок — одна кость');
    eq(кости(20, 20), '2d6', 'двадцатка при пороге 20 — две');
    eq(кости(19, 19), '2d6', 'у кого крит от 19 — девятнадцать тоже крит');
    eq(кости(20, 19), '1d6', 'у остальных девятнадцать — обычный');
  });
});

group('ключ строки — одно из трёх', () => {
  const система = {
    id: 'к', name: 'к', effects: {},
    tables: {
      типы: { label: 'Типы урона', key: 'word', rows: [{ value: 'огонь', label: 'огонь' }, { value: 'холод', label: 'холод' }] },
      ступени: {
        label: 'Ступени', key: 'number', columns: [{ key: 'value', label: 'множитель', kind: 'number' }],
        rows: [{ value: 0, cells: { value: 1 } }, { value: 1, cells: { value: 2 } }],
      },
    },
  } as unknown as System;

  test('число-ключ находит строку и по числу, и по строке «1»', () => {
    eq(lookupTable(система, 'ступени', 1), 2);
    eq(lookupTable(система, 'ступени', '1'), 2);
  });

});
