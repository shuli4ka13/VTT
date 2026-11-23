// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { EffectsTab } from './effects-tab.tsx';

const open = (tune: (system: System) => void) => {
  const world = structuredClone(SAMPLE_WORLDS.find(one => one.system.id === 'dnd5e')!);
  tune(world.system as System);
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: 'saving_throw', activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  render(<EffectsTab />);
  openAll();
};

const checkOf = () => (useWorld.getState().system!.effects.saving_throw!.steps as any[]).find(step => step.type === 'check');

const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label);

describe('«Проверка»: ступени списком', () => {
  afterEach(cleanup);

  it('список ступеней пишется в degrees и снимается вместе с ключом', () => {
    open(system => { delete (system.effects.saving_throw!.steps!.find((s: any) => s.type === 'check') as any).degrees; });
    expect(checkOf().degrees).toBeUndefined();
    fireEvent.click(button('+ ступень')!);
    expect(checkOf().degrees).toHaveLength(1);
    fireEvent.click(document.querySelector('[aria-label="убрать ступень"]')!);
    expect(checkOf()).not.toHaveProperty('degrees');
  });

  it('готовый список показан названиями ступеней', () => {
    open(system => { (system.effects.saving_throw!.steps!.find((s: any) => s.type === 'check') as any).degrees = [{ label: 'крит', if: { expr: '@margin >= 5' } }]; });
    expect([...document.querySelectorAll<HTMLInputElement>('.roll-degree input')].map(i => i.value)).toContain('крит');
  });
});
