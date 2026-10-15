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

describe('слова формул: итог вызова', () => {
  const withCall = {
    id: 'с', name: 'с', tables: {},
    effects: {
      бросок_атаки: {
        label: 'Бросок атаки',
        returns: [
          { key: 'попал', label: 'попадание', kind: 'boolean', no: 'промах' },
          { key: 'крит', label: 'крит', kind: 'boolean' },
          { key: 'на_костях', label: 'на костях', kind: 'number' },
        ],
        steps: [],
      },
      удар: {
        label: 'Удар',
        steps: [
          { id: 'попадание', type: 'emit', effect: 'бросок_атаки' },
          { id: 'второй_удар', type: 'emit', effect: 'бросок_атаки' },
        ],
      },
    },
  } as unknown as System;

  it('итог вызова называется подписью из имён места, а не первым похожим шагом системы', () => {
    const place = new Map([['попадание.попал', 'попадание'], ['попадание.крит', 'попадание — крит'], ['второй_удар.на_костях', 'второй удар — на костях']]);
    expect(formulaWords(withCall, '@попадание.попал', place)).toBe('«попадание»');
    expect(formulaWords(withCall, '@попадание.крит', place)).toBe('«попадание — крит»');
    expect(formulaWords(withCall, '@второй_удар.на_костях', place)).toBe('«второй удар — на костях»');
    expect(formulaWords(withCall, 'не @попадание.попал', place)).toBe('не «попадание»');
    expect(formulaWords(withCall, '@попадание.попал')).toBe('«попадание.попал»');
  });

  it('нет такого шага или такого итога — путь остаётся как есть', () => {
    expect(formulaWords(withCall, '@нет.крит')).toBe('«нет.крит»');
    expect(formulaWords(withCall, '@попадание.нет')).toBe('«попадание.нет»');
  });

  it('имя, которое экран уже знает целиком, сильнее; поля броска читаются по-прежнему', () => {
    const names = new Map([['попадание.крит', 'Бросок — критический']]);
    expect(formulaWords(withCall, '@попадание.крит', names)).toBe('«Бросок — критический»');
    expect(formulaWords(withCall, '@попадание.natural')).toBe('«попадание»: на кости');
  });
});

describe('слова формул: клетка своей строки', () => {
  const withRow = {
    id: 'с', name: 'с',
    tables: {
      лист: { shape: 'single', columns: [{ key: 'ac', label: 'Класс брони', kind: 'number', default: 10 }] },
      armor: { shape: 'book', use: 'item', label: 'Доспех', columns: [{ key: 'ac', label: 'База класса брони', kind: 'number' }, { key: 'total', label: 'Итого', kind: 'number' }] },
    },
    effects: {},
  } as unknown as System;
  const names = new Map([['строка', 'эта строка'], ['строка.ac', 'База класса брони'], ['строка.total', 'Итого']]);

  it('«строка» — не лист: колонка зовётся подписью из карты, а не «Класс брони (строка)»', () => {
    expect(formulaWords(withRow, '@строка.ac', names)).toBe('«База класса брони»');
    expect(formulaWords(withRow, '@строка.ac')).toBe('«строка.ac»');
    expect(formulaWords(withRow, '@носитель.ac')).toBe('«Класс брони (носитель)»');
  });

  it('колонка с именем поля броска остаётся колонкой', () => {
    expect(formulaWords(withRow, '@строка.total', names)).toBe('«Итого»');
    expect(formulaWords(withRow, '@строка.total + 1', names)).toBe('«Итого» + 1');
  });
});
