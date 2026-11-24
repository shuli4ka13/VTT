// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { sunOf } from '@vtt/engine';
import type { Effect } from '@vtt/schema';
import { EffectsTab } from '../../effects-tab.tsx';
import { useWorld } from '../../../../../store/world.ts';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useEffectUndo } from '../../../../../store/effect-undo.ts';
import { useLocale } from '../../../../../store/locale.ts';
import { load } from '../../../../../testing/round-trip.tsx';
import { layoutOf } from '../layout.ts';

const dnd = SAMPLE_WORLDS.find(world => world.system.name === 'D&D 5e')!;

const canvas = (): HTMLElement => document.querySelector<HTMLElement>('.sun-canvas')!;

const bubble = (key: string): HTMLElement => canvas().querySelector<HTMLElement>(`[data-bubble="${key}"]`)!;

const chip = (key: string): HTMLElement => document.querySelector<HTMLElement>(`[data-palette="${key}"]`)!;

const effectNow = (id: string): Effect => useWorld.getState().system.effects[id]!;

const types = (id: string): string[] => (effectNow(id).steps ?? []).map(step => step.type);

const open = (id: string): void => {
  load(structuredClone(dnd), { activeTab: 'effects', activeEffectId: id });
  useEffectView.setState({ view: 'sun', trail: [] });
  useEffectUndo.setState({ stacks: {} });
  render(<EffectsTab />);
  canvas().getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
};

const screenOf = (id: string): { x: number; y: number } => {
  const layer = document.querySelector<HTMLElement>('.sun-layer')!;
  const [, x, y, k] = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(layer.style.transform)!.map(Number) as number[];
  const placed = layoutOf(sunOf(useWorld.getState().system, 'strike')!).placed.find(one => one.id === id)!;
  return { x: x! + placed.x * k!, y: y! + placed.y * k! };
};

const pointer = (target: Element | Window, type: string, at: { x: number; y: number }): void => {
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 }));
};

const drag = (from: Element, start: { x: number; y: number }, end: { x: number; y: number }, release = true): void => {
  pointer(from, 'pointerdown', start);
  pointer(window, 'pointermove', { x: start.x + 10, y: start.y + 10 });
  pointer(window, 'pointermove', end);
  if (release) pointer(window, 'pointerup', end);
};

describe('перетаскивание в пузырях', () => {
  beforeEach(() => { localStorage.clear(); useLocale.getState().setLang('ru'); });
  afterEach(() => { cleanup(); useEffectView.setState({ view: 'form', trail: [] }); });

  it('нажатие и отпускание без сдвига на пузыре — обычный выбор', () => {
    open('strike');
    const before = structuredClone(effectNow('strike'));
    const at = screenOf('steps:10');
    pointer(bubble('steps:10'), 'pointerdown', at);
    pointer(window, 'pointerup', at);
    fireEvent.click(bubble('steps:10'));
    expect(bubble('steps:10').getAttribute('aria-pressed')).toBe('true');
    expect(effectNow('strike')).toEqual(before);
  });

  it('чип «стоп» на луче «бросок» вставляет шаг после него и выбирает его', () => {
    open('strike');
    const at = screenOf('steps:10');
    drag(chip('brick:stop'), { x: 5, y: 5 }, at);
    const now = types('strike');
    expect(now).toHaveLength(19);
    expect(now[11]).toBe('stop');
    expect(bubble('steps:11').getAttribute('aria-pressed')).toBe('true');
  });

  it('чип «для каждого из списка» внутри «Если» ничего не вставляет', () => {
    open('strike');
    const before = structuredClone(effectNow('strike'));
    const at = screenOf('steps:12');
    drag(chip('brick:each'), { x: 5, y: 5 }, at, false);
    expect(bubble('steps:12').className).toContain('sun-bubble--nodrop');
    pointer(window, 'pointerup', at);
    expect(effectNow('strike')).toEqual(before);
  });

  it('пузырь шага, протянутый на луч того же уровня, меняет порядок шагов', () => {
    open('strike');
    const before = types('strike');
    drag(bubble('steps:10'), screenOf('steps:10'), screenOf('steps:11'));
    const now = types('strike');
    expect(now).toHaveLength(before.length);
    expect(now[now.length - 1]).toBe('emit');
    expect(now[0]).toBe(before[0]);
    expect(now).not.toEqual(before);
  });

  it('Escape во время перетаскивания отменяет', () => {
    open('strike');
    const before = structuredClone(effectNow('strike'));
    const at = screenOf('steps:10');
    drag(chip('brick:stop'), { x: 5, y: 5 }, at, false);
    expect(bubble('steps:10').className).toContain('sun-bubble--drop');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bubble('steps:10').className).not.toContain('sun-bubble--drop');
    pointer(window, 'pointerup', at);
    expect(effectNow('strike')).toEqual(before);
  });
});
