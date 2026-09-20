// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetView } from './sheet-view.tsx';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  fields: [
    { tag: 'ловкость', label: 'Ловкость', group: 'Характеристики', roll: { label: 'Проверка Ловкости' }, value: { kind: 'stored', type: 'number', default: 14 } },
    { tag: 'хиты', label: 'Хиты', group: 'Здоровье', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'броня', label: 'Броня', group: 'Здоровье', value: { kind: 'formula', expr: '10' } },
  ],
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
