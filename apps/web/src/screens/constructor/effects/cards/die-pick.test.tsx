// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { pickCombo, comboOptions } from '../../../../testing/cards.ts';
import type { System, Effect, Step } from '@vtt/schema';
import { AddendPick } from './die-pick.tsx';
import { SeenBody } from './seen-body.tsx';

const system = {
  tables: {}, effects: {},
  constants: { к6: { label: 'Кость к6', kind: 'die', dice: [{ sides: 6 }] } },
} as unknown as System;

const effect = { params: [{ key: 'кость', label: 'Кость из записи', kind: 'dice' }] } as unknown as Effect;

const context = { system, effect, earlier: [] };

const select = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

const seen = (step: Record<string, unknown>) => {
  const draft = structuredClone(step);
  render(<SeenBody step={step as unknown as Step} context={context} edit={(_, change) => change(draft as never)} />);
  return draft;
};

describe('«Сколько» у прибавки: число или кость', () => {
  afterEach(cleanup);

  it('кость из списка пишется в die и снимает число', () => {
    const draft = seen({ type: 'roll-plus', value: { expr: '2' } });
    pickCombo(select('Сколько'), 'die:к6');
    expect(draft).toEqual({ type: 'roll-plus', die: 'к6' });
  });

  it('при выборе кости число уходит, а при возврате к числу уходят кость, счёт и минус', () => {
    const picked = structuredClone({ type: 'roll-plus', value: { expr: '2' } }) as Record<string, unknown>;
    render(<AddendPick source={picked} system={system} effect={effect} where="тест" onChange={change => change(picked)} />);
    pickCombo(select('Сколько'), 'expr:@кость');
    expect(picked).toEqual({ type: 'roll-plus', die: { expr: '@кость' } });
    cleanup();
    const back = { die: 'к6', count: { expr: '2' }, minus: true } as Record<string, unknown>;
    render(<AddendPick source={back} system={system} effect={effect} where="тест" onChange={change => change(back)} />);
    pickCombo(select('Сколько'), 'number');
    expect(back).toEqual({});
  });

  it('«вычесть» ставит minus: true, «прибавить» снимает ключ', () => {
    const minus = { die: 'к6' } as Record<string, unknown>;
    render(<AddendPick source={minus} system={system} effect={effect} where="тест" onChange={change => change(minus)} />);
    pickCombo(select('Прибавить или вычесть'), 'minus');
    expect(minus).toEqual({ die: 'к6', minus: true });
    cleanup();
    const plus = { die: 'к6', minus: true } as Record<string, unknown>;
    render(<AddendPick source={plus} system={system} effect={effect} where="тест" onChange={change => change(plus)} />);
    pickCombo(select('Прибавить или вычесть'), '');
    expect(plus).toEqual({ die: 'к6' });
  });

  it('холостое открытие данных не меняет; запись кости строкой «1к6» — своя кость, а не «такой нет в списке»', () => {
    const calls: unknown[] = [];
    const source = { die: '1к6' };
    render(<AddendPick source={source} system={system} where="тест" onChange={change => calls.push(change)} />);
    expect(calls).toEqual([]);
    expect(select('Сколько').value).toBe('своя кость…');
  });

  it('у слова правки броска числа в списке нет — только кости системы и своя', () => {
    render(<AddendPick source={{}} system={system} where="тест" dieOnly onChange={() => {}} />);
    const labels = comboOptions(select('Сколько')).map(option => option.label);
    expect(labels).toEqual(expect.arrayContaining(['Кость к6', 'своя кость…']));
    expect(labels).not.toContain('число / формула');
  });
});
