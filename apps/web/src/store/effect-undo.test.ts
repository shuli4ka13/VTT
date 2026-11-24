import { describe, it, expect, beforeEach } from 'vitest';
import type { Effect } from '@vtt/schema';
import { GLUE_MS, isTyping, useEffectUndo } from './effect-undo.ts';

const make = (label: string): Effect => ({ label, steps: [] }) as unknown as Effect;

const store = () => useEffectUndo.getState();

beforeEach(() => { useEffectUndo.setState({ stacks: {} }); });

describe('отмена и повтор правок эффекта', () => {
  it('отмена, отмена, повтор, повтор идут по снимкам, пока эффект тот же', () => {
    const a = make('a');
    const b = make('b');
    const c = make('c');
    store().record('x', a, b, 0);
    store().record('x', b, c, 10_000);
    expect(store().canUndo('x', c)).toBe(true);
    expect(store().canRedo('x', c)).toBe(false);

    const first = store().undo('x', c);
    expect(first).toBe(b);
    const landedB = make('b');
    store().landed('x', landedB);
    expect(store().canRedo('x', landedB)).toBe(true);

    const second = store().undo('x', landedB);
    expect(second).toBe(a);
    const landedA = make('a');
    store().landed('x', landedA);
    expect(store().canUndo('x', landedA)).toBe(false);

    expect(store().redo('x', landedA)).toBe(landedB);
    const again = make('b');
    store().landed('x', again);
    expect(store().redo('x', again)).toBe(c);
    const end = make('c');
    store().landed('x', end);
    expect(store().canRedo('x', end)).toBe(false);
    expect(store().canUndo('x', end)).toBe(true);
  });

  it('правка после отмены стирает повтор', () => {
    const a = make('a');
    const b = make('b');
    store().record('x', a, b, 0);
    store().undo('x', b);
    const landed = make('a');
    store().landed('x', landed);
    store().record('x', landed, make('z'), 5_000);
    expect(store().canRedo('x', store().stacks.x!.states[store().stacks.x!.at])).toBe(false);
    expect(store().stacks.x!.states).toHaveLength(2);
  });

  it('набор текста в пределах окна склеивается в одну запись, пауза или другая правка — нет', () => {
    const states = ['a', 'ab', 'abc', 'abcd'].map(make);
    store().record('x', states[0]!, states[1]!, 1_000, true);
    store().record('x', states[1]!, states[2]!, 1_000 + GLUE_MS - 1, true);
    expect(store().stacks.x!.states).toHaveLength(2);
    store().record('x', states[2]!, states[3]!, 1_000 + GLUE_MS * 3, true);
    expect(store().stacks.x!.states).toHaveLength(3);
    store().record('x', states[3]!, make('other'), 1_000 + GLUE_MS * 3 + 1, false);
    expect(store().stacks.x!.states).toHaveLength(4);
  });

  it('если эффект правили в обход, стек сбрасывается', () => {
    const a = make('a');
    const b = make('b');
    store().record('x', a, b, 0);
    const foreign = make('b');
    expect(store().canUndo('x', foreign)).toBe(false);
    expect(store().undo('x', foreign)).toBeNull();
    expect(store().stacks.x).toBeUndefined();
    store().record('x', a, b, 0);
    store().record('x', foreign, make('q'), 100);
    expect(store().stacks.x!.states).toHaveLength(2);
  });

  it('стеки разных эффектов независимы', () => {
    const a = make('a');
    const b = make('b');
    store().record('x', a, b, 0);
    expect(store().canUndo('y', b)).toBe(false);
    store().clear('x');
    expect(store().canUndo('x', b)).toBe(false);
  });

  it('набором текста считается правка одних строк', () => {
    expect(isTyping({ a: 'x', b: [1] }, { a: 'xy', b: [1] })).toBe(true);
    expect(isTyping({ a: 'x', b: [1] }, { a: 'x', b: [1, 2] })).toBe(false);
    expect(isTyping({ a: 'x', n: 1 }, { a: 'x', n: 2 })).toBe(false);
    expect(isTyping({ a: 'x' }, { a: 'x' })).toBe(false);
    expect(isTyping({ a: ['x', 'y'] }, { a: ['y', 'x'] })).toBe(false);
  });
});
