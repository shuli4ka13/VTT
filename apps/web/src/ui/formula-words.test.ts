import { describe, it, expect } from 'vitest';
import type { System, Modifier } from '@vtt/schema';
import { formulaWords, withTables } from './formula-words.ts';
import { choiceLits } from './formula-chips.tsx';
import { modifierSentence } from '../screens/constructor/modifier-words.ts';

const system = { id: 'с', name: 'с', tables: {}, effects: {} } as unknown as System;

describe('слова формул: кости', () => {
  it('запись кости в кавычках — просто кость; старая функция пересказ не роняет', () => {
    expect(formulaWords(system, '"2к6"')).toBe('«2к6»');
    expect(() => formulaWords(system, 'кинуть(к4)')).not.toThrow();
  });

  it('«сколько» с одним списком — просто сколько', () => {
    expect(formulaWords(system, 'сколько(@цели) != 1')).toBe('сколько «цели» ≠ 1');
  });

  it('недописанная формула не роняет пересказ', () => {
    for (const text of ['не()', 'сколько()', 'есть(@x)', 'первый()', 'или()']) {
      expect(() => formulaWords(system, text)).not.toThrow();
    }
  });

  it('метки броска в подписке «увидев кости»', () => {
    expect(formulaWords(system, 'есть(@roll.tags, "атака")')).toBe('«Бросок»: метки броска содержит «атака»');
  });

  it('прибавка к броску со знаком минус читается вычитанием', () => {
    const slowed = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-2' } } as unknown as Modifier;
    expect(modifierSentence(system, slowed)).toBe('Бросок, бросает кто угодно: − 2');
    const bane = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: { expr: '1к4' }, minus: true } as unknown as Modifier;
    expect(modifierSentence(system, bane)).toBe('Бросок, бросает кто угодно: − 1к4');
    const bless = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: { expr: '1к4' } } as unknown as Modifier;
    expect(modifierSentence(system, bless)).toBe('Бросок, бросает кто угодно: + 1к4');
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

describe('слова формул: значение выбора — подписью строки таблицы входа', () => {
  const chosen = {
    id: 'с', name: 'с', effects: {},
    tables: { черты: { label: 'Черты', columns: [], rows: [{ value: 'edge', label: 'Преимущество' }, { value: 'magic', label: 'Магия' }] } },
  } as unknown as System;

  it('вход-выбор сравнивается со строкой — слово строки', () => {
    expect(formulaWords(chosen, '@черта == "edge"', new Map([['черта', 'Характеристика']]), new Map([['черта', 'черты']])))
      .toBe('«Характеристика» = «Преимущество»');
  });

  it('без таблицы входа значение остаётся как написано', () => {
    expect(formulaWords(chosen, '@черта == "edge"', new Map([['черта', 'Характеристика']]))).toBe('«Характеристика» = «edge»');
  });
});

describe('слова формул: «есть в списке» и пересказ по именам с таблицами', () => {
  const chosen = {
    id: 'с', name: 'с', effects: {},
    tables: { черты: { label: 'Черты', columns: [], rows: [{ value: 'edge', label: 'Преимущество' }] } },
  } as unknown as System;

  it('значение в «есть» — слово строки', () => {
    expect(formulaWords(chosen, 'есть(@черты_выбраны, "edge")', new Map([['черты_выбраны', 'Черты']]), new Map([['черты_выбраны', 'черты']])))
      .toBe('«Черты» содержит «Преимущество»');
  });

  it('таблицы, привязанные к именам, видны без отдельного параметра', () => {
    const names = withTables(new Map([['черта', 'Характеристика']]), new Map([['черта', 'черты']]));
    expect(formulaWords(chosen, 'если(@черта == "edge", 1, 0)', names)).toBe('1, если «Характеристика» = «Преимущество», иначе 0');
  });
});

describe('поле формулы: значение выбора — фишкой со словом строки', () => {
  const chosen = {
    id: 'с', name: 'с', effects: {},
    tables: { черты: { label: 'Черты', columns: [], rows: [{ value: 'edge', label: 'Преимущество' }, { value: 'magic', label: 'Магия' }] } },
  } as unknown as System;

  it('значения в сравнении и в «есть» получают слова, формула не меняется', () => {
    const text = '@черта == "edge" или есть(@черты_выбраны, "magic")';
    const tables = new Map([['черта', 'черты'], ['черты_выбраны', 'черты']]);
    expect([...choiceLits(chosen, text, tables).values()]).toEqual(['Преимущество', 'Магия']);
  });
});
