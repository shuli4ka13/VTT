// apps/web/src/screens/compendium/compendium.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompendiumScreen } from './compendium.tsx';
import { useWorld } from '../../store/world.ts';

describe('CompendiumScreen: запись говорит, что даст владельцу', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [], steps: [] },
        },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
          trinket: {
            kind: 'item', label: 'Безделушка', group: 'Прочее',
            props: [],
          },
        },
      },
      compendium: {
        items: [
          { id: 'sword', rk: 'weapon', label: 'Меч', props: {} },
          { id: 'bauble', rk: 'trinket', label: 'Побрякушка', props: {} },
        ],
        actions: [],
      },
      activeRecordId: 'sword',
    }));
  });

  it('показывает «владелец получит: Удар» для рода с привязкой', () => {
    render(<CompendiumScreen />);
    expect(screen.getByText('владелец получит: Удар')).toBeTruthy();
  });

  it('ничего не показывает у рода без привязок', () => {
    useWorld.setState({ activeRecordId: 'bauble' });
    render(<CompendiumScreen />);
    expect(screen.queryByText(/владелец получит/)).toBeNull();
  });
});
