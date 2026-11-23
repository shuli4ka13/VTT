// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { LangsSection } from './langs-section.tsx';
import { pickCombo } from '../../../testing/cards.ts';
import { useWorld, emptySystem } from '../../../store/world.ts';
import type { System } from '@vtt/schema';

const base = (): System => ({
  ...emptySystem(),
  tables: {
    лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
      { key: 'раны', label: 'Раны', kind: 'number' },
      { key: 'имя', label: 'Имя', kind: 'text' },
    ] },
  },
  blocks: [{ key: 'Основа', parts: [{ table: 'лист' }] }],
} as unknown as System);

function Live() {
  const system = useWorld(state => state.system);
  const editSystem = useWorld(state => state.editSystem);
  return <LangsSection system={system} editSystem={editSystem} />;
}

const langRow = (): HTMLElement =>
  screen.getAllByRole('row').find(row => row.textContent?.startsWith('английский') && row.textContent.includes('Перевести'))!;

const now = () => useWorld.getState().system as System & { langs?: string[] };

describe('правила: языки', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: base(), compendium: { records: [] } })); });
  afterEach(cleanup);

  it('добавить язык, перевести одну подпись, убрать язык', () => {
    render(<Live />);
    expect(now().langs).toBeUndefined();
    pickCombo(screen.getByLabelText('добавить язык'), 'en');
    expect(now().langs).toEqual(['ru', 'en']);

    const row = langRow();
    expect(within(row).getByText(/без перевода: \d+ из \d+/)).toBeTruthy();
    const before = Number(/без перевода: (\d+)/.exec(row.textContent ?? '')![1]);
    expect(before).toBeGreaterThan(1);
    fireEvent.click(within(row).getByText('Перевести'));

    const fold = screen.getByText('Лист', { selector: '.fold__title' }).closest('details') as HTMLDetailsElement;
    expect(screen.queryByText('Раны')).toBeNull();
    fold.open = true;
    fireEvent(fold, new Event('toggle'));
    const line = screen.getByText('Раны').closest('[role="row"]') as HTMLElement;
    const input = within(line).getByPlaceholderText('перевод');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Wounds' } });
    fireEvent.blur(input);

    const columns = (now().tables as Record<string, { columns: { key: string; i18n?: unknown }[] }>).лист!.columns;
    expect(columns.find(column => column.key === 'раны')!.i18n).toEqual({ en: { label: 'Wounds' } });
    expect(columns.find(column => column.key === 'имя')!.i18n).toBeUndefined();
    const after = langRow();
    expect(after.textContent).toContain(`без перевода: ${before - 1} из`);

    fireEvent.click(within(after).getByText('Убрать'));
    fireEvent.click(screen.getByText('точно убрать'));
    expect(now().langs).toBeUndefined();
    expect(JSON.stringify(now())).not.toContain('Wounds');
    expect(JSON.stringify(now())).not.toContain('i18n');
  });

  it('основной русский без других языков в данные не пишется', () => {
    render(<Live />);
    pickCombo(screen.getByLabelText('основной язык'), 'en');
    expect(now().langs).toEqual(['en']);
    pickCombo(screen.getByLabelText('основной язык'), 'ru');
    expect('langs' in now()).toBe(false);
  });
});
