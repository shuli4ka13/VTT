// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { EffectEditor } from './effect-editor.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import type { System, Step } from '@vtt/schema';
import { within, stepCard, block, headOf, isFused } from '../../../testing/cards.ts';
import { openAll } from '../../../testing/render-open.tsx';

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const callee = {
  label: 'Бросок атаки', activation: 'manual', params: [],
  returns: [{ key: 'попал', label: 'попадание', kind: 'boolean', no: 'промах' }, { key: 'крит', label: 'крит', kind: 'boolean' }],
  steps: [],
};

const start = (steps: unknown[], plain = false) => {
  useWorld.setState(state => ({
    ...state,
    system: {
      ...emptySystem(),
      effects: {
        бросок: callee,
        простой: { label: 'Простой', activation: 'manual', params: [], steps: [] },
        удар: { label: 'Удар', activation: 'manual', params: [], steps },
      },
    } as unknown as System,
  }));
  function Live() {
    const system = useWorld(st => st.system);
    return <EffectEditor id={plain ? 'удар' : 'удар'} effect={system.effects.удар!} system={system} />;
  }
  render(<Live />);
  openAll();
};

const steps = (): Step[] => useWorld.getState().system.effects.удар!.steps ?? [];

const ifBy = (card: HTMLElement, option: string) => within(card).select(card.querySelector<HTMLElement>('select[aria-label="если по итогу"]')!, option);

describe('«+ если по итогу» у вызова', () => {
  beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('вместо «в «Если»» у вызова с итогами: ставит блок сразу после вызова, даёт имя шагу, блок склеен', () => {
    start([{ type: 'emit', effect: 'бросок' }]);
    const card = () => stepCard(/^1 · /);
    expect(within(card()).has('в «Если»')).toBe(false);
    ifBy(card(), 'попадание / промах');
    expect(steps()).toEqual([
      { type: 'emit', effect: 'бросок', id: 'бросок' },
      { type: 'branch', if: { expr: '@бросок.попал' } },
      { type: 'end' },
    ]);
    expect(isFused(block(0))).toBe(true);
  });

  it('имя шага, если оно уже есть, не меняется; вставка идёт после вызова, а не в конец', () => {
    start([{ id: 'атака', type: 'emit', effect: 'бросок' }, { type: 'stop' }]);
    ifBy(stepCard(/^1 · /), 'попадание / промах');
    expect(steps().map(step => step.type)).toEqual(['emit', 'branch', 'end', 'stop']);
    expect(steps()[0]!.id).toBe('атака');
    expect(steps()[1]).toEqual({ type: 'branch', if: { expr: '@атака.попал' } });
  });

  it('итог на выбор — по любому из итогов: «крит / не крит» ставит «Если» по криту', () => {
    start([{ id: 'атака', type: 'emit', effect: 'бросок' }]);
    ifBy(stepCard(/^1 · /), 'крит / не крит');
    expect(steps()[1]).toEqual({ type: 'branch', if: { expr: '@атака.крит' } });
  });

  it('у проверки без ступеней — та же кнопка: «Если» по успеху, склеено с проверкой', () => {
    start([{ type: 'check', value: { expr: '5' }, versus: { expr: '3' } }]);
    within(stepCard(/^1 · /)).click('+ если по итогу');
    expect(steps()).toEqual([
      { type: 'check', value: { expr: '5' }, versus: { expr: '3' }, id: 'проверка' },
      { type: 'branch', if: { expr: '@проверка.success' } },
      { type: 'end' },
    ]);
    expect(isFused(block(0))).toBe(true);
  });

  it('у вызова без итогов остаётся «в «Если»»', () => {
    start([{ type: 'emit', effect: 'простой' }]);
    expect(within(stepCard(/^1 · /)).has('+ если по итогу')).toBe(false);
    expect(within(stepCard(/^1 · /)).has('в «Если»')).toBe(true);
  });
});

describe('шапка склеенного «Если» по вызову', () => {
  beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  const fusedSteps = () => [{ id: 'атака', type: 'emit', effect: 'бросок' }, { type: 'branch', if: { expr: '@атака.попал' } }, { type: 'end' }];
  const pick = () => headOf(block(0)).querySelector<HTMLSelectElement>('select')!;

  it('выпадающий список — итоги только этого вызова и «формулой…»; выбор переписывает условие', () => {
    start(fusedSteps());
    expect(isFused(block(0))).toBe(true);
    expect([...pick().options].map(textOf)).toEqual(['— что проверяем —', 'попадание / промах', 'крит / не крит', 'формулой…']);
    expect(pick().selectedOptions[0]!.textContent).toBe('попадание / промах');
    within(headOf(block(0))).select(pick(), 'крит / не крит');
    expect(steps()[1]).toEqual({ type: 'branch', if: { expr: '@атака.крит' } });
  });

  it('«формулой…» снимает склейку: блок остаётся простым «Если» с полем формулы', () => {
    start(fusedSteps());
    within(headOf(block(0))).select(pick(), 'формулой…');
    expect(isFused(block(0))).toBe(false);
    expect(steps().map(step => step.type)).toEqual(['emit', 'branch', 'end']);
    expect(steps()[1]).toEqual({ type: 'branch', if: { expr: '@атака.попал == да' } });
    expect(headOf(block(0)).querySelector('.cond__formula, .formula-field, .formula-words')).not.toBeNull();
  });
});
