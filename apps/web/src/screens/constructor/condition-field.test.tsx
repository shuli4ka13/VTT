// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ConditionField, readyOf } from './condition-field.tsx';
import { within } from '../../testing/cards.ts';
import type { System } from '@vtt/schema';

const system = { id: 'x', name: 'x', tables: {}, effects: {} } as unknown as System;

describe('условие: частые условия в подсказках поля', () => {
  afterEach(cleanup);

  it('у да/нет есть своё слово «нет»: «Бросок атаки — попадание» и «Бросок атаки — промах»', () => {
    expect(readyOf([{ ref: 'попадание.попал', label: 'Бросок атаки — попадание', kind: 'boolean', no: 'Бросок атаки — промах' }], [])).toEqual([
      ['@попадание.попал', 'Бросок атаки — попадание'],
      ['not @попадание.попал', 'Бросок атаки — промах'],
    ]);
  });

  it('вход-да/нет без слова «нет» читается «— да» и «— нет»', () => {
    expect(readyOf([{ ref: 'ранен', label: 'Ранен', kind: 'boolean' }], []).map(([, label]) => label)).toEqual(['Ранен — да', 'Ранен — нет']);
  });

  it('выбранный в подсказках исход пишет условие, «нет» — отрицание', () => {
    let written: string | null = null;
    render(<ConditionField value="" onChange={next => { written = next; }} system={system} required where="проба"
      quick={[{ ref: 'попадание.попал', label: 'Бросок атаки — попадание', kind: 'boolean', no: 'Бросок атаки — промах' }]} />);
    within(document).when('Бросок атаки — промах');
    expect(written).toBe('not @попадание.попал');
  });
});
