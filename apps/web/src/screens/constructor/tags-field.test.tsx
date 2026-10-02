// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { TagsField } from './tags-field.tsx';
import type { TagValue } from './tags-field.tsx';
import type { System } from '@vtt/schema';

const system = {
  id: 's', name: 's', effects: {},
  tables: { броски: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спасбросок' }] } },
  tags: { атака: { label: 'Атака' } },
} as unknown as System;

describe('одно поле меток', () => {
  afterEach(cleanup);

  it('предлагает метки с договором, метки вызова, метки бросков и шаблоны строки группами', () => {
    render(<TagsField system={system} value={[]} onChange={() => {}} known={['огонь']} templates={[{ value: '{value}', label: 'ключ строки' }]} />);
    const groups = [...document.querySelectorAll('optgroup')].map(g => g.getAttribute('label'));
    expect(groups).toEqual(['шаблоны строки', 'метки с договором', 'метки вызова', 'метки бросков · Броски']);
  });

  it('вычисляемая метка пишется формулой только там, где разрешено', () => {
    let got: TagValue[] = [];
    render(<TagsField system={system} value={[]} computed onChange={next => { got = next; }} />);
    fireEvent.change(document.querySelector('select')!, { target: { value: ':формула' } });
    fireEvent.change(screen.getByPlaceholderText(/если\(@rating/), { target: { value: 'если(@rating == 0, "нулевой", "")' } });
    fireEvent.click(screen.getByText('добавить'));
    expect(got).toEqual([{ expr: 'если(@rating == 0, "нулевой", "")' }]);
    cleanup();
    render(<TagsField system={system} value={[]} onChange={() => {}} />);
    expect([...document.querySelectorAll('option')].some(o => o.value === ':формула')).toBe(false);
  });
});
