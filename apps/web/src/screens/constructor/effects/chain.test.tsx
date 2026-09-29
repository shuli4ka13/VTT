// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chain } from './chain.tsx';
import { EffectEditor } from './effect-editor.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import type { Effect, System } from '@vtt/schema';

const withCost = (): System => ({
  ...emptySystem(),
  effects: {
    cost_action: { label: 'Стоимость: действие', group: 'Стоимость', activation: 'manual', params: [], steps: [] },
    удар: { label: 'Удар', activation: 'manual', params: [], steps: [] },
  },
} as unknown as System);

describe('стоимость эффекта — одним выбором', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: withCost() })); });

  const lane = (steps: unknown[] = []) => {
    const effect = { label: 'Удар', steps } as unknown as Effect;
    render(<Chain effect={effect} system={useWorld.getState().system} lane="sender"
      edit={change => change(effect)}
      onAddCost={id => { (effect.steps ??= []).unshift({ id: 'стоимость', type: 'emit', event: id, strict: true } as never); }} />);
    return effect;
  };

  it('выбор «+ стоимость» предлагает эффекты блока «Стоимость», выбранная встаёт первым шагом', () => {
    const effect = lane([{ type: 'apply', target: { tag: 'x' } }]);
    const pick = screen.getByDisplayValue('+ стоимость') as HTMLSelectElement;
    expect([...pick.options].map(o => o.textContent)).toEqual(['+ стоимость', 'Стоимость: действие', '+ новая стоимость…']);
    fireEvent.change(pick, { target: { value: 'cost_action' } });
    expect(effect.steps![0]).toEqual({ id: 'стоимость', type: 'emit', event: 'cost_action', strict: true });
  });

  it('«+ новая стоимость» заводит эффект в блоке «Стоимость» и сразу его зовёт', () => {
    const effect = lane();
    fireEvent.change(screen.getByDisplayValue('+ стоимость'), { target: { value: ':новая' } });
    const made = Object.entries(useWorld.getState().system.effects).find(([id]) => id.startsWith('стоимость'))!;
    expect(made[1]).toMatchObject({ group: 'Стоимость' });
    expect(effect.steps![0]).toMatchObject({ type: 'emit', event: made[0], strict: true });
  });

  it('в цепочке получателя стоимости нет', () => {
    const effect = { label: 'Удар', steps: [] } as unknown as Effect;
    render(<Chain effect={effect} system={withCost()} edit={() => {}} />);
    expect(screen.queryByDisplayValue('+ стоимость')).toBeNull();
  });

  it('«+ стоимость» стоит рядом с остальными шагами и ставит плату первым шагом «раз за действие»', () => {
    const view = () => {
      const system = useWorld.getState().system;
      return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
    };
    const { rerender } = render(view());
    fireEvent.change(screen.getByDisplayValue('+ стоимость'), { target: { value: 'cost_action' } });
    expect(useWorld.getState().system.effects.удар!.self).toEqual([{ id: 'стоимость', type: 'emit', event: 'cost_action', strict: true }]);
    rerender(view());
    expect(screen.getByText(/1 · Стоимость/)).toBeTruthy();
    expect(document.querySelector('.chip--on')?.textContent).toBe('раз за действие');
  });

  it('шаг, зовущий эффект из блока «Стоимость», так и подписан', () => {
    const effect = { label: 'Удар', steps: [{ id: 'стоимость', type: 'emit', event: 'cost_action', strict: true }] } as unknown as Effect;
    render(<Chain effect={effect} system={withCost()} lane="sender" edit={() => {}} />);
    expect(screen.getByText(/1 · Стоимость/)).toBeTruthy();
  });
});
