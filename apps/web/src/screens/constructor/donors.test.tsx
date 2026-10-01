// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DonorPalette } from './donors.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';

describe('доноры-образцы', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: emptySystem(), activeEffectId: null }));
  });

  it('эффект с правкой броска привозит и саму правку, и ту, которой она гасится', () => {
    render(<DonorPalette kind="effects" />);

    fireEvent.click(screen.getByText(/^Отравлен$/));

    const system = useWorld.getState().system;
    const mods = Object.values(system.effects).flatMap(e => e.modifiers ?? []);
    const named = mods.filter(m => m.kind === 'edit' && m.edit).map(m => m.edit);

    expect(named.length, 'эффект приехал со ссылкой на правку').toBeGreaterThan(0);
    for (const key of named) {
      expect(system.roll_edits?.[key], `правка «${key}» приехала вместе с эффектом`).toBeTruthy();
    }

    const cancels = Object.values(system.roll_edits ?? {}).map(e => e.canceledBy).filter(Boolean);
    for (const key of cancels) {
      expect(system.roll_edits?.[key as string], 'встречная правка приехала тоже').toBeTruthy();
    }
  });

  it('своя правка с тем же ключом не затирается донором', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        roll_edits: { disadvantage: { label: 'Моя помеха', ops: [{ op: 'dieStep', by: -1 }] } },
      },
      activeEffectId: null,
    }));
    render(<DonorPalette kind="effects" />);
    fireEvent.click(screen.getByText(/^Отравлен$/));

    expect(useWorld.getState().system.roll_edits!.disadvantage!.label).toBe('Моя помеха');
  });
});
