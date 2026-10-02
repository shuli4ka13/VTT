// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TagsSection } from './tags-section.tsx';
import { CombatSection } from './combat-section.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import type { System } from '@vtt/schema';

const base = (): System => ({
  ...emptySystem(),
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
} as unknown as System);

describe('правила: метки и бой', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: base() })); });
  afterEach(cleanup);

  const editSystem = (change: (draft: System) => void) => useWorld.getState().editSystem(change);

  it('метку с договором заводят и дают ей обязательный вход', () => {
    const view = () => render(<TagsSection system={useWorld.getState().system} editSystem={editSystem} />);
    view();
    fireEvent.click(screen.getByText('+ метка'));
    cleanup();
    view();
    fireEvent.click(screen.getByText('Новая метка'));
    fireEvent.click(screen.getByText('+ вход'));
    const tag = Object.values(useWorld.getState().system.tags ?? {})[0]!;
    expect(tag.inputs).toEqual([{ key: 'действующий', kind: 'sheet' }]);
  });

  it('инициатива заводится костью системы, пределы по умолчанию в данные не пишутся', () => {
    render(<CombatSection system={useWorld.getState().system} editSystem={editSystem} />);
    fireEvent.click(screen.getByText('+ инициатива'));
    expect(useWorld.getState().system.initiative).toEqual({ die: 'к20' });
    expect((useWorld.getState().system as { limits?: unknown }).limits).toBeUndefined();
  });
});
