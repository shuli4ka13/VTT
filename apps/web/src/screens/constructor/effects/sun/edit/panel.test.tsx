// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { sunOf } from '@vtt/engine';
import type { Effect, System } from '@vtt/schema';
import { EffectsTab } from '../../effects-tab.tsx';
import { useWorld } from '../../../../../store/world.ts';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useEffectUndo } from '../../../../../store/effect-undo.ts';
import { useLocale } from '../../../../../store/locale.ts';
import { load } from '../../../../../testing/round-trip.tsx';
import { within as cards } from '../../../../../testing/cards.ts';
import { SunPanel, prefixShape } from './panel.tsx';
import { rangeOf } from './ops.ts';

const dnd = SAMPLE_WORLDS.find(world => world.system.name === 'D&D 5e')!;

const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const canvas = (): HTMLElement => document.querySelector<HTMLElement>('.sun-canvas')!;

const bubble = (key: string): HTMLElement => canvas().querySelector<HTMLElement>(`[data-bubble="${key}"]`)!;

const pick = (key: string): void => { fireEvent.click(bubble(key)); };

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.sun-panel')!;

const stepCards = (): HTMLElement[] => [...panel().querySelectorAll<HTMLElement>('.sun-panel__step .card')];

const button = (name: string | RegExp, root: ParentNode = document): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>('button')].find(one => (typeof name === 'string' ? text(one) === name : name.test(text(one))))!;

const row = (): HTMLElement => panel().querySelector<HTMLElement>('.sun-panel__row')!;

const effectNow = (id: string): Effect => useWorld.getState().system.effects[id]!;

const open = (id: string): void => {
  load(structuredClone(dnd), { activeTab: 'effects', activeEffectId: id });
  useEffectView.setState({ view: 'sun', trail: [] });
  useEffectUndo.setState({ stacks: {} });
  render(<EffectsTab />);
};

