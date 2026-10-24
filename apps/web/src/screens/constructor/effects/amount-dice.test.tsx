// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
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

  it.each(['4к6', 'кинуть(4к6)', 'кинуть(4d6)'])('«%s» — один бросок 4к6, а не бросок уже брошенного числа', typed => {
    renderOpen(<EffectsTab />);
    within(stepCard(/^2 · /)).formula('Сколько', typed);
    const { steps, apply } = amountOf();
    const roll = steps.find(step => step.type === 'roll')!;
    expect(roll.die).toEqual({ expr: '"4d6"' });
    expect((apply.value as { expr: string }).expr).toBe(`@${String(roll.id)}`);
  });
});
