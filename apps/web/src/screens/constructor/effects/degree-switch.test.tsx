// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';

const open = (systemId: string, effect: string) => {
  const world = structuredClone(SAMPLE_WORLDS.find(one => one.system.id === systemId)!);
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: effect, activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  render(<EffectsTab />);
  openAll();
};

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('«Если» по ступеням — switch', () => {
  afterEach(cleanup);

  it('блок по ступеням проверки подписан ступенями; недостающая ступень — кнопкой внизу', () => {
    open('blades', 'risky_action');
    const switchBlock = [...document.querySelectorAll('.flow-block')].find(one => text(one).includes('По ступени'))!;
    expect(switchBlock).toBeTruthy();
    expect(text(switchBlock)).toContain('успех с последствием:');
    expect(text(switchBlock)).toContain('провал:');
    const foot = switchBlock.querySelector<HTMLElement>(':scope > .flow-block__foot')!;
    expect(within(foot).has('+ успех')).toBe(true);
    expect(within(foot).has('+ иначе, если')).toBe(false);
  });
});