describe('правка в пузырях: панель', () => {
  beforeEach(() => { localStorage.clear(); useLocale.getState().setLang('ru'); });
  afterEach(() => { cleanup(); useEffectView.setState({ view: 'form', trail: [] }); });

  it('луч «бросок» показывает блок шага с номером луча, без соседних шагов и без окна', () => {
    open('strike');
    pick('steps:10');
    expect(stepCards()).toHaveLength(1);
    expect(text(stepCards()[0]!)).toMatch(/7 · /);
    expect(text(panel())).not.toMatch(/(^|\s)8 · урон/);
    expect(document.querySelector('.sunw')).toBeNull();
    expect(bubble('steps:10').getAttribute('aria-pressed')).toBe('true');
  });

  it('правка подписи шага в панели меняет шаг и подпись пузыря на холсте', () => {
    open('strike');
    pick('steps:12');
    const card = stepCards()[0]!;
    const input = card.querySelector<HTMLElement>('.number-line input.input');
    expect(input).not.toBeNull();
    cards(card).type(input!, 'сила_удара');
    const step = effectNow('strike').steps![12] as { id?: string; label?: string };
    expect(step.label ?? step.id).toBe('сила удара');
    expect(bubble('steps:12').getAttribute('aria-label')).toContain('сила удара');
  });

  it('«↓» переставляет шаг, выбор идёт за ним; «↑» возвращает порядок', () => {
    open('strike');
    const original = structuredClone(effectNow('strike'));
    pick('steps:13');
    fireEvent.click(button('↓', row()));
    const moved = effectNow('strike');
    expect(moved.steps).not.toEqual(original.steps);
    const selected = canvas().querySelector<HTMLElement>('.sun-bubble--ray[aria-pressed="true"]');
    expect(selected).not.toBeNull();
    fireEvent.click(button('↑', row()));
    expect(effectNow('strike').steps).toEqual(original.steps);
  });

  it('кнопки внутри блока шага, меняющие порядок, снимают выбор: ключ луча уже указывает на другой шаг', () => {
    open('strike');
    pick('steps:13');
    const own = stepCards()[0]!.querySelector<HTMLElement>('button[title="ниже"]')!;
    fireEvent.click(own);
    expect(panel().getAttribute('data-panel')).toBe('center');
    expect(canvas().querySelector('.sun-bubble--ray[aria-pressed="true"]')).toBeNull();
  });

  it('«Удалить шаг» убирает шаг и даёт «Вернуть», которое возвращает эффект целиком', () => {
    open('strike');
    const original = structuredClone(effectNow('strike'));
    pick('steps:12');
    fireEvent.click(button('Удалить шаг', row()));
    fireEvent.click(panel().querySelector<HTMLElement>('.sun-panel__row .danger-confirm button')!);
    expect(effectNow('strike').steps!.length).toBe(original.steps!.length - 1);
    expect(screen.getByText(/Шаг удалён/)).toBeTruthy();
    expect(panel().querySelector('.sun-panel__step')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(effectNow('strike')).toEqual(original);
    expect(screen.queryByText(/Шаг удалён/)).toBeNull();
  });

  it('«Отменить» и «Повторить» в шапке; правка мимо пузырей сбрасывает стек', () => {
    open('strike');
    const original = structuredClone(effectNow('strike'));
    const undo = screen.getByRole('button', { name: 'Отменить' }) as HTMLButtonElement;
    const redo = screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    pick('steps:13');
    fireEvent.click(button('↓', row()));
    const moved = structuredClone(effectNow('strike'));
    expect((screen.getByRole('button', { name: 'Отменить' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(effectNow('strike')).toEqual(original);
    expect((screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement).disabled).toBe(false);
    expect(redo).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(effectNow('strike')).toEqual(moved);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(effectNow('strike')).toEqual(moved);

    act(() => { useWorld.getState().editEffect('strike', draft => { draft.description = 'вне пузырей'; }); });
    expect((screen.getByRole('button', { name: 'Отменить' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Повторить' }) as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);

  it('чип «Эффекты → Урон» вставляет вызов после выбранного луча и выбирает его', () => {
    open('strike');
    const before = effectNow('strike').steps!.length;
    pick('steps:10');
    const chip = document.querySelector<HTMLElement>('[data-palette="call:damage"]')!;
    expect(chip.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(chip);
    const steps = effectNow('strike').steps!;
    expect(steps.length).toBe(before + 1);
    expect(steps[11]).toMatchObject({ type: 'emit', effect: 'damage' });
    expect(canvas().querySelector('.sun-bubble--ray[aria-pressed="true"]')).not.toBeNull();
  });

  it('чип «для каждого» внутри «Если» недоступен, причина в подсказке', () => {
    open('strike');
    pick('steps:11');
    const chip = document.querySelector<HTMLElement>('[data-palette="brick:each"]')!;
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.title).toContain('нельзя класть внутрь «Если»');
    expect(chip.getAttribute('aria-label')).toContain(chip.title);
    const before = structuredClone(effectNow('strike'));
    fireEvent.click(chip);
    expect(effectNow('strike')).toEqual(before);
  });

  it('у «Щита» чип «кости выпали» добавляет подписку, выбор «когда» показывает подписку формы', () => {
    open('shield');
    const before = effectNow('shield').on!.length;
    fireEvent.click(document.querySelector<HTMLElement>('[data-palette="happen:seen"]')!);
    expect(effectNow('shield').on!.length).toBe(before + 1);
    expect(effectNow('shield').on![before]!.on).toBe('seen');
    expect(bubble(`on${before}:when`)).toBeTruthy();
    expect(bubble(`on${before}:when`).getAttribute('aria-pressed')).toBe('true');
    expect(panel().querySelector('.mod-card')).not.toBeNull();
    expect(button('Убрать подписку', panel())).toBeTruthy();
  });

  it('шаги «увидев кости» появляются в палитре только для подписки на бросок', () => {
    open('shield');
    expect(document.querySelector('[data-palette="seen:roll-add"]')).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-palette="happen:seen"]')!);
    expect(document.querySelector('[data-palette="seen:roll-add"]')).not.toBeNull();
  });

  it('центр показывает шапку эффекта, входы и итоги; «Что вокруг» остаётся под ними', () => {
    open('strike');
    pick('center');
    expect(panel().querySelector('.effect-head')).not.toBeNull();
    expect(text(panel())).toContain('Что вокруг шага');
    expect(panel().querySelector('.sun-inspector')).not.toBeNull();
  });
});

describe('правка в пузырях: обход образцов', () => {
  beforeEach(() => { localStorage.clear(); useLocale.getState().setLang('ru'); });
  afterEach(() => cleanup());

  const walk = (system: System, id: string): number => {
    const sun = sunOf(system, id)!;
    let count = 0;
    for (const ray of sun.rays) {
      const view = render(
        <SunPanel
          system={system} sun={sun} effectId={id} effect={system.effects[id]!} ray={ray}
          around={null} aroundOpen={false}
          edit={change => useWorld.getState().editEffect(id, change)}
          mode="inside" onMode={() => {}} onSelect={() => {}} onRemoved={() => {}} onAbout={() => {}}
        />,
      );
      expect(view.container.querySelector('.sun-panel')).not.toBeNull();
      view.unmount();
      count++;
    }
    return count;
  };

  it('для каждого луча каждого эффекта D&D панель рисуется без исключений', () => {
    const world = structuredClone(dnd);
    useWorld.setState(state => ({ ...state, system: world.system as System, compendium: world.compendium }));
    let total = 0;
    for (const id of Object.keys(world.system.effects)) total += walk(world.system as System, id);
    expect(total).toBeGreaterThan(100);
  }, 120_000);

  it('у каждого луча каждого образца диапазон панели покрывает шаги луча', () => {
    for (const world of SAMPLE_WORLDS) {
      for (const [id, effect] of Object.entries(world.system.effects)) {
        const sun = sunOf(world.system as System, id);
        if (!sun) continue;
        for (const ray of sun.rays) {
          const span = ray.span;
          if (!span || !['steps', 'attach', 'detach', 'handler', 'cost', 'handler-cost'].includes(span.part)) continue;
          const range = rangeOf(effect as Effect, span);
          expect(range, `${world.system.name} ${id} ${ray.key}`).not.toBeNull();
          expect(range!.from).toBeLessThanOrEqual(span.from);
          expect(range!.to).toBeGreaterThanOrEqual(span.to);
        }
      }
    }
  });
});

describe('пузыри: выбор держится за шаг', () => {
  it('имя, данное шагу, не меняет форму цепочки — выбор не снимается; новый шаг перед выбранным — меняет', () => {
    const steps = structuredClone(dnd.system.effects.damage!.steps!);
    const named = structuredClone(steps);
    named[0]!.id = 'drugoe_imya';
    expect(prefixShape(named, 1)).toBe(prefixShape(steps, 1));
    const longer = [{ type: 'stop' }, ...structuredClone(steps)] as Effect['steps'];
    expect(prefixShape(longer, 1)).not.toBe(prefixShape(steps, 1));
  });
});
