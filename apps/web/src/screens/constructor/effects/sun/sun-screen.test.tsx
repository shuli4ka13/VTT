// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { EffectsTab } from '../effects-tab.tsx';
import { useWorld } from '../../../../store/world.ts';
import { useEffectView } from '../../../../store/effect-view.ts';
import { useLocale } from '../../../../store/locale.ts';
import { load } from '../../../../testing/round-trip.tsx';
import { englishWorld, russianIn } from '../../../../testing/english.tsx';
import { shownText } from '../../../../testing/no-keys.tsx';

const dnd = SAMPLE_WORLDS.find(world => world.system.name === 'D&D 5e')!;

const open = (effect: string): void => load(structuredClone(dnd), { activeTab: 'effects', activeEffectId: effect });

const bubbles = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Пузыри' })); };

const canvas = (): HTMLElement => document.querySelector<HTMLElement>('.sun-canvas')!;

const bubble = (id: string): HTMLElement => canvas().querySelector<HTMLElement>(`[data-bubble="${id}"]`)!;

describe('вид «Пузыри»', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocale.getState().setLang('ru');
    useEffectView.setState({ view: 'form', trail: [] });
    open('strike');
  });
  afterEach(() => { cleanup(); useEffectView.setState({ view: 'form', trail: [] }); });

  it('по умолчанию вкладка рисует форму; после щелчка «Пузыри» — холст, и выбор переживает перерисовку', () => {
    const { rerender } = render(<EffectsTab />);
    expect(document.querySelector('.sun-canvas')).toBeNull();
    expect(screen.getByRole('button', { name: 'Форма' }).getAttribute('aria-pressed')).toBe('true');
    bubbles();
    expect(canvas()).toBeTruthy();
    expect(useEffectView.getState().view).toBe('sun');
    rerender(<EffectsTab />);
    expect(canvas()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Пузыри' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Форма' }));
    expect(document.querySelector('.sun-canvas')).toBeNull();
  });

  it('пока идёт урок, вид принудительно «Форма» и переключателя нет', () => {
    useEffectView.setState({ view: 'sun' });
    useWorld.setState(state => ({ ...state, origin: { ...state.origin, lesson: 'first-system' } }));
    render(<EffectsTab />);
    expect(document.querySelector('.sun-canvas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Пузыри' })).toBeNull();
    useWorld.setState(state => ({ ...state, origin: { ...state.origin, lesson: undefined } }));
  });

  it('у «Атаки» на холсте есть счётчик «правят 13 · вмешаются 4» и привязка «Щит»', () => {
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    expect(within(canvas()).getByText('правят 13 · вмешаются 4')).toBeTruthy();
    expect(within(canvas()).getAllByRole('button', { name: /Щит/ }).length).toBeGreaterThan(0);
  });

  it('инспектор без выбора: «Кто цепляется сейчас»; имя открывает тот эффект, «назад» возвращает', () => {
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    expect(screen.getByText('Кто цепляется сейчас')).toBeTruthy();
    const inspector = document.querySelector<HTMLElement>('.sun-inspector')!;
    expect(within(inspector).getByRole('button', { name: /Пламя клинка/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← назад' })).toBeNull();
    fireEvent.click(within(inspector).getByRole('button', { name: /Щит/ }));
    expect(useWorld.getState().activeEffectId).toBe('shield');
    expect(useEffectView.getState().trail).toEqual(['strike']);
    fireEvent.click(screen.getByRole('button', { name: '← назад' }));
    expect(useWorld.getState().activeEffectId).toBe('strike');
    expect(useEffectView.getState().trail).toEqual([]);
    expect(screen.queryByRole('button', { name: '← назад' })).toBeNull();
  });

  it('щелчок по счётчику показывает, кто правит бросок и кто вмешается с вопросом', () => {
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    fireEvent.click(within(canvas()).getByText('правят 13 · вмешаются 4'));
    expect(screen.getByText('Правят бросок сами · 13')).toBeTruthy();
    expect(screen.getByText('Вмешаются с вопросом · 4')).toBeTruthy();
    expect(screen.queryByText('Кто цепляется сейчас')).toBeNull();
  });

  it('стрелка вправо с первого луча переводит фокус на второй, стрелка вниз идёт по цепочке', () => {
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    const [first, second] = [...canvas().querySelectorAll<HTMLElement>('.sun-bubble--ray')];
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).dataset.bubble!.startsWith(`${second!.dataset.bubble}|`)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
  });

  it('висящий «Щит»: первый луч «что случилось», у него спутник «встаёт в» с «Атака»', () => {
    open('shield');
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    const rays = [...canvas().querySelectorAll<HTMLElement>('.sun-bubble--ray')];
    expect(rays[0]!.className).toContain('sun-k--heard');
    const stands = [...canvas().querySelectorAll<HTMLElement>('.sun-bubble--group')].filter(one => (one.textContent ?? '').includes('встаёт в:'));
    expect(stands.length).toBeGreaterThan(0);
    expect(stands[0]!.getAttribute('aria-label')).toContain('Атака');
    expect(stands[0]!.dataset.bubble!.startsWith(`${rays[0]!.dataset.bubble}|`)).toBe(true);
  });

  it('эффект без шагов: центр и спокойная подсказка', () => {
    useWorld.getState().editSystem(draft => { draft.effects.plain = { label: 'Пустой', activation: 'manual', steps: [] } as never; });
    useWorld.getState().pick({ activeEffectId: 'plain' });
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    expect(canvas().querySelectorAll('.sun-bubble--ray')).toHaveLength(0);
    expect(bubble('center')).toBeTruthy();
    expect(screen.getByText('У эффекта пока нет шагов. Добавьте их в форме.')).toBeTruthy();
  });

  it('при английском интерфейсе русского текста в пузырях и инспекторе нет', () => {
    const latin = englishWorld(structuredClone(dnd));
    load(latin, { activeTab: 'effects', activeEffectId: 'strike' });
    useLocale.getState().setLang('en');
    useEffectView.setState({ view: 'sun' });
    render(<EffectsTab />);
    fireEvent.click(within(canvas()).getByText(/edited by 13/));
    const pieces = shownText(document.querySelector('.sun')!);
    expect(russianIn(pieces)).toEqual([]);
    useLocale.getState().setLang('ru');
  });
});
