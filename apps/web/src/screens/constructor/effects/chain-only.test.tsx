// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System, Effect } from '@vtt/schema';
import { Chain } from './chain.tsx';
import { carrierOf, editCarrier, placeOf } from './carrier.ts';
import { useWorld } from '../../../store/world.ts';
import { useOpened } from '../../../store/opened.ts';
import { within } from '../../../testing/cards.ts';

const dnd = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;

const seed = () => {
  const world = structuredClone(dnd);
  world.system.effects.glued = {
    label: 'Склейка', activation: 'manual', params: [{ key: 'deystvuyuschiy', label: 'Кто действует', kind: 'sheet' }],
    steps: [
      { id: 'chislo', type: 'roll', fixed: { expr: '3' } },
      { type: 'apply', target: { expr: '@deystvuyuschiy.hp' }, value: { expr: '@chislo' } },
      { type: 'stop' },
    ],
  } as never;
  useWorld.setState(state => ({ ...state, system: world.system as System, compendium: world.compendium }));
};

const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function Only({ id, only, numberAs }: { id: string; only: { from: number; to: number }; numberAs?: number }) {
  const system = useWorld(s => s.system);
  const effect = system.effects[id]!;
  return (
    <Chain
      id={id} placeAt={index => ({ part: 'steps', index })} effect={effect} system={system} bare
      edit={change => useWorld.getState().editEffect(id, change)}
      only={only} {...(numberAs !== undefined ? { numberAs } : {})}
    />
  );
}

function OnlyHandler({ id, handler, only }: { id: string; handler: number; only: { from: number; to: number } }) {
  const system = useWorld(s => s.system);
  const effect = system.effects[id]!;
  const at = { part: 'handler', handler } as const;
  return (
    <Chain
      id={id} placeAt={placeOf(at)} effect={carrierOf(effect, at)} system={system}
      edit={editCarrier(change => useWorld.getState().editEffect(id, change), at)}
      only={only} onRoll={effect.on?.[handler]?.on === 'seen'}
    />
  );
}

const cards = () => [...document.querySelectorAll<HTMLElement>('.card')];

describe('Chain: режим only', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); useOpened.setState({ opened: {} }); seed(); });

  it('на шаге-вызове «бросок» рисует один блок шага, без палитры и соседей', () => {
    render(<Only id="strike" only={{ from: 10, to: 10 }} />);
    expect(cards()).toHaveLength(1);
    expect(text(cards()[0]!)).toMatch(/бросок/);
    expect(document.querySelector('.bricks')).toBeNull();
    expect(document.querySelector('.flow-block')).toBeNull();
    expect(document.body.textContent).not.toContain('+ шаг');
    expect(document.body.textContent).not.toContain('урон');
    expect(document.querySelector('.step-fold[aria-expanded="false"]')).toBeNull();
  });

  it('на голове «Если» рисует условие и руки, без шагов тела', () => {
    render(<Only id="strike" only={{ from: 11, to: 11 }} />);
    expect(document.querySelectorAll('.flow-block')).toHaveLength(1);
    expect(document.querySelector('.flow-block__arm')).toBeNull();
    expect(cards()).toHaveLength(0);
    expect(document.querySelector('.flow-head')).not.toBeNull();
    const foot = text(document.querySelector('.flow-block__foot'));
    expect(foot).toContain('+ иначе, если');
    expect(foot).toContain('+ иначе');
  });

  it('на всём блоке рисует его целиком, как в форме', () => {
    render(<Only id="strike" only={{ from: 10, to: 17 }} />);
    const block = document.querySelector('.flow-block')!;
    expect(block.classList.contains('flow-block--check')).toBe(true);
    expect(block.querySelector('.flow-block__arm')).not.toBeNull();
    expect(cards().length).toBeGreaterThan(2);
    expect(document.querySelectorAll('.flow-block').length).toBeGreaterThan(1);
  });

  it('склеенная пара «бросок + изменение» открывается целиком с любого из двух шагов', () => {
    render(<Only id="glued" only={{ from: 1, to: 1 }} />);
    const first = cards().map(text);
    cleanup();
    render(<Only id="glued" only={{ from: 0, to: 0 }} />);
    expect(cards().map(text)).toEqual(first);
    expect(cards()).toHaveLength(1);
  });

  it('numberAs заменяет номер в шапке блока', () => {
    render(<Only id="strike" only={{ from: 10, to: 10 }} />);
    const was = text(cards()[0]!.querySelector('.card__head, .step-fold__row, .step-fold'));
    cleanup();
    render(<Only id="strike" only={{ from: 10, to: 10 }} numberAs={42} />);
    const now = text(cards()[0]!.querySelector('.card__head, .step-fold__row, .step-fold'));
    expect(now).toMatch(/^[▾▸]?\s*42 · /);
    expect(was).not.toMatch(/^[▾▸]?\s*42 · /);
  });

  it('правка слота меняет тот же шаг настоящего эффекта', () => {
    render(<Only id="strike" only={{ from: 5, to: 5 }} />);
    const before = structuredClone(useWorld.getState().system.effects.strike!);
    const card = cards()[0]!;
    const input = [...card.querySelectorAll<HTMLInputElement>('input')].find(one => one.value === 'Цель в пределах дальности?')!;
    within(card).type(input, 'Цель близко?');
    const after = useWorld.getState().system.effects.strike!;
    expect((after.steps![5] as { question?: string }).question).toBe('Цель близко?');
    const strip = (effect: Effect) => effect.steps!.map((step, i) => (i === 5 ? { ...step, question: '' } : step));
    expect(strip(after)).toEqual(strip(before));
    expect({ ...after, steps: [] }).toEqual({ ...before, steps: [] });
  });

  it('шаг подписки «Щита»: показан «наложить», правка уходит в on[0].steps', () => {
    render(<OnlyHandler id="shield" handler={0} only={{ from: 0, to: 0 }} />);
    expect(cards()).toHaveLength(1);
    expect(text(cards()[0]!)).toMatch(/[Нн]аложить/);
    const before = structuredClone(useWorld.getState().system.effects.shield!);
    const drop = (): HTMLElement => [...cards()[0]!.querySelectorAll<HTMLElement>('button')].find(b => text(b) === 'Удалить')!;
    act(() => { fireEvent.click(drop()); });
    const confirm = [...document.querySelectorAll<HTMLElement>('.danger-confirm button')].find(b => text(b) !== 'Отмена' && text(b) !== 'Нет');
    if (confirm) act(() => { fireEvent.click(confirm); });
    const after = useWorld.getState().system.effects.shield!;
    expect(after.on![0]!.steps).toEqual([]);
    expect(after.on![0]!.cost).toEqual(before.on![0]!.cost);
    expect(after.on!.slice(1)).toEqual(before.on!.slice(1));
    expect({ ...after, on: [] }).toEqual({ ...before, on: [] });
  });
});
