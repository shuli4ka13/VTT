// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ThingsList } from './things-list.tsx';
import type { System } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', effects: {},
  tables: {
    оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [] },
    доспех: { label: 'Доспех', shape: 'book', use: 'item', columns: [] },
  },
} as unknown as System;
const records = [{ id: 'меч', table: 'оружие', label: 'Меч' }, { id: 'кольчуга', table: 'доспех', label: 'Кольчуга' }];
const titles = () => [...document.querySelectorAll('.sheet-section__title')].map(node => node.textContent);

describe('снаряжение по типам', () => {
  afterEach(cleanup);

  it('без настройки — в порядке типов системы, с настройкой — в её порядке и только перечисленные', () => {
    const { rerender } = render(<ThingsList system={system} records={records} row={record => <p>{record.label}</p>} />);
    expect(titles()).toEqual(['Оружие', 'Доспех']);
    rerender(<ThingsList system={system} kinds={['доспех', 'оружие']} records={records} row={record => <p>{record.label}</p>} />);
    expect(titles()).toEqual(['Доспех', 'Оружие']);
    rerender(<ThingsList system={system} kinds={['доспех']} records={records} row={record => <p>{record.label}</p>} />);
    expect(titles()).toEqual(['Доспех']);
    expect(document.body.textContent).not.toContain('Меч');
  });
});
