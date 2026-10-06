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
    render(<Chain id="удар" placeAt={index => ({ part: 'steps', index })} effect={effect} system={useWorld.getState().system} lane="steps"
      edit={change => change(effect)}
      onAddCost={id => { (effect.steps ??= []).unshift({ id: 'стоимость', type: 'emit', effect: id } as never); }} />);
    return effect;
  };

  it('выбор «+ стоимость» предлагает эффекты блока «Стоимость», выбранная встаёт первым шагом', () => {
    const effect = lane([{ type: 'apply', target: { tag: 'x' } }]);
    const pick = screen.getByDisplayValue('+ стоимость') as HTMLSelectElement;
    expect([...pick.options].map(o => o.textContent)).toEqual(['+ стоимость', 'Стоимость: действие', '+ новая стоимость…']);
    fireEvent.change(pick, { target: { value: 'cost_action' } });
    expect(effect.steps![0]).toEqual({ id: 'стоимость', type: 'emit', effect: 'cost_action' });
  });

  it('«+ новая стоимость» заводит эффект в блоке «Стоимость» и сразу его зовёт', () => {
    const effect = lane();
    fireEvent.change(screen.getByDisplayValue('+ стоимость'), { target: { value: ':новая' } });
    const made = Object.entries(useWorld.getState().system.effects).find(([id]) => id.startsWith('стоимость'))!;
    expect(made[1]).toMatchObject({ group: 'Стоимость' });
    expect(effect.steps![0]).toMatchObject({ type: 'emit', effect: made[0] });
  });

  it('без «onAddCost» (цепочка хука или подписки без решения) выбора стоимости нет', () => {
    const effect = { label: 'Удар', steps: [] } as unknown as Effect;
    render(<Chain id="удар" placeAt={index => ({ part: 'steps', index })} effect={effect} system={withCost()} edit={() => {}} />);
    expect(screen.queryByDisplayValue('+ стоимость')).toBeNull();
  });

  it('«+ стоимость» стоит рядом с остальными шагами и ставит плату первым шагом с меткой «цена»', () => {
    const view = () => {
      const system = useWorld.getState().system;
      return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
    };
    const { rerender } = render(view());
    fireEvent.change(screen.getByDisplayValue('+ стоимость'), { target: { value: 'cost_action' } });
    expect(useWorld.getState().system.effects.удар!.cost).toEqual([{ type: 'emit', effect: 'cost_action' }]);
    rerender(view());
    expect(screen.getByText(/1 · Стоимость/)).toBeTruthy();
    expect(document.querySelector('.chip--on')?.textContent).toBe('цена');
  });

  it('шаг, зовущий эффект из блока «Стоимость», так и подписан', () => {
    const effect = { label: 'Удар', steps: [{ id: 'стоимость', type: 'emit', effect: 'cost_action' }] } as unknown as Effect;
    render(<Chain id="удар" placeAt={index => ({ part: "steps", index })} effect={effect} system={withCost()} lane="steps" edit={() => {}} />);
    expect(screen.getByText(/1 · Стоимость/)).toBeTruthy();
  });
});

describe('имя одного из списка видно шагам после перебора', () => {
  it('«Атака» D&D открывается без ошибки «цель — нет ни входа, ни шага», а в подсказках результатов перебора нет', async () => {
    const { SAMPLE_SYSTEMS } = await import('@vtt/engine/model/systems');
    const system = SAMPLE_SYSTEMS.find(one => one.id === 'dnd5e')! as System;
    useWorld.setState(state => ({ ...state, system }));
    const effect = system.effects.strike!;
    render(<Chain id="strike" placeAt={index => ({ part: 'steps', index })} effect={effect} system={system} lane="steps" edit={() => {}} />);
    expect(document.body.textContent).not.toContain('нет ни входа, ни шага');
    expect(document.body.textContent).not.toContain('split');
  });
});
