import { describe, it, expect } from 'vitest';
import { parseRollExpr, formatRollExpr } from './roll-expr.ts';
import type { System } from '@vtt/schema';

const system = {
  tables: {},
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {},
} as unknown as System;

describe('parseRollExpr', () => {
  it('кость из словаря становится ссылкой на константу', () => {
    expect(parseRollExpr('1d20 + #бонус_атаки', system))
      .toEqual({ die: 'lead', bonus: { expr: '#бонус_атаки' } });
  });

  it('чужая кость — литералом, число — числом', () => {
    expect(parseRollExpr('2d6 + 3', system))
      .toEqual({ die: { expr: '"2d6"' }, bonus: { expr: '3' } });
  });

  it('кость с чтением, отличным от суммы, не подменяет литерал', () => {

    const withPool = {
      ...system,
      constants: { pool: { kind: 'die', dice: [{ count: 1, sides: 20 }], read: 'best' } },
    } as unknown as System;
    expect(parseRollExpr('1к20', withPool)).toEqual({ die: { expr: '"1d20"' }, bonus: null });
  });

  it('выбранная в подсказке кость связывается даже с чужим чтением', () => {
    const withPool = {
      ...system,
      constants: { pool: { label: 'Пул', kind: 'die', dice: [{ count: 5, sides: 10 }], read: 'count' } },
    } as unknown as System;
    expect(parseRollExpr('5d10', withPool, 'pool')).toEqual({ die: 'pool', bonus: null });
    expect(parseRollExpr('5d10', withPool)).toEqual({ die: { expr: '"5d10"' }, bonus: null },
      'без выбора — по-прежнему литерал');
  });

  it('выбор перестаёт действовать, когда нотацию переписали руками', () => {
    expect(parseRollExpr('2d6', system, 'lead')).toEqual({ die: { expr: '"2d6"' }, bonus: null });
  });

  it('кость без счёта и без хвоста', () => {
    expect(parseRollExpr('к20', system)).toEqual({ die: 'lead', bonus: null });
  });

  it('строка без кости — внятная ошибка', () => {
    expect(parseRollExpr('#сила + 2', system).error).toBeTruthy();
  });

  it('пусто — пустой бросок', () => {
    expect(parseRollExpr('', system)).toEqual({ die: undefined, bonus: null });
  });
});

describe('formatRollExpr', () => {
  it('константа и формула собираются обратно в строку', () => {
    expect(formatRollExpr({ die: 'lead', bonus: { expr: '#бонус_атаки' } }, system))
      .toBe('1к20 + #бонус_атаки');
  });

  it('литерал остаётся латиницей', () => {
    expect(formatRollExpr({ die: { expr: '"2d6"' } }, system)).toBe('2к6');
  });

  it('прибавка — формула как есть', () => {
    const как = (bonus: unknown) => formatRollExpr({ die: { expr: '"1d20"' }, bonus }, system);
    expect(как({ expr: '@attack_with' })).toBe('1к20 + @attack_with');
    expect(как({ expr: '@сила + 2' })).toBe('1к20 + @сила + 2');
  });

  it('набранная прибавка остаётся формулой — даже одно имя', () => {
    expect(parseRollExpr('1d20 + @attack_with', system, null).bonus).toEqual({ expr: '@attack_with' });
    expect(parseRollExpr('1d20 + @attack_with + 2', system, null).bonus).toEqual({ expr: '@attack_with + 2' });
  });
});
