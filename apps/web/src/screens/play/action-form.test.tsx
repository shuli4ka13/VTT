// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActionForm } from './action-form.tsx';
import type { System, Compendium } from '@vtt/schema';

const system = {
  id: 'x', name: 'x',
  fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
  effects: {
    выстрел: {
      label: 'Выстрел', activation: 'manual',
      params: [
        { key: 'дистанция', label: 'Дистанция', kind: 'number', ask: { by: 'actor', kind: 'number', min: 1, max: 50 } },
        { key: 'куда', label: 'Куда целишься', kind: 'number', ask: { by: 'gm', kind: 'choice', options: ['тело', 'голова'] } },
      ],
      steps: [],
    },
    удар: { label: 'Удар', activation: 'manual', params: [], steps: [] },
  },
  records: {
    ствол: { kind: 'action', label: 'Ствол', props: [], bindings: [{ label: 'Выстрел', effect: 'выстрел', args: {} }] },
    меч: { kind: 'action', label: 'Меч', props: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
} as unknown as System;

const compendium = {
  items: [],
  actions: [
    { id: 'ствол', rk: 'ствол', label: 'Ствол', props: {} },
    { id: 'меч', rk: 'меч', label: 'Меч', props: {} },
  ],
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
