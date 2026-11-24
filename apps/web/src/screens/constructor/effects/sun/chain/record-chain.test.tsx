// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { chainOf } from '@vtt/engine';
import type { Compendium, System } from '@vtt/engine';
import { RecordChainView } from './record-chain.tsx';
import { RecordChainLayer } from './chain-layer.tsx';
import { CompendiumScreen } from '../../../../compendium/compendium.tsx';
import { useWorld } from '../../../../../store/world.ts';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useLocale } from '../../../../../store/locale.ts';
import { load } from '../../../../../testing/round-trip.tsx';

const world = SAMPLE_WORLDS[0]!;
const system = world.system as unknown as System;
const compendium = world.compendium as unknown as Compendium;

const view = (recordId: string) => {
  const calls = { onOpenEffect: vi.fn(), onClose: vi.fn() };
  const out = render(<RecordChainView system={system} compendium={compendium} recordId={recordId} {...calls} />);
  return { ...calls, ...out };
};

const rowOf = (name: string): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>('.chain__ray')].find(row => row.querySelector('.chain__step-name')?.textContent === name);
  if (!found) throw new Error(name);
  return found;
};

beforeEach(() => {
  localStorage.clear();
  useLocale.getState().setLang('ru');
  load(structuredClone(world), {});
  useEffectView.setState({ view: 'form', trail: [], chain: null });
});
afterEach(() => { cleanup(); useEffectView.setState({ chain: null }); });

describe('разбор записи', () => {
  it('«Волшебная стрела»: эффект, плата первой строкой, «Урон» и «Щит» сбоку', () => {
    view('magic_missile');
    expect(screen.getByRole('heading', { name: 'Разбор: что вызывает «Волшебная стрела»' })).toBeTruthy();
    const effect = document.querySelector<HTMLElement>('.chain__cell--effect')!;
    expect(within(effect).getByText('Заклинание: стрелы без броска')).toBeTruthy();
    expect(effect.textContent).toContain('Сотворить');
    const rows = [...document.querySelectorAll<HTMLElement>('.chain__ray')];
    expect(rows[0]!.textContent).toContain('1 · плата');
    expect(rows[0]!.textContent).toContain('зовёт «Стоимость: действие и ячейка»');
    expect(rows.some(row => row.querySelector('.chain__step-name')?.textContent?.endsWith('Урон'))).toBe(true);
    const meddle = [...document.querySelectorAll<HTMLElement>('.chain__side')].map(side => side.textContent).join(' ');
    expect(meddle).toContain('Щит');
    expect(within(rowOf('3 · для каждого: Цель')).getByRole('button', { name: 'Щит' })).toBeTruthy();
  });

  it('«Огненный шар»: у спасброска число «правят» и имена подписок; «общий для» без самого себя', () => {
    view('fireball');
    const row = rowOf('5 · спас');
    expect(row.textContent).toContain('правят: 9');
    expect(within(row).getByRole('button', { name: 'Везунчик: очко удачи' })).toBeTruthy();
    expect(row.textContent).toContain('кости выпали');
    const effect = document.querySelector<HTMLElement>('.chain__cell--effect')!;
    expect(effect.textContent).toContain('общий для: Удержание личности, Порча');
    expect(effect.textContent).not.toContain('Огненный шар');
  });

  it('«Открыть пузыри ›» открывает эффект записи', () => {
    const { onOpenEffect } = view('magic_missile');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть пузыри ›' }));
    expect(onOpenEffect).toHaveBeenCalledWith('spell_auto');
  });

  it('слой: «Разбор» открывает окно, Escape закрывает', () => {
    render(<RecordChainLayer />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useEffectView.getState().openChain('magic_missile'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useEffectView.getState().chain).toBeNull();
  });

  it('слой в книге — только чтение: перехода в пузыри нет, имена не ссылки', () => {
    render(<RecordChainLayer linked={false} />);
    act(() => useEffectView.getState().openChain('magic_missile'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Щит').tagName).toBe('SPAN');
    expect(within(dialog).queryByRole('button', { name: /Открыть пузыри/ })).toBeNull();
  });

  it('слой: имя эффекта открывает его пузыри', () => {
    useEffectView.getState().openChain('magic_missile');
    render(<RecordChainLayer />);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Открыть пузыри ›' }));
    expect(useEffectView.getState().chain).toBeNull();
    expect(useEffectView.getState().view).toBe('sun');
    expect(useWorld.getState().activeEffectId).toBe('spell_auto');
    expect(useWorld.getState().activeTab).toBe('effects');
  });

  it('кнопка «Разбор» у записи с кнопкой есть и открывает окно; у записи без кнопок её нет', () => {
    const bare = (compendium.records ?? []).find(record => !chainOf(system, compendium, record.id)?.buttons.length)!;
    expect(bare).toBeTruthy();
    useWorld.setState({ activeRecordId: 'magic_missile' });
    render(<><CompendiumScreen /><RecordChainLayer /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Разбор' }));
    expect(useEffectView.getState().chain).toBe('magic_missile');
    expect(screen.getByRole('dialog')).toBeTruthy();
    cleanup();
    useEffectView.setState({ chain: null });
    useWorld.setState({ activeRecordId: bare.id });
    render(<CompendiumScreen />);
    expect(screen.queryByRole('button', { name: 'Разбор' })).toBeNull();
  });

  it('по-английски в заголовках колонок нет кириллицы', () => {
    useLocale.getState().setLang('en');
    view('magic_missile');
    const heads = [...document.querySelectorAll('.chain__head')].map(head => head.textContent ?? '');
    expect(heads.length).toBeGreaterThanOrEqual(4);
    for (const head of heads) expect(head).not.toMatch(/[А-Яа-яЁё]/u);
    expect(heads).toContain('Book record');
  });
});
