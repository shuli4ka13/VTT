import { describe, it, expect } from 'vitest';
import { parseRollExpr, formatRollExpr } from './roll-expr.ts';
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
      .toBe('1d20 + #бонус_атаки');
  });

  it('литерал остаётся латиницей', () => {
    expect(formatRollExpr({ die: { const: '2d6' } }, system)).toBe('2d6');
  });
});
