// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { calc, newPass, baseOf, findField, fieldsOf } from '@vtt/engine';
import { SheetView } from './sheet-view.tsx';
import { missingOf } from './missing.ts';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  effects: {},
  tables: {
    races: { shape: 'rows', key: 'value', rows: [{ value: 'elf', label: 'Эльф' }, { value: 'dwarf', label: 'Дварф' }] },
    list: { shape: 'single', owner: 'sheet', columns: [
      { key: 'race', label: 'Раса', kind: 'choice', from: 'races' },
      { key: 'age', label: 'Возраст', kind: 'number' },
      { key: 'rank', label: 'Ранг', kind: 'number', default: 0 },
      { key: 'level', label: 'Уровень', kind: 'number', default: 1 },
      { key: 'hp_max', label: 'Максимум', kind: 'number', default: 10 },
      { key: 'hp', label: 'Хиты', kind: 'number', default: { expr: '@hp_max' } },
      { key: 'brave', label: 'Храбрый', kind: 'boolean' },
      { key: 'motto', label: 'Девиз', kind: 'text' },
    ] },
  },
} as unknown as System;

const sheetWith = (values: Record<string, unknown>) => ({ id: 's', values, has: [], effects: [] }) as unknown as Sheet;

const readerOf = (one: Sheet): Reader => {
  const pass = newPass(system as never, one as never);
  return {
    valueOf: tag => ({ ok: true, value: calc(system as never, one as never, tag, pass) }),
    rollOf: () => null,
    storedOf: tag => baseOf(pass, findField(system as never, tag)!),
  };
};

const missingOn = (one: Sheet, editing: boolean, writable = true) => {
  const { container } = render(<SheetView system={system} sheet={one} reader={readerOf(one)} editing={editing}
    {...(writable ? { onChange: () => undefined } : {})} />);
  return [...container.querySelectorAll('.field-missing')].map(node => node.querySelector('.field__missing')!.textContent);
};

describe('«выберите» у незаполненных выборов', () => {
  afterEach(() => { cleanup(); });

  it('правило: только выбор без значения — «выберите»; числа (у них естественный ноль), да/нет, текст, «при создании» — нет', () => {
    const blank = sheetWith({});
    const said = Object.fromEntries(fieldsOf(system as never).map(field => [field.tag, missingOf(system, blank, field)]));
    expect(said).toEqual({ race: 'pick', age: null, rank: null, level: null, hp_max: null, hp: null, brave: null, motto: null });
  });

  it('режим правки: подсвечен пустой выбор, подпись словами', () => {
    expect(missingOn(sheetWith({}), true)).toEqual(['выберите']);
  });

  it('выбранное значение снимает подсветку', () => {
    expect(missingOn(sheetWith({ race: 'elf' }), true)).toEqual([]);
  });

  it('обычный вид не подсвечивает', () => {
    expect(missingOn(sheetWith({}), false)).toEqual([]);
  });

  it('без права править поле не подсвечено', () => {
    expect(missingOn(sheetWith({}), true, false)).toEqual([]);
  });
});
