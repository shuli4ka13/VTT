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
      edit={change => change(effect)} />);
    return effect;
  };

  it('в «У отправителя» выбор предлагает эффекты блока «Стоимость», выбранная встаёт первым шагом', () => {
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

  it('у эффекта без стоимости выбор стоит строкой над цепочкой и заводит полосу отправителя', () => {
    const view = () => {
      const system = useWorld.getState().system;
      return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
    };
    const { rerender } = render(view());
    expect(screen.getByText('Чего стоит:')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('+ стоимость'), { target: { value: 'cost_action' } });
    expect(useWorld.getState().system.effects.удар!.self).toEqual([{ id: 'стоимость', type: 'emit', event: 'cost_action', strict: true }]);
    rerender(view());
    expect(screen.queryByText('Чего стоит:')).toBeNull();
  });
});
