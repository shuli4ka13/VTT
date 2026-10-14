// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';

const open = (effect: string) => {
  const world = structuredClone(SAMPLE_WORLDS.find(one => one.system.id === 'dnd5e')!);
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: effect, activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  render(<EffectsTab />);
  openAll();
};

const text = (): string => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('имена из справочной движка', () => {
  afterEach(cleanup);

  it('строка цикла читается подписями колонок, а не ключами', () => {
    open('resources_rest');
    expect(text()).toContain('ресурс → Осталось');
    expect(text()).toContain('ресурс → Восполняется коротким отдыхом');
    expect(text()).not.toMatch(/ресурс\.(left|short|max)/u);
  });

  it('вход-выбор вызова — список строк таблицы', () => {
    open('turn_undead');
    const select = [...within(document).arg('Чем спасается').querySelectorAll('select')][0]!;
    expect(select.selectedOptions[0]?.textContent).toBe('Мудрость');
    expect([...select.options].map(one => one.textContent)).toContain('формулой…');
    expect(text()).not.toContain('"мудрость"');
  });

  it('подписка на метку предлагает итоги вызова словами', () => {
    open('shield');
    const options = [...document.querySelectorAll('select')].flatMap(one => [...one.options].map(option => option.textContent));
    expect(options).toContain('Бросок атаки — попадание');
    expect(text()).not.toContain('@попадание.попал');
  });
});
