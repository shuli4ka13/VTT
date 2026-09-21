import { group, test, eq, ok, throws } from './harness.ts';
import { lookupTable, lookupDegree, isCases } from '../src/engine/tables.ts';
import type { System } from '../src/model/types.ts';

const system = {
  id: 'т', name: 'т', fields: [], effects: {},
  tables: {
    по_уровню: { label: 'По уровню', ranges: [{ from: 1, to: 4, value: 2 }, { from: 5, to: 8, value: 3 }] },
    чем_бьёт: {
      label: 'Чем бьёт',
      cases: [
        { when: 'сила', value: '#melee_attack' },
        { when: 'ловкость', value: '#ranged_attack' },
        { when: 'лучшее', value: 'max(#melee_attack, #ranged_attack)' },
      ],
    },
    ступени: {
      label: 'Ступени',
      cases: [{ when: 0, value: 'нет' }, { when: 1, value: 'владение' }],
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
    eq(lookupTable(system, 'чем_бьёт', 'сила'), '#melee_attack');
    eq(lookupTable(system, 'чем_бьёт', 'ловкость'), '#ranged_attack');
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
