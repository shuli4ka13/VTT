// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActionForm } from './action-form.tsx';
import type { System, Compendium } from '@vtt/schema';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] }, места: { label: 'Места', key: 'word', rows: [{ value: 'тело', label: 'тело' }, { value: 'голова', label: 'голова' }] } , ствол: { shape: 'book', use: 'action', label: 'Ствол', columns: [], bindings: [{ label: 'Выстрел', effect: 'выстрел', args: {} }] }, меч: { shape: 'book', use: 'action', label: 'Меч', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }, граната: { shape: 'book', use: 'action', label: 'Граната', columns: [], bindings: [{ label: 'Бросить', effect: 'граната', args: {} }] } },
  effects: {
    выстрел: {
      label: 'Выстрел', activation: 'manual',
      params: [
        { key: 'дистанция', label: 'Дистанция', kind: 'number', min: 1, max: 50, ask: { by: 'actor' } },
        { key: 'куда', label: 'Куда целишься', kind: 'choice', from: 'места', ask: { by: 'gm' } },
      ],
      steps: [],
    },
    удар: { label: 'Удар', activation: 'manual', params: [], steps: [] },
    граната: {
      label: 'Граната', activation: 'manual',
      params: [{ key: 'место', label: 'Где цель', kind: 'choice', from: 'места', perTarget: true, ask: { by: 'actor' } }],
      steps: [],
    },
  },
  
} as unknown as System;

const compendium = {
  records: [{ id: 'ствол', table: 'ствол', label: 'Ствол', cells: {} }, { id: 'меч', table: 'меч', label: 'Меч', cells: {} }, { id: 'граната', table: 'граната', label: 'Граната', cells: {} }],
} as unknown as Compendium;

describe('форма действия спрашивает то, что объявлено', () => {
  afterEach(() => { cleanup(); });

  it('действие без вопросов — просто кнопка', () => {
    const sent: unknown[] = [];
    render(<ActionForm system={system} compendium={compendium} actionId="меч:0" label="Удар" onAct={r => sent.push(r)} />);
    fireEvent.click(screen.getByText('Удар'));
    expect(sent).toEqual([{ actionId: 'меч:0' }]);
  });

  it('число и выбор спрашиваются, ведущий подписан, пустое не уходит', () => {
    const sent: unknown[] = [];
    render(<ActionForm system={system} compendium={compendium} actionId="ствол:0" label="Выстрел" onAct={r => sent.push(r)} />);

    expect(screen.queryByText('Дистанция')).toBeNull();
    fireEvent.click(screen.getByText('Выстрел…'));

    expect(screen.getByText('Дистанция')).toBeTruthy();
    expect(screen.getByText('Куда целишься · говорит ведущий')).toBeTruthy();

    fireEvent.click(screen.getByText('Выстрел'));
    expect(sent).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('Дистанция');

    const number = document.querySelector('input[type=number]') as HTMLInputElement;
    fireEvent.change(number, { target: { value: '70' } });
    fireEvent.click(screen.getByText('Выстрел'));
    expect(screen.getByRole('alert').textContent).toContain('не больше 50');

    fireEvent.change(number, { target: { value: '7' } });
    fireEvent.change(document.querySelector('select')!, { target: { value: 'голова' } });
    fireEvent.click(screen.getByText('Выстрел'));

    expect(sent).toEqual([{ actionId: 'ствол:0', inputs: { дистанция: 7, куда: 'голова' } }]);
  });
});

describe('ожидание на кнопке', () => {
  afterEach(() => { cleanup(); });

  it('наведение считает ожидание и кладёт его в подсказку', () => {
    let asked = 0;
    render(<ActionForm system={system} compendium={compendium} actionId="меч:0" label="Удар" onAct={() => {}}
      expect={() => { asked++; return 'Удар: 11 против 10 — попадание'; }} />);
    const button = screen.getByText('Удар').closest('button') as HTMLButtonElement;
    expect(asked).toBe(0);
    fireEvent.mouseEnter(button);
    expect(asked).toBe(1);
    expect(button.title).toContain('по среднему');
    expect(button.title).toContain('попадание');
  });
});

describe('вход «для каждой цели»', () => {
  afterEach(() => { cleanup(); });

  it('без целей — подсказка выбрать цели; с двумя целями — два поля, ответ уходит по листам', () => {
    const sent: unknown[] = [];
    const { rerender } = render(<ActionForm system={system} compendium={compendium} actionId="граната:0" label="Бросить" onAct={r => sent.push(r)} />);
    fireEvent.click(screen.getByText('Бросить…'));
    expect(screen.getByText(/сначала выберите цели/)).toBeTruthy();

    rerender(<ActionForm system={system} compendium={compendium} actionId="граната:0" label="Бросить" onAct={r => sent.push(r)}
      targets={[{ id: 'а', name: 'Анна' }, { id: 'б', name: 'Борис' }]} />);
    expect(screen.getByText('Где цель · Анна')).toBeTruthy();
    const [first, second] = [...document.querySelectorAll('select')] as HTMLSelectElement[];
    fireEvent.change(first!, { target: { value: 'тело' } });
    fireEvent.click(screen.getByText('Бросить'));
    expect(sent).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('(б)');

    fireEvent.change(second!, { target: { value: 'голова' } });
    fireEvent.click(screen.getByText('Бросить'));
    expect(sent).toEqual([{ actionId: 'граната:0', inputs: { место: { а: 'тело', б: 'голова' } } }]);
  });
});
