// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { EffectEditor } from './effect-editor.tsx';
import { FormulaBar } from '../../../ui/formula-bar.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { useFormulaBar } from '../../../store/formula-bar.ts';
import type { System, Step } from '@vtt/schema';
import { within } from '../../../testing/cards.ts';
import { openAll } from '../../../testing/render-open.tsx';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const FOE = { key: 'враг', label: 'Враг', kind: 'sheet', role: 'target' };
const IF = { type: 'branch', if: { expr: '@действующий.сила > 1' } };
const END = { type: 'end' };
const change = (field: string) => ({ type: 'apply', target: { expr: `@враг.${field}` } });

const start = (steps: unknown[]) => {
  useWorld.setState(state => ({
    ...state,
    system: {
      ...emptySystem(),
      tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number' }, { key: 'сила', label: 'Сила', kind: 'number' }] } },
      effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, FOE], steps } },
    } as unknown as System,
  }));
  function Live() {
    const system = useWorld(st => st.system);
    return <><FormulaBar /><EffectEditor id="удар" effect={system.effects.удар!} system={system} /></>;
  }
  render(<Live />);
  openAll();
};

const steps = (): Step[] => useWorld.getState().system.effects.удар!.steps ?? [];
const amountOf = (card: HTMLElement): HTMLElement | undefined =>
  [...card.querySelectorAll<HTMLElement>('.field')].find(field => field.querySelector('.field__label')?.textContent?.trim() === 'Сколько');
const changes = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.card')].filter(card => amountOf(card));
const barInput = (): HTMLInputElement => [...document.querySelectorAll<HTMLInputElement>('.formula-bar input.chips__text')].at(-1)!;
const typeAmount = (card: HTMLElement, text: string): void => {
  act(() => { fireEvent.click(amountOf(card)!.querySelector('.formula-field')!); });
  act(() => { fireEvent.change(barInput(), { target: { value: text } }); });
};

describe('открытая формула и перестройка шагов', () => {
  beforeEach(() => { useFormulaBar.getState().dismiss(); });
  afterEach(() => { cleanup(); });

  it('удалили «Изменение» внутри «Если», пока набирали «Сколько», — набранное не уходит в конец блока', () => {
    start([IF, change('хп'), END]);
    typeAmount(changes()[0]!, '5');
    within(changes()[0]!).click('Удалить');
    within(changes()[0]!).click('точно убрать');
    expect(steps()).toEqual([IF, END]);
  });

  it('удалили первое из двух «Изменений» — второе не получает чужое «Сколько»', () => {
    start([change('хп'), change('сила')]);
    typeAmount(changes()[0]!, '7');
    within(changes()[0]!).click('Удалить');
    within(changes()[0]!).click('точно убрать');
    act(() => { useFormulaBar.getState().commit(); });
    expect(steps()).toEqual([change('сила')]);
  });

  it('сменили вид шага, пока набирали «Сколько», — у «Наложить» не остаётся чужого поля', () => {
    start([change('хп')]);
    typeAmount(changes()[0]!, '7');
    within(changes()[0]!).click('сменить вид шага');
    within(changes()[0]!).click('состояние');
    expect(steps()[0]!.type).toBe('status');
    expect(steps()[0]).not.toHaveProperty('value');
  });

  it('подняли шаг, пока в нём набрано «Сколько», — набранное остаётся в нём, соседний не тронут', () => {
    start([change('хп'), change('сила')]);
    typeAmount(changes()[1]!, '9');
    within(changes()[1]!).click('↑');
    act(() => { useFormulaBar.getState().commit(); });
    expect(steps()).toEqual([{ ...change('сила'), value: { expr: '9' } }, change('хп')]);
  });
});
