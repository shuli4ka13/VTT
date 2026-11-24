// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { EffectsTab } from '../../effects-tab.tsx';
import { useWorld } from '../../../../../store/world.ts';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useLocale } from '../../../../../store/locale.ts';
import { load } from '../../../../../testing/round-trip.tsx';

const dnd = SAMPLE_WORLDS.find(world => world.system.name === 'D&D 5e')!;

const mapView = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Карта' })); };

const layer = (name: string): HTMLElement => screen.getByRole('region', { name });

const reveal = (inLayer: HTMLElement, effect: string): void => {
  const found = inLayer.querySelector<HTMLElement>(`[data-effect="${effect}"]`);
  if (found) return;
  for (const head of inLayer.querySelectorAll<HTMLElement>('.map-block__head')) {
    fireEvent.click(head);
    if (inLayer.querySelector(`[data-effect="${effect}"]`)) return;
    fireEvent.click(head);
  }
};

const rowOf = (inLayer: HTMLElement, effect: string): HTMLElement => {
  reveal(inLayer, effect);
  return inLayer.querySelector<HTMLElement>(`[data-effect="${effect}"]`)!;
};

const leaksText = (): string => (screen.getByRole('region', { name: 'Чего быть не должно' }).textContent ?? '');

describe('экран «Карта связей»', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocale.getState().setLang('ru');
    useEffectView.setState({ view: 'form', trail: [] });
    load(structuredClone(dnd), { activeTab: 'effects', activeEffectId: 'strike' });
  });
  afterEach(() => { cleanup(); useEffectView.setState({ view: 'form', trail: [] }); });

  it('переключатель «Карта» рисует четыре слоя с заголовками', () => {
    render(<EffectsTab />);
    mapView();
    expect(useEffectView.getState().view).toBe('map');
    expect(screen.getByRole('heading', { name: 'Кто о ком знает' })).toBeTruthy();
    for (const title of ['Словарь системы', 'Общие эффекты', 'Действия', 'Висящие']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(screen.getByText('↑ зовут по имени')).toBeTruthy();
  });

  it('«Урон» и «Бросок атаки» среди общих, «Атака» среди действий, «Щит» среди висящих', () => {
    useEffectView.setState({ view: 'map' });
    render(<EffectsTab />);
    expect(within(rowOf(layer('Общие эффекты'), 'damage')).getByText('Урон')).toBeTruthy();
    expect(within(rowOf(layer('Общие эффекты'), 'attack_roll')).getByText('Бросок атаки')).toBeTruthy();
    expect(within(rowOf(layer('Действия'), 'strike')).getByText('Атака')).toBeTruthy();
    expect(within(rowOf(layer('Висящие'), 'shield')).getByText('Щит')).toBeTruthy();
  });

  it('щелчок по метке «Атака»: кто носит, кто слышит, кто ставит на бросок', () => {
    useEffectView.setState({ view: 'map' });
    render(<EffectsTab />);
    fireEvent.click(layer('Словарь системы').querySelector<HTMLElement>('[data-tag="ataka"]')!);
    const panel = screen.getByRole('complementary', { name: 'Связи' });
    const carriers = within(panel).getByRole('region', { name: 'Кто носит' });
    expect(within(carriers).getByText('Атака')).toBeTruthy();
    expect(within(carriers).getByText('Атака заклинанием')).toBeTruthy();
    expect(within(within(panel).getByRole('region', { name: 'Кто слышит' })).getByText(/Щит/)).toBeTruthy();
    expect(within(within(panel).getByRole('region', { name: 'Кто ставит на бросок' })).getByText('Бросок атаки')).toBeTruthy();
  });

  it('щелчок по «Щит»: «Слышит: до · по метке «Атака»» и кнопка «Открыть пузыри ›»', () => {
    useEffectView.setState({ view: 'map' });
    render(<EffectsTab />);
    fireEvent.click(rowOf(layer('Висящие'), 'shield'));
    const panel = screen.getByRole('complementary', { name: 'Связи' });
    const hears = within(panel).getByRole('region', { name: 'Слышит' });
    expect(within(hears).getByText('до · по метке «Атака»')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Открыть пузыри ›' }));
    expect(useEffectView.getState().view).toBe('sun');
    expect(useWorld.getState().activeEffectId).toBe('shield');
  });

  it('в образце D&D подписок по имени нет; добавленная находится вместе с чтением чужого шага', () => {
    useEffectView.setState({ view: 'map' });
    const { unmount } = render(<EffectsTab />);
    expect(leaksText()).not.toContain('по имени — лучше');
    unmount();
    useWorld.getState().editSystem(draft => {
      draft.effects.t_po_imeni = { label: 'По имени', activation: 'passive', on: [{ on: 'after:strike', if: { expr: '@uron.total > 5' }, steps: [] }] } as never;
    });
    render(<EffectsTab />);
    const rows = [...document.querySelectorAll('.map-leaks__row')];
    const byName = rows.filter(one => one.getAttribute('data-leak') === 'by-name');
    const inner = rows.filter(one => one.getAttribute('data-leak') === 'inner');
    expect(byName).toHaveLength(1);
    expect(inner).toHaveLength(1);
    expect(byName[0]!.textContent).toContain('подписка эффекта «По имени» слушает эффект «Атака» по имени');
    expect(inner[0]!.textContent).toContain('читает шаги «Атака»');
    expect(document.querySelector('.map__state')!.textContent).toMatch(/лишних связей: \d+/);
    expect(document.querySelector('.map__state')!.textContent).toBe(`лишних связей: ${document.querySelectorAll('.map-leaks__row').length}`);
  });

  it('при английском интерфейсе в заголовках слоёв нет кириллицы', () => {
    useLocale.getState().setLang('en');
    useEffectView.setState({ view: 'map' });
    render(<EffectsTab />);
    const heads = [...document.querySelectorAll('.map-layer__title, .map__title, .map-layer__note, .map-leaks__title')].map(one => one.textContent ?? '');
    expect(heads.length).toBeGreaterThanOrEqual(10);
    expect(heads.filter(text => /[А-Яа-яЁё]/u.test(text))).toEqual([]);
    useLocale.getState().setLang('ru');
  });

  it('шесть образцов рендерятся без исключений', () => {
    useEffectView.setState({ view: 'map' });
    expect(SAMPLE_WORLDS.length).toBeGreaterThanOrEqual(6);
    for (const world of SAMPLE_WORLDS) {
      load(structuredClone(world), { activeTab: 'effects', activeEffectId: null });
      const { unmount } = render(<EffectsTab />);
      expect(document.querySelectorAll('.map-layer')).toHaveLength(4);
      unmount();
    }
  });
});
