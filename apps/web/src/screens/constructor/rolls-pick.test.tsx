// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { comboOptions } from '../../testing/cards.ts';
import { RollsPick } from './rolls-pick.tsx';
import type { System } from '@vtt/schema';

const system = {
  constants: { d: { label: 'К20', kind: 'die', dice: [{ sides: 20 }] } },
  tables: {
    лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }] },
    виды: { label: 'Виды', rows: [{ value: 'проверка' }, { value: 'засада' }] },
  },
  rolls: { проверка: { label: 'Проверка', die: 'd', fields: [{ table: 'лист', column: 'сила', tags: ['мощь'] }] } },
  effects: { удар: { label: 'Удар', steps: [{ type: 'roll', die: 'd', tags: ['атака'] }] } },
} as unknown as System;

const fieldOf = (label: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('.field__label')].find(el => el.textContent === label)?.closest('label') ?? undefined;

describe('«Какие броски» — одно поле вместо трёх', () => {
  afterEach(cleanup);

  it('в списке сначала правила их названиями, потом метки, которые броски несут, потом остальное без повторов', () => {
    render(<RollsPick system={system} value={{}} onChange={vi.fn()} />);
    const combo = fieldOf('Какие броски')!.querySelector<HTMLElement>('[role="combobox"]')!;
    const items = comboOptions(combo);
    expect(items.slice(0, 3).map(one => `${one.group}: ${one.label}`)).toEqual([
      'правила бросков: Проверка',
      'метки, которые несут броски: атака',
      'метки, которые несут броски: мощь',
    ]);
    expect(items.filter(one => one.value === 'проверка')).toHaveLength(1);
    expect(items.some(one => one.value === 'засада')).toBe(true);
  });

  it('фишка правила показывает его название, подсказка объясняет, что ещё попадает', () => {
    render(<RollsPick system={system} value={{ tags: ['проверка'] }} onChange={vi.fn()} />);
    const field = fieldOf('Какие броски')!;
    expect(field.textContent).toContain('Проверка');
    expect(field.textContent).toContain('броски по полям этого правила и броски-шаги с меткой «проверка»');
  });

  it('«Или хотя бы одно из» и «Кроме» скрыты за «+ или / кроме», заполненные видны сразу', () => {
    render(<RollsPick system={system} value={{}} onChange={vi.fn()} />);
    expect(fieldOf('Кроме')).toBeUndefined();
    fireEvent.click(screen.getByText('+ или / кроме'));
    expect(fieldOf('Кроме')).toBeTruthy();
    expect(fieldOf('Или хотя бы одно из')).toBeTruthy();
    cleanup();
    render(<RollsPick system={system} value={{ notTags: ['атака'] }} onChange={vi.fn()} />);
    expect(fieldOf('Кроме')!.textContent).toContain('атака');
    expect(fieldOf('Или хотя бы одно из')).toBeUndefined();
  });

  it('выбор пишет свой ключ', () => {
    const onChange = vi.fn();
    render(<RollsPick system={system} value={{ tags: ['проверка'] }} onChange={onChange} />);
    const field = fieldOf('Какие броски')!;
    fireEvent.click(field.querySelector('.chip__x')!);
    expect(onChange).toHaveBeenCalledWith('tags', []);
  });

  it('два правила в «Какие броски» — подсказка говорит, что так не бывает', () => {
    const two = { ...system, rolls: { ...system.rolls, спас: { label: 'Спасбросок', die: 'd', fields: [] } } } as unknown as System;
    render(<RollsPick system={two} value={{ tags: ['проверка', 'спас'] }} onChange={vi.fn()} />);
    expect(fieldOf('Какие броски')!.textContent).toContain('Два правила сразу у одного броска не бывает');
  });
});
