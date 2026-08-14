// apps/web/src/screens/constructor/donors.test.tsx
// @vitest-environment jsdom
//
// Донор обязан привозить ЗАКОНЫ МИРА, без которых взятый эффект не работает:
// кости, мишени бросков, типы действий и правки броска. Иначе в системе
// оседает ссылка в пустоту — а её видно только в момент броска за столом,
// то есть позже всего.

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
    // «Тяжёлый доспех мешает ловким проверкам» — правило комнаты образца 5e
    // с roll-модификатором, ссылающимся на запись «Помеха».
    fireEvent.click(screen.getByText(/Тяжёлый доспех/));

    const system = useWorld.getState().system;
    const mods = Object.values(system.effects).flatMap(e => e.modifiers ?? []);
    const named = mods.filter(m => m.kind === 'roll' && m.edit).map(m => m.edit);

    expect(named.length, 'эффект приехал со ссылкой на правку').toBeGreaterThan(0);
    for (const key of named) {
      expect(system.roll_edits?.[key], `правка «${key}» приехала вместе с эффектом`).toBeTruthy();
    }
    // Гашение — часть механики: помеха без преимущества гасить нечем.
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
    fireEvent.click(screen.getByText(/Тяжёлый доспех/));

    expect(useWorld.getState().system.roll_edits!.disadvantage!.label).toBe('Моя помеха');
  });
});
