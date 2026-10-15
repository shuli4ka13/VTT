// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ConditionField } from './condition-field.tsx';
import type { QuickRef } from './condition-field.tsx';
import type { System } from '@vtt/schema';

const system = { id: 'x', name: 'x', tables: {}, effects: {} } as unknown as System;

const options = (quick: QuickRef[]): [string, string][] => {
  render(<ConditionField value="" onChange={() => {}} system={system} quick={quick} required where="проба" />);
  const select = document.querySelector('select')!;
  return [...select.options].map(option => [option.value, option.textContent ?? '']);
};

describe('условие: быстрые исходы', () => {
  afterEach(cleanup);

  it('у да/нет есть своё слово «нет»: «Бросок атаки — попадание» и «Бросок атаки — промах»', () => {
    const found = options([{ ref: 'попадание.попал', label: 'Бросок атаки — попадание', kind: 'boolean', no: 'Бросок атаки — промах' }]);
    expect(found).toEqual([
      ['', '— что проверяем —'],
      ['попадание.попал', 'Бросок атаки — попадание'],
      [':не:попадание.попал', 'Бросок атаки — промах'],
      [':формула', 'формулой…'],
    ]);
  });

  it('вход-да/нет без слова «нет» читается «— да» и «— нет»', () => {
    const found = options([{ ref: 'ранен', label: 'Ранен', kind: 'boolean' }]);
    expect(found.map(([, label]) => label)).toEqual(['— что проверяем —', 'Ранен — да', 'Ранен — нет', 'формулой…']);
  });

  it('выбранный исход пишет условие, «нет» — отрицание', () => {
    let written: string | null = null;
    render(<ConditionField value="" onChange={next => { written = next; }} system={system} required where="проба"
      quick={[{ ref: 'попадание.попал', label: 'Бросок атаки — попадание', kind: 'boolean', no: 'Бросок атаки — промах' }]} />);
    fireEvent.change(document.querySelector('select')!, { target: { value: ':не:попадание.попал' } });
    expect(written).toBe('не @попадание.попал');
  });
});
