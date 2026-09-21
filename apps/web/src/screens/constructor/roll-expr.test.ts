import { describe, it, expect } from 'vitest';
import { parseRollExpr, formatRollExpr, parseAmountExpr, formatAmountExpr } from './roll-expr.ts';
import type { System } from '@vtt/schema';

const system = {
  fields: [],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {},
} as unknown as System;

describe('parseRollExpr', () => {
  it('кость из словаря становится ссылкой на константу', () => {
    expect(parseRollExpr('1к20 + #бонус_атаки', system))
      .toEqual({ die: { constant: 'lead' }, bonus: { expr: '#бонус_атаки' } });
  });

  it('чужая кость — литералом, число — числом', () => {
    expect(parseRollExpr('2к6 + 3', system))
      .toEqual({ die: { const: '2d6' }, bonus: { const: 3 } });
  });

  it('кость с чтением, отличным от суммы, не подменяет литерал', () => {

    const withPool = {
      ...system,
      constants: { pool: { kind: 'die', dice: [{ count: 1, sides: 20 }], read: 'best' } },
    } as unknown as System;
    expect(parseRollExpr('1к20', withPool)).toEqual({ die: { const: '1d20' }, bonus: null });
  });

  it('выбранная в подсказке кость связывается даже с чужим чтением', () => {
    const withPool = {
      ...system,
      constants: { pool: { label: 'Пул', kind: 'die', dice: [{ count: 5, sides: 10 }], read: 'count' } },
    } as unknown as System;
    expect(parseRollExpr('5d10', withPool, 'pool')).toEqual({ die: { constant: 'pool' }, bonus: null });
    expect(parseRollExpr('5d10', withPool)).toEqual({ die: { const: '5d10' }, bonus: null },
      'без выбора — по-прежнему литерал');
  });

  it('выбор перестаёт действовать, когда нотацию переписали руками', () => {
    expect(parseRollExpr('2d6', system, 'lead')).toEqual({ die: { const: '2d6' }, bonus: null });
  });

  it('кость без счёта и без хвоста', () => {
    expect(parseRollExpr('к20', system)).toEqual({ die: { constant: 'lead' }, bonus: null });
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
    expect(formatRollExpr({ die: { constant: 'lead' }, bonus: { expr: '#бонус_атаки' } }, system))
      .toBe('1к20 + #бонус_атаки');
  });

  it('литерал остаётся латиницей', () => {
    expect(formatRollExpr({ die: { const: '2d6' } }, system)).toBe('2к6');
  });

  it('потребность и результат шага названы словами, а не ключом', () => {
    const names = new Map([['attack_with', 'Бонус атаки'], ['hit', 'шаг 1 · Проверка']]);
    expect(formatRollExpr({ die: { const: '1d20' }, bonus: { param: 'attack_with' } }, system, names))
      .toBe('1к20 + из записи: Бонус атаки');
    expect(formatRollExpr({ die: { const: '1d20' }, bonus: { ref: 'hit' } }, system, names))
      .toBe('1к20 + результат «шаг 1 · Проверка»');
    expect(formatRollExpr({ die: { const: '1d20' }, bonus: { param: 'нет_в_списке' } }, system))
      .toBe('1к20 + из записи: нет_в_списке');
  });
});

describe('parseAmountExpr', () => {
  it('кость с прибавкой делится как в броске', () => {
    expect(parseAmountExpr('1d8 + #мод', system))
      .toEqual({ die: { const: '1d8' }, bonus: { expr: '#мод' } });
  });

  it('без кости вся строка — величина', () => {
    expect(parseAmountExpr('#мод + 2', system)).toEqual({ die: undefined, bonus: { expr: '#мод + 2' } });
    expect(parseAmountExpr('3', system)).toEqual({ die: undefined, bonus: { const: 3 } });
  });

  it('пусто — пустая величина', () => {
    expect(parseAmountExpr('', system)).toEqual({ die: undefined, bonus: null });
  });
});

describe('formatAmountExpr', () => {
  it('кость и прибавка собираются в одну строку', () => {
    expect(formatAmountExpr({ dice: { const: '1d8' }, bonus: { expr: '#мод' } }, system))
      .toBe('1к8 + #мод');
  });
});
