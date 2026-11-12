// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DICE_BY_STEP } from '@vtt/engine/words/glossary';
import { cleanup, act, fireEvent } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { within, stepCard } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';

describe('кость в «Сколько» у «Изменения»', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'здоровье', label: 'Здоровье', kind: 'number', default: 40 }] } },
        effects: {
          выстрел: {
            label: 'Выстрел', activation: 'manual',
            params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } }],
            steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.здоровье' }, value: { expr: '1' } }],
          },
        },
      },
      activeEffectId: 'выстрел',
    }));
  });
  afterEach(() => { cleanup(); });

  const amountOf = () => {
    const steps = useWorld.getState().system.effects.выстрел!.steps! as unknown as Record<string, unknown>[];
    return { steps, apply: steps.find(step => step.type === 'apply')! };
  };

  it('вход-число из подсказки пишется в «Сколько» как есть — без лишнего шага «Число»', () => {
    useWorld.getState().editEffect('выстрел', draft => { draft.params!.push({ key: 'урон_оружия', label: 'Урон оружия', kind: 'number' }); });
    renderOpen(<EffectsTab />);
    const field = within(stepCard(/^2 · /)).field('Сколько');
    const chips = field.querySelector<HTMLElement>('.chips')!;
    act(() => { for (const x of [...chips.querySelectorAll<HTMLElement>('.chips__x')].reverse()) fireEvent.mouseDown(x); });
    const input = chips.querySelector<HTMLInputElement>('input.chips__text')!;
    act(() => {
      input.focus();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '@урон', selectionStart: 5 } });
    });
    const option = [...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('Урон оружия'))!;
    act(() => { fireEvent.mouseDown(option); });
    act(() => { fireEvent.keyDown(chips, { key: 'Enter' }); });
    const { steps, apply } = amountOf();
    expect(steps.some(step => step.type === 'roll'), 'шага «Число» нет').toBe(false);
    expect((apply.value as { expr: string }).expr).toBe('@урон_оружия');
  });

  it.each(['4к6', '4d6'])('«%s» — один бросок 4к6, а не бросок уже брошенного числа', typed => {
    renderOpen(<EffectsTab />);
    within(stepCard(/^2 · /)).formula('Сколько', typed);
    const { steps, apply } = amountOf();
    const roll = steps.find(step => step.type === 'roll')!;
    expect(roll.die).toEqual({ expr: '"4d6"' });
    expect((apply.value as { expr: string }).expr).toBe(`@${String(roll.id)}`);
  });

  it('старая запись «кинуть(4к6)» не превращается в шаг: подсказка — кости бросает шаг «Бросок»', () => {
    renderOpen(<EffectsTab />);
    within(stepCard(/^2 · /)).formula('Сколько', 'кинуть(4к6)');
    const { steps, apply } = amountOf();
    expect(steps.some(step => step.type === 'roll')).toBe(false);
    expect((apply.value as { expr: string }).expr).toBe('1');
    expect(document.body.textContent).toContain(DICE_BY_STEP);
  });
});
