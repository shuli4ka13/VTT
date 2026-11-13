// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { pickCombo } from '../../../testing/cards.ts';
import type { System, Effect } from '@vtt/schema';
import { CombatSection } from './combat-section.tsx';
import { TableColumnCard } from './tables-section.tsx';
import { ParamsEditor } from '../effects/params-editor.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';

afterEach(cleanup);

describe('поле боя и дистанция', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: emptySystem() as System })); });
  const editSystem = (change: (draft: System) => void) => useWorld.getState().editSystem(change);
  const Section = () => <CombatSection system={useWorld(s => s.system)} editSystem={editSystem} />;

  it('галочка «Есть поле с клетками» пишет сетку, диагональ по умолчанию не пишется, снятая убирает сетку', () => {
    render(<Section />);
    const check = screen.getByLabelText('Есть поле с клетками');
    fireEvent.click(check);
    expect(useWorld.getState().system.grid).toEqual({ step: 1 });
    fireEvent.change(screen.getByPlaceholderText('м'), { target: { value: 'фт' } });
    const diagonal = screen.getByDisplayValue('как одна клетка');
    pickCombo(diagonal, 'line');
    expect(useWorld.getState().system.grid).toEqual({ step: 1, unit: 'фт', diagonal: 'line' });
    pickCombo(screen.getByDisplayValue('по прямой'), 'one');
    expect(useWorld.getState().system.grid).toEqual({ step: 1, unit: 'фт' });
    fireEvent.click(screen.getByLabelText('Есть поле с клетками'));
    expect(useWorld.getState().system.grid).toBeUndefined();
  });

  it('у числовой колонки справочной таблицы выбирают границу дистанции, «нет» снимает ключ', () => {
    const system = { ...emptySystem(), tables: { range: { label: 'Дистанции', shape: 'rows', columns: [{ key: 'from', label: 'От', kind: 'number' }] } } } as unknown as System;
    act(() => { useWorld.getState().replaceWorld({ system, compendium: { records: [] }, sheets: [] }); });
    const Card = () => {
      const now = useWorld(s => s.system);
      const table = now.tables!.range!;
      return <TableColumnCard id="range" table={table} column={table.columns![0]!} system={now}
        edit={change => useWorld.getState().editSystem(draft => change(draft.tables!.range!))} onClose={() => {}} />;
    };
    render(<Card />);
    pickCombo(screen.getByDisplayValue('нет'), 'from');
    expect(useWorld.getState().system.tables!.range!.columns![0]!.bound).toBe('from');
    pickCombo(screen.getByDisplayValue('от'), '');
    expect(useWorld.getState().system.tables!.range!.columns![0]!.bound).toBeUndefined();
  });

  it('у спрашиваемого входа галочка «Заполнять дистанцией до цели» пишет и снимает меру', () => {
    const effect = { label: 'Выстрел', params: [{ key: 'метры', label: 'Метры', kind: 'number', ask: { by: 'actor' } }] } as unknown as Effect;
    const system = { tables: {}, effects: { shot: effect }, constants: {} } as unknown as System;
    const view = () => <ParamsEditor id="shot" effect={effect} system={system} onEdit={change => change(effect)} />;
    const mounted = render(view());
    fireEvent.click(document.querySelector('.param-line__name')!);
    fireEvent.click(screen.getByText('ещё'));
    const check = screen.getByLabelText('«Метры» — заполнять дистанцией до цели');
    fireEvent.click(check);
    expect((effect.params![0] as { measure?: boolean }).measure).toBe(true);
    mounted.rerender(view());
    fireEvent.click(screen.getByLabelText('«Метры» — заполнять дистанцией до цели'));
    expect('measure' in effect.params![0]!).toBe(false);
  });
});
