import { describe, it, expect } from 'vitest';
import type { System, Modifier } from '@vtt/schema';
import { formulaWords } from './formula-words.ts';
import { modifierSentence } from '../screens/constructor/modifier-words.ts';

const system = { id: 'с', name: 'с', tables: {}, effects: {} } as unknown as System;

describe('слова формул: кости', () => {
  it('кинуть одну запись кости — просто кость', () => {
    expect(formulaWords(system, 'кинуть(к4)')).toBe('к4');
    expect(formulaWords(system, '-кинуть(1к4)')).toBe('−к4');
    expect(formulaWords(system, 'кинуть(2к6)')).toBe('2к6');
  });

  it('«сколько» с одним списком — просто сколько', () => {
    expect(formulaWords(system, 'сколько(@цели) != 1')).toBe('сколько «цели» ≠ 1');
  });

  it('недописанная формула не роняет пересказ', () => {
    for (const text of ['кинуть()', 'не()', 'сколько()', 'есть(@x)', 'первый()', 'или()']) {
      expect(() => formulaWords(system, text)).not.toThrow();
    }
    expect(formulaWords(system, 'кинуть()')).toBe('кинуть …');
  });

  it('метки броска в подписке «увидев кости»', () => {
    expect(formulaWords(system, 'есть(@roll.tags, "атака")')).toBe('«Бросок»: метки броска содержит «атака»');
  });

  it('прибавка к броску со знаком минус читается вычитанием', () => {
    const slowed = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-2' } } as unknown as Modifier;
    expect(modifierSentence(system, slowed)).toBe('Бросок, бросает кто угодно: − 2');
    const bane = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-кинуть(к4)' } } as unknown as Modifier;
    expect(modifierSentence(system, bane)).toBe('Бросок, бросает кто угодно: − к4');
  });
});
