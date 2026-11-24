// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';

const open = (systemId: string, effect: string, tune?: (system: System) => void) => {
  const world = structuredClone(SAMPLE_WORLDS.find(one => one.system.id === systemId)!);
  tune?.(world.system as System);
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: effect, activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  render(<EffectsTab />);
  openAll();
};

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ');

const switches = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.flow-block')]
  .filter(one => [...one.querySelectorAll(':scope > .flow-block__part .flow-head__word')].some(word => /(^|· )По$/.test(word.textContent ?? ''))
    || [...one.querySelectorAll(':scope > .flow-block__part > .flow-head .flow-head__words')].some(words => /^по итогу/.test(words.textContent ?? '')));

describe('«Если» по ступеням — switch', () => {
  afterEach(cleanup);

  it('блок по ступеням проверки подписан ступенями; недостающая ступень — кнопкой внизу', () => {
    open('blades', 'risky_action');
    const switchBlock = switches()[0]!;
    expect(text(switchBlock)).toContain('ступени «бросок»');
    expect(text(switchBlock)).toContain('успех с последствием:');
    expect(text(switchBlock)).toContain('провал:');
    const foot = switchBlock.querySelector<HTMLElement>(':scope > .flow-block__foot')!;
    expect(within(foot).has('+ успех')).toBe(true);
    expect(within(foot).has('+ иначе, если')).toBe(false);
  });

  it('switch по входу-выбору: «Призвать духа» — руки по видам духов', () => {
    open('shadowrun6', 'summon_spirit', system => {
      const steps = system.effects.summon_spirit!.steps!;
      const kinds = ['воздуха', 'земли', 'предков'];
      steps.splice(10, 0, ...kinds.flatMap((kind, i) => [
        { type: i === 0 ? 'branch' : 'orElse', if: { expr: `@kind == "${kind}"` } },
        { type: 'apply', target: { expr: '@цель.services' }, direction: 'set', value: { expr: '1' } },
      ] as never[]), { type: 'end' } as never);
    });
    const spirits = switches().map(text).join(' | ');
    expect(spirits).toContain('воздуха:');
    expect(spirits).toContain('предков:');
  }, 60_000);

  it('switch по полю листа: «Удар льда» — руки по типам льда', () => {
    open('shadowrun6', 'ic_attack', system => {
      const steps = system.effects.ic_attack!.steps!;
      const kinds = ['взрывной', 'искрящий', 'чёрный'];
      steps.splice(6, steps.length - 6, ...kinds.flatMap((kind, i) => [
        { type: i === 0 ? 'branch' : 'orElse', if: { expr: `@deystvuyuschiy.ic_kind == "${kind}"` } },
        { type: 'status', effect: 'link_lock', to: { expr: '@cel' } },
      ] as never[]), { type: 'end' } as never);
    });
    expect(switches().map(text).join(' | ')).toContain('чёрный:');
  }, 60_000);

  it('switch по итогу вызова-выбору: фишка «кто ведёт» у вызова режима езды даёт руки сам / водитель / захват', () => {
    open('shadowrun6', 'drive_check');
    expect(within(document.body).has('+ по итогу')).toBe(false);
    const chip = [...document.querySelectorAll<HTMLElement>('.result-chip')].find(one => one.querySelector('.result-chip__label')?.textContent === 'кто ведёт')!;
    fireEvent.click(chip.querySelector<HTMLElement>('.result-chip__face')!);
    fireEvent.click([...chip.querySelectorAll<HTMLElement>('.result-table__fork')].find(one => (one.textContent ?? '').includes('сам · водитель · захват'))!);
    const block = switches().find(one => text(one).includes('«кто ведёт»'))!;
    expect(text(block)).toContain('сам:');
    expect(text(block)).toContain('водитель:');
    expect(text(block)).toContain('захват:');
    expect(within(document.body).has('+ по итогу')).toBe(false);
    const steps = useWorld.getState().system.effects.drive_check!.steps!;
    expect(steps.some(step => (step as { if?: { expr?: string } }).if?.expr === '@rezhim.kto == "zahvat"')).toBe(true);
  }, 60_000);
});
