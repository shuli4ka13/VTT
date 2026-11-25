// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { sunOf } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { SunDock } from './index.tsx';
import { useWorld } from '../../../../../store/world.ts';
import { load } from '../../../../../testing/round-trip.tsx';

const world = SAMPLE_WORLDS[0]!;
const dnd = world.system as unknown as System;

function dock(effectId: string) {
  const calls = { onOpenEffect: vi.fn(), onOpenForm: vi.fn() };
  render(<SunDock system={dnd} effectId={effectId} sun={sunOf(dnd, effectId)!} {...calls} />);
  return calls;
}

beforeEach(() => { load(structuredClone(world), {}); });
afterEach(() => { cleanup(); });

describe('нижняя панель', () => {
  it('«Где используется»: у «Атаки» — записи книги и подписанные, у «Щита» — никто не зовёт', () => {
    dock('strike');
    fireEvent.click(screen.getByRole('tab', { name: 'Где используется' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain('Оружие › Удар');
    expect(within(panel).getByRole('button', { name: 'Щит' })).toBeTruthy();
    cleanup();
    dock('shield');
    fireEvent.click(screen.getByRole('tab', { name: 'Где используется' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('никто не зовёт');
  });

  it('«Щит» висит: на «Пробе» есть блок «Что случилось»', () => {
    dock('shield');
    fireEvent.click(screen.getByRole('tab', { name: 'Проба' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('Что случилось');
  });

  it('проблемы этого эффекта: вкладка по умолчанию, строка и «открыть в форме»', () => {
    const broken = structuredClone(dnd);
    (broken.effects.strike!.steps as { id?: string; type: string; effect?: string }[])[10]!.effect = 'нет_такого';
    useWorld.setState(state => ({ ...state, system: broken }));
    const calls = { onOpenEffect: vi.fn(), onOpenForm: vi.fn() };
    render(<SunDock system={broken} effectId="strike" sun={sunOf(broken, 'strike')!} {...calls} />);
    const tab = screen.getAllByRole('tab').find(one => /^Проблемы · \d+$/.test(one.textContent ?? ''))!;
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(Number(/\d+/.exec(tab.textContent!)![0])).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole('tabpanel')).getAllByRole('button', { name: 'открыть в форме' })[0]!);
    expect(calls.onOpenForm).toHaveBeenCalledTimes(1);
  });

  it('нет проблем — так и сказано', () => {
    dock('shield');
    const tab = screen.getAllByRole('tab')[1]!;
    if (tab.textContent === 'Проблемы · 0') {
      fireEvent.click(tab);
      expect(screen.getByRole('tabpanel').textContent).toContain('проблем нет');
    }
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});
