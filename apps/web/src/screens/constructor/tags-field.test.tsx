// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { TagsField } from './tags-field.tsx';
import type { TagValue } from './tags-field.tsx';
import type { System } from '@vtt/schema';
import { comboOptions, comboGroups, pickCombo } from '../../testing/cards.ts';
import { useWorld } from '../../store/world.ts';

const add = () => document.querySelector<HTMLElement>('.combo--add [role="combobox"]')!;

const system = {
  id: 's', name: 's', effects: {},
  tables: { броски: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спасбросок' }] } },
  tags: { атака: { label: 'Атака' } },
} as unknown as System;

describe('одно поле меток', () => {
  afterEach(cleanup);

  it('предлагает метки с договором, метки вызова, метки бросков и шаблоны строки группами', () => {
    render(<TagsField system={system} value={[]} onChange={() => {}} known={['огонь']} templates={[{ value: '{value}', label: 'ключ строки' }]} />);
    const groups = comboGroups(add()).map(([group]) => group);
    expect(groups).toEqual(['шаблоны строки', 'метки с договором', 'метки вызова', 'метки бросков · Броски', 'другое']);
  });

  it('вычисляемая метка пишется формулой только там, где разрешено', () => {
    let got: TagValue[] = [];
    render(<TagsField system={system} value={[]} computed onChange={next => { got = next; }} />);
    pickCombo(add(), ':формула');
    fireEvent.change(screen.getByPlaceholderText(/если\(рейтинг/), { target: { value: 'if(@rating == 0, "нулевой", "")' } });
    fireEvent.click(screen.getByText('добавить'));
    expect(got).toEqual([{ expr: 'if(@rating == 0, "нулевой", "")' }]);
    cleanup();
    render(<TagsField system={system} value={[]} onChange={() => {}} />);
    expect(comboOptions(add()).some(o => o.value === ':формула')).toBe(false);
  });

  it('метка не из словаря помечена; своя метка — только пунктом «новая метка…», ключ ей делается из названия, название — подписью', () => {
    let got: TagValue[] = [];
    render(<TagsField system={system} value={['атака', 'выдумана']} onChange={next => { got = next; }} />);
    expect(screen.getAllByText(/нет в словаре/)).toHaveLength(1);
    expect(document.querySelector('.tag-unknown')!.closest('.chip')!.textContent).toContain('выдумана');
    const options = comboOptions(add()).map(o => o.label);
    expect(options).toContain('новая метка…');
    pickCombo(add(), ':своя');
    fireEvent.change(screen.getByPlaceholderText('как назвать метку'), { target: { value: 'новая' } });
    fireEvent.click(screen.getByText('добавить'));
    expect(got).toEqual(['атака', 'выдумана', 'novaya']);
    expect(useWorld.getState().system.tags?.novaya).toEqual({ label: 'новая' });
  });

  it('автор книги для чужой системы новых меток не заводит — только выбирает из словаря системы', () => {
    const was = useWorld.getState().origin;
    useWorld.setState({ origin: { ...was, mode: 'compendium' } });
    render(<TagsField system={system} value={[]} onChange={() => {}} />);
    expect(comboOptions(add()).map(o => o.label)).not.toContain('новая метка…');
    useWorld.setState({ origin: was });
  });
});
