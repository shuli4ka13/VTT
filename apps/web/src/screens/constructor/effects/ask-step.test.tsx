// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { System, Step } from '@vtt/schema';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { within, stepCard } from '../../../testing/cards.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { outputRefs } from '../slots.tsx';
import { askReadback } from '../readback.ts';
import { EffectEditor } from './effect-editor.tsx';

const start = (steps: unknown[] = []) => {
  useWorld.setState(state => ({
    ...state,
    system: {
      ...emptySystem(),
      effects: { удар: { label: 'Удар', activation: 'manual', params: [{ key: 'цель', label: 'Цель', kind: 'sheet' }], steps } },
    } as unknown as System,
  }));
  function Live() {
    const system = useWorld(st => st.system);
    return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
  }
  render(<Live />);
  openAll();
};
const steps = (): Step[] => useWorld.getState().system.effects.удар!.steps ?? [];

describe('шаг «Спросить» в конструкторе', () => {
  beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { return; } });

  it('из палитры: заготовка с именем без вопроса, «Проблемы» просят вписать вопрос', () => {
    start();
    within().click('+ спросить');
    expect(steps()).toEqual([{ id: 'решение', type: 'ask' }]);
    expect(stepCard(/^1 · Спросить/).textContent).toContain('Вопрос');
    expect(stepCard(/^1 · Спросить/).querySelector('.verdict--bad')).not.toBeNull();
  });

  it('второй шаг получает другое имя', () => {
    start([{ id: 'решение', type: 'ask', label: 'Первый?' }]);
    within().click('+ спросить');
    expect(steps().map(step => step.id)).toEqual(['решение', 'решение_2']);
  });

  it('вопрос, «Кого» и подписи ответов — данные ровно той формы; стирание подписи снимает ключ', () => {
    start();
    within().click('+ спросить');
    let card = stepCard(/^1 · Спросить/);
    within(card).type('Вопрос', 'Кто победил?');
    card = stepCard(/^1 · Спросить/);
    within(card).formula('Кого', '@цель');
    card = stepCard(/^1 · Спросить/);
    expect(card.querySelector<HTMLInputElement>('input[placeholder="да"]')).not.toBeNull();
    within(card).type('Ответ «да» словами', 'Бьющий');
    card = stepCard(/^1 · Спросить/);
    within(card).type('Ответ «нет» словами', 'Защитник');
    expect(steps()).toEqual([{ id: 'решение', type: 'ask', label: 'Кто победил?', to: { expr: '@цель' }, yes: 'Бьющий', no: 'Защитник' }]);
    card = stepCard(/^1 · Спросить/);
    expect(card.querySelector('.verdict--bad')).toBeNull();
    within(card).type('Ответ «да» словами', '');
    card = stepCard(/^1 · Спросить/);
    within(card).formula('Кого', '');
    expect(steps()).toEqual([{ id: 'решение', type: 'ask', label: 'Кто победил?', no: 'Защитник' }]);
  });
});

describe('пересказ и подсказки шага «Спросить»', () => {
  const effect = { label: 'Удар', params: [{ key: 'цель', label: 'Цель', kind: 'sheet' }] } as never;
  const text = (step: object) => askReadback(step as Step, effect).map(part => ('text' in part ? part.text : part.hole)).join(' ');

  it('пересказ словами: ведущий по умолчанию, лист — по имени входа, ответы по умолчанию «да / нет»', () => {
    expect(text({ type: 'ask', label: 'Кто победил?', yes: 'Бьющий', no: 'Защитник' })).toBe('спросить ведущего: «Кто победил?» — Бьющий / Защитник');
    expect(text({ type: 'ask', label: 'Согласен?', to: { expr: '@цель' } })).toBe('спросить «Цель»: «Согласен?» — да / нет');
  });

  it('итог шага — «да / нет» — предлагается следующим шагам по имени шага', () => {
    const refs = outputRefs([{ id: 'решение', type: 'ask' }]);
    expect(refs).toEqual([{ ref: 'решение', label: 'решение', kind: 'boolean' }]);
  });
});
