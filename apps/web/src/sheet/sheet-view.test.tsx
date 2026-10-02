// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetView } from './sheet-view.tsx';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 14, roll: { label: 'Проверка Ловкости' }, block: 'Характеристики' },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20, block: 'Здоровье' },
    { key: 'броня', label: 'Броня', expr: { expr: '10' }, block: 'Здоровье' },
  ] } },
} as unknown as System;

const sheet = { id: 'а', name: 'Арвен', values: { ловкость: 14, хиты: 17 } } as unknown as Sheet;

const reader: Reader = {
  valueOf: () => ({ ok: true, value: 12 }),
  rollOf: () => null,
};

describe('лист за столом', () => {
  afterEach(() => { cleanup(); });

  it('кнопка «бросить» есть только у поля с броском и зовёт его по тегу', () => {
    const rolled: string[] = [];
    render(<SheetView system={system} sheet={sheet} reader={reader} onChange={() => {}} onRoll={tag => rolled.push(tag)} />);

    const buttons = screen.getAllByText('бросить');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(rolled).toEqual(['ловкость']);
  });

  it('переключатель «да/нет» на числовом поле пишет 1 и 0, а не да/нет', () => {
    const toggled = { tables: { лист: { shape: 'single', columns: [{ key: 'бой', label: 'Идёт бой', kind: 'number', control: 'toggle' }] } } } as unknown as System;
    const written: unknown[] = [];
    render(<SheetView system={toggled} sheet={{ ...sheet, values: { бой: 0 } } as Sheet} reader={reader} onChange={(_, value) => written.push(value)} />);
    fireEvent.click(screen.getByText('нет'));
    expect(written).toEqual([1]);
  });

  it('вычисляемое поле не редактируется, а показывается', () => {
    render(<SheetView system={system} sheet={sheet} reader={reader} onChange={() => {}} />);
    const shown = [...document.querySelectorAll('.input--shown')].map(node => node.textContent);
    expect(shown).toEqual(['12']);
  });

  it('без onChange лист только читается', () => {
    render(<SheetView system={system} sheet={sheet} reader={reader} />);
    expect(document.querySelectorAll('input')).toHaveLength(0);
    expect(document.body.textContent).toContain('Арвен');
  });
});
