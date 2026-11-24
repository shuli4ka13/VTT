import { describe, it, expect } from 'vitest';
import type { Effect, Step } from '@vtt/schema';
import { stepsOf, carrierOf, editCarrier, placeOf, type CarrierPart } from './carrier.ts';

const step = (id: string): Step => ({ id, type: 'roll', fixed: { expr: '1' } }) as unknown as Step;
const base = (): Effect => ({
  label: 'Щит', activation: 'passive',
  steps: [step('a')], cost: [step('c')], attach: [step('t')], detach: [step('d')],
  on: [{ on: 'before:*', steps: [step('h0')], cost: [step('hc0')] }, { on: 'before:*', steps: [step('h1')] }],
} as unknown as Effect);

const apply = (at: CarrierPart, change: (draft: Effect) => void): Effect => {
  const whole = base();
  editCarrier(c => c(whole), at)(change);
  return whole;
};

const ids = (list: Step[] | undefined): (string | undefined)[] => (list ?? []).map(one => one.id);

describe('эффект-носитель', () => {
  it('stepsOf отдаёт шаги своей части', () => {
    const e = base();
    expect(ids(stepsOf(e, { part: 'steps' }))).toEqual(['a']);
    expect(ids(stepsOf(e, { part: 'cost' }))).toEqual(['c']);
    expect(ids(stepsOf(e, { part: 'attach' }))).toEqual(['t']);
    expect(ids(stepsOf(e, { part: 'detach' }))).toEqual(['d']);
    expect(ids(stepsOf(e, { part: 'handler', handler: 1 }))).toEqual(['h1']);
    expect(ids(stepsOf(e, { part: 'handler-cost', handler: 0 }))).toEqual(['hc0']);
    expect(stepsOf(e, { part: 'handler-cost', handler: 1 })).toEqual([]);
  });

  it('carrierOf подменяет steps (и cost у подписки) так же, как форма', () => {
    const e = base();
    expect(carrierOf(e, { part: 'steps' })).toBe(e);
    expect(ids(carrierOf(e, { part: 'cost' }).steps)).toEqual(['c']);
    expect(ids(carrierOf(e, { part: 'attach' }).steps)).toEqual(['t']);
    expect(ids(carrierOf(e, { part: 'detach' }).steps)).toEqual(['d']);
    const handler = carrierOf(e, { part: 'handler', handler: 0 });
    expect(ids(handler.steps)).toEqual(['h0']);
    expect(ids(handler.cost)).toEqual(['hc0']);
    expect(ids(carrierOf(e, { part: 'handler-cost', handler: 0 }).steps)).toEqual(['hc0']);
    expect(e).toEqual(base());
  });

  it('editCarrier возвращает правку в нужное место настоящего эффекта', () => {
    const push = (draft: Effect) => { (draft.steps ??= []).push(step('new')); };
    expect(ids(apply({ part: 'steps' }, push).steps)).toEqual(['a', 'new']);
    expect(ids(apply({ part: 'cost' }, push).cost)).toEqual(['c', 'new']);
    expect(ids(apply({ part: 'attach' }, push).attach)).toEqual(['t', 'new']);
    expect(ids(apply({ part: 'detach' }, push).detach)).toEqual(['d', 'new']);
    const h = apply({ part: 'handler', handler: 1 }, push);
    expect(ids(h.on![1]!.steps)).toEqual(['h1', 'new']);
    expect(ids(h.on![0]!.steps)).toEqual(['h0']);
    const hc = apply({ part: 'handler-cost', handler: 0 }, push);
    expect(ids(hc.on![0]!.cost)).toEqual(['hc0', 'new']);
    expect(ids(hc.on![0]!.steps)).toEqual(['h0']);
    expect(ids(hc.steps)).toEqual(['a']);
  });

  it('пустая плата снимает ключ', () => {
    const clear = (draft: Effect) => { draft.steps = []; };
    expect('cost' in apply({ part: 'cost' }, clear)).toBe(false);
    expect('cost' in apply({ part: 'handler-cost', handler: 0 }, clear).on![0]!).toBe(false);
    const handler = apply({ part: 'handler', handler: 0 }, draft => { draft.cost = []; });
    expect('cost' in handler.on![0]!).toBe(false);
  });

  it('placeOf собирает место движка', () => {
    expect(placeOf({ part: 'steps' })(3)).toEqual({ part: 'steps', index: 3 });
    expect(placeOf({ part: 'cost' })(0)).toEqual({ part: 'cost', index: 0 });
    expect(placeOf({ part: 'attach' })(1)).toEqual({ part: 'attach', index: 1 });
    expect(placeOf({ part: 'detach' })(2)).toEqual({ part: 'detach', index: 2 });
    expect(placeOf({ part: 'handler', handler: 1 })(4)).toEqual({ part: 'handler', handler: 1, index: 4 });
    expect(placeOf({ part: 'handler-cost', handler: 0 })(2)).toEqual({ part: 'handler-cost', handler: 0, index: 2 });
  });
});
