// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
    open('shadowrun6', 'summon_spirit');
    const spirits = switches().map(text).join(' | ');
    expect(spirits).toContain('воздуха:');
    expect(spirits).toContain('предков:');
  }, 60_000);

  it('switch по полю листа: «Удар льда» — руки по типам льда', () => {
    open('shadowrun6', 'ic_attack');
    expect(switches().map(text).join(' | ')).toContain('чёрный:');
  }, 60_000);

  it('switch по итогу вызова-выбору: у склеенного «да / нет» нет «+ по итогу»; сняв развилку, фишка «исход» у броска атаки даёт руки промах / попадание / крит', () => {
    open('dnd5e', 'strike');
    expect(within(document.body).has('+ по итогу')).toBe(false);
    const fused = [...document.querySelectorAll<HTMLElement>('.flow-block')].find(one => text(one).includes('Бросок атаки'))!;
    within(fused.querySelector<HTMLElement>(':scope > .flow-block__part > .flow-head, :scope > .flow-block__part')!).click('Удалить');
    within(document.body).click('только развилку — шаги останутся');
    const chip = [...document.querySelectorAll<HTMLElement>('.result-chip')].find(one => one.querySelector('.result-chip__label')?.textContent === 'исход')!;
    fireEvent.click(chip.querySelector<HTMLElement>('.result-chip__face')!);
    fireEvent.click([...chip.querySelectorAll<HTMLElement>('.result-table__fork')].find(one => (one.textContent ?? '').includes('промах · попадание · крит'))!);
    const block = switches().find(one => text(one).includes('«исход» (бросок)'))!;
    expect(text(block)).toContain('промах:');
    expect(text(block)).toContain('попадание:');
    expect(text(block)).toContain('крит:');
    expect(text(block)).not.toContain('Если«Бросок атаки»');
    expect(within(document.body).has('+ по итогу')).toBe(false);
    const steps = useWorld.getState().system.effects.strike!.steps!;
    expect(steps.some(step => (step as { if?: { expr?: string } }).if?.expr === '@бросок.исход == "крит"')).toBe(true);
  }, 60_000);
});
