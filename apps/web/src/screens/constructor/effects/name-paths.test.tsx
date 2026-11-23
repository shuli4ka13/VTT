// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';
import { FormulaChips } from '../../../ui/formula-chips.tsx';
import { placeNamesAt } from './names.ts';

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

  it('«Новый ход» читает колонки строки словами', () => {
    open('turn_reset');
    const typed = [...document.querySelectorAll('input')].map(one => one.value).join(' | ');
    expect(text()).toContain('Изменить «счётчик → Осталось»');
    expect(typed + text()).not.toMatch(/счётчик\.(start|left)/u);
  });

  it('вход-выбор вызова — список строк таблицы', () => {
    open('turn_undead');
    const combo = within(document).arg('Чем спасается').querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(combo.value).toBe('Мудрость');
    fireEvent.focus(combo);
    expect([...within(document).arg('Чем спасается').querySelectorAll('.slot__option')].map(one => one.textContent)).toContain('формулой…');
    expect(text()).not.toContain('"мудрость"');
  });

  it('подписка на метку предлагает итоги вызова словами', () => {
    open('shield');
    expect(within(document).whenOptions()).toContain('Бросок атаки — исход — попал');
    expect(text()).not.toContain('@попадание.попал');
  });

  it('после строки цикла через лист подсказки — её колонки, голой формы нет', () => {
    const world = structuredClone(SAMPLE_WORLDS.find(one => one.system.id === 'dnd5e')!);
    const system = world.system as System;
    const names = placeNamesAt(system, 'resources_rest', { part: 'handler', handler: 0, index: 2 });
    render(<FormulaChips value="@holder.ресурс" system={system} sheets={new Map([['holder', 'носитель']])} extraNames={names} onChange={() => {}} />);
    const input = document.querySelectorAll('input.chips__text')[1] as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '.', selectionStart: 1 } });
    const shown = [...document.querySelectorAll('.slot__option')].map(option => option.textContent ?? '');
    expect(shown.some(one => one.includes('Осталось')), shown.join(' | ')).toBe(true);
    expect(names.has('ресурс.left')).toBe(true);
  });
});
