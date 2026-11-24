// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { sunOf } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { layoutOf } from '../layout.ts';
import type { Placed } from '../layout.ts';
import { BubbleWindow } from './index.tsx';
import { useLocale } from '../../../../../store/locale.ts';

const dnd = SAMPLE_WORLDS[0]!.system as unknown as System;

const placedOf = (effect: string, pick: (one: Placed) => boolean): Placed => {
  const found = layoutOf(sunOf(dnd, effect)!).placed.find(pick);
  if (!found) throw new Error('нет пузыря');
  return found;
};

function show(effectId: string, placed: Placed) {
  const calls = { onClose: vi.fn(), onOpenEffect: vi.fn(), onOpenForm: vi.fn() };
  render(<BubbleWindow system={dnd} effectId={effectId} sun={sunOf(dnd, effectId)!} placed={placed} {...calls} />);
  return calls;
}

const dialog = (): HTMLElement => screen.getByRole('dialog');

afterEach(() => { cleanup(); useLocale.getState().setLang('ru'); });

describe('окно шага', () => {
  it('бросок «Атаки»: номер, счётчик вмешательств, привязка «Щит», открыть в форме', () => {
    const placed = placedOf('strike', one => one.ray?.label === 'бросок' && one.what === 'ray');
    const calls = show('strike', placed);
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(within(dialog()).getByRole('heading', { level: 2 }).textContent).toBe('Шаг 7 · бросок');
    expect(dialog().textContent).toContain('Правят сами: 13');
    expect(dialog().textContent).toContain('Спросят игрока: 4');
    expect(within(dialog()).getByRole('button', { name: 'Щит' })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Открыть в форме' }));
    expect(calls.onOpenForm).toHaveBeenCalledWith(10);
    expect(dialog().textContent).not.toMatch(/@/);
  });

  it('шаг с условием называет его словами', () => {
    const placed = placedOf('strike', one => one.what === 'ray' && Boolean(one.ray?.condition));
    show('strike', placed);
    expect(within(dialog()).getByText(/Условие/)).toBeTruthy();
    expect(dialog().textContent).not.toMatch(/@/);
  });

  it('Escape и «×» закрывают', () => {
    const placed = placedOf('strike', one => one.what === 'ray');
    const calls = show('strike', placed);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(calls.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    expect(calls.onClose).toHaveBeenCalledTimes(2);
  });

  it('фокус уходит в окно и возвращается', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const placed = placedOf('strike', one => one.what === 'ray');
    show('strike', placed);
    expect(document.activeElement).toBe(dialog());
    cleanup();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('при английском интерфейсе подписи секций не русские', () => {
    useLocale.getState().setLang('en');
    const placed = placedOf('strike', one => one.ray?.label === 'бросок' && one.what === 'ray');
    show('strike', placed);
    const titles = [...dialog().querySelectorAll('.sunw__section-title')].map(one => one.textContent ?? '');
    expect(titles.length).toBeGreaterThan(2);
    expect(titles.filter(text => /[А-Яа-яЁё]/u.test(text))).toEqual([]);
    expect(within(dialog()).getByRole('button', { name: 'Open in form' })).toBeTruthy();
  });
});

describe('окно вызова', () => {
  it('«Бросок атаки»: входы вызванного, что вернёт, открыть пузыри', () => {
    const placed = placedOf('strike', one => one.what === 'group' && one.group?.role === 'calls' && one.group.items.some(item => item.ref?.effect === 'attack_roll'));
    const calls = show('strike', placed);
    const text = dialog().textContent ?? '';
    expect(text).toContain('Кто бросает');
    expect(text).toContain('Против кого');
    expect(text).toContain('попал');
    expect(text).toContain('Бросок к20');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Открыть пузыри/ }));
    expect(calls.onOpenEffect).toHaveBeenCalledWith('attack_roll');
  });
});

describe('окно метки', () => {
  it('«Атака»: договор, кто носит, кто слышит', () => {
    const placed = placedOf('attack_roll', one => one.what === 'group' && one.group?.role === 'sets' && one.group.kind === 'tag' && one.group.items.some(item => item.ref?.tags?.includes('ataka')));
    const calls = show('attack_roll', placed);
    const block = [...dialog().querySelectorAll<HTMLElement>('.sunw__block')].find(one => one.querySelector('h4')?.textContent === 'Атака')!;
    const text = block.textContent ?? '';
    expect(text).toContain('Договор метки');
    expect(text).toContain('попал');
    const carries = within(block).getByText(/Кто носит/).closest('section')!;
    expect(carries.textContent).toContain('Атака заклинанием');
    const hears = within(block).getByText(/Кто слышит/).closest('section')!;
    fireEvent.click(within(hears as HTMLElement).getByRole('button', { name: 'Щит' }));
    expect(calls.onOpenEffect).toHaveBeenCalledWith('shield');
  });
});

describe('окно привязки', () => {
  it('«Щит»: до, по метке, решает игрок, можно кнопкой', () => {
    const placed = placedOf('strike', one => one.what === 'group' && one.group?.role === 'seam' && one.group.items.some(item => item.seam?.by === 'shield'));
    const calls = show('strike', placed);
    const block = dialog().querySelector<HTMLElement>('[data-seam="shield"]')!;
    const text = block.textContent ?? '';
    expect(text).toContain('до');
    expect(text).toContain('по метке «Атака»');
    expect(text).toContain('решает игрок');
    expect(text).toContain('можно кнопкой');
    expect(text).toContain('нашла место');
    expect(text).not.toMatch(/@/);
    fireEvent.click(within(block).getByRole('button', { name: 'открыть ›' }));
    expect(calls.onOpenEffect).toHaveBeenCalledWith('shield');
  });
});

describe('все пузыри открываются', () => {
  beforeEach(() => { cleanup(); });
  for (const id of ['strike', 'shield', 'attack_roll', 'damage', 'hidden']) {
    it(`эффект ${id}`, () => {
      const sun = sunOf(dnd, id)!;
      for (const placed of layoutOf(sun).placed) {
        const calls = { onClose: vi.fn(), onOpenEffect: vi.fn(), onOpenForm: vi.fn() };
        const view = render(<BubbleWindow system={dnd} effectId={id} sun={sun} placed={placed} {...calls} />);
        expect(Boolean(document.querySelector('[role="dialog"]'))).toBe(placed.what !== 'center');
        view.unmount();
      }
    });
  }
});
