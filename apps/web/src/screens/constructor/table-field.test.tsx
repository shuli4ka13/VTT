// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ColumnSheetFields } from './table-field.tsx';
import { FormulaBar } from '../../ui/formula-bar.tsx';
import { useFormulaBar } from '../../store/formula-bar.ts';
import { useWorld } from '../../store/world.ts';
import { pickCombo, comboOptions } from '../../testing/cards.ts';
import type { System } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', effects: {},
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты_макс', label: 'Максимум хитов', kind: 'number', default: 12 },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 8 },
  ] } },
} as unknown as System;

function Live() {
  const current = useWorld(state => state.system);
  const column = current.tables!['лист']!.columns![1]!;
  return <><FormulaBar /><ColumnSheetFields tableId="лист" column={column} system={current} /></>;
}

const hits = () => useWorld.getState().system.tables!['лист']!.columns![1]!;
const barInput = () => [...document.querySelectorAll('.formula-bar input.chips__text')].at(-1) as HTMLInputElement;

describe('«В новом листе»: число или формула', () => {
  beforeEach(() => {
    useFormulaBar.getState().dismiss();
    useWorld.setState(state => ({ ...state, system, compendium: { records: [] } }));
  });
  afterEach(cleanup);

  it('число вписывается простым вводом, как раньше', () => {
    render(<Live />);
    const field = screen.getByText('В новом листе').closest('.field')!;
    fireEvent.change(field.querySelector('input')!, { target: { value: '10' } });
    expect(hits().default).toBe(10);
  });

  it('кнопка «формула» открывает поле формулы: значение считается, когда лист заводят', () => {
    render(<Live />);
    fireEvent.click(screen.getByRole('button', { name: 'формула' }));
    const field = screen.getByText('В новом листе').closest('.field')!;
    fireEvent.click(field.querySelector('.formula-field')!);
    fireEvent.change(barInput(), { target: { value: '@хиты_макс' } });
    fireEvent.keyDown(barInput(), { key: 'Enter' });
    expect(hits().default).toEqual({ expr: '@хиты_макс' });
    expect(screen.getByRole('button', { name: 'число' })).toBeTruthy();
  });

  it('«число» возвращает простой ввод и снимает формулу', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...system, tables: { лист: { shape: 'single', columns: [system.tables!['лист']!.columns![0]!, { key: 'хиты', label: 'Хиты', kind: 'number', default: { expr: '@хиты_макс' } }] } } } as unknown as System,
    }));
    render(<Live />);
    expect(screen.queryByRole('button', { name: 'формула' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'число' }));
    expect(hits()).not.toHaveProperty('default');
    expect(screen.getByRole('button', { name: 'формула' })).toBeTruthy();
  });
});

describe('поле вида «текст» в настройках поля', () => {
  const noted = {
    id: 'x', name: 'x', effects: {},
    tables: { лист: { shape: 'single', columns: [
      { key: 'хиты_макс', label: 'Максимум хитов', kind: 'number', default: 12 },
      { key: 'заметки', label: 'Заметки', kind: 'note' },
    ] } },
  } as unknown as System;

  beforeEach(() => {
    useFormulaBar.getState().dismiss();
    useWorld.setState(state => ({ ...state, system: noted, compendium: { records: [] } }));
  });
  afterEach(cleanup);

  it('«В новом листе» — текст в несколько строк, без кнопки «формула» и без броска', () => {
    render(<Live />);
    const field = screen.getByText('В новом листе').closest('.field')!;
    const area = field.querySelector('textarea')!;
    fireEvent.change(area, { target: { value: 'Цели:\nУзы:' } });
    expect(hits().default).toBe('Цели:\nУзы:');
    expect(screen.queryByRole('button', { name: 'формула' })).toBeNull();
    expect(screen.queryByText('Бросок')).toBeNull();
  });

  it('стёртый текст снимает значение', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...noted, tables: { лист: { shape: 'single', columns: [noted.tables!['лист']!.columns![0]!, { key: 'заметки', label: 'Заметки', kind: 'note', default: 'Цели:' }] } } } as unknown as System,
    }));
    render(<Live />);
    const area = screen.getByText('В новом листе').closest('.field')!.querySelector('textarea')!;
    fireEvent.change(area, { target: { value: '  ' } });
    expect(hits()).not.toHaveProperty('default');
  });
});

describe('кто видит и кто правит поле', () => {
  beforeEach(() => {
    useFormulaBar.getState().dismiss();
    useWorld.setState(state => ({ ...state, system, compendium: { records: [] } }));
  });
  afterEach(cleanup);
  const pick = (label: string, option: string) => pickCombo(screen.getByLabelText(label), option);

  it('по умолчанию ключей нет; выбор пишет настройку, возврат к «все» и «игрок» её снимает', () => {
    render(<Live />);
    expect(hits()).not.toHaveProperty('sees');
    pick('кто видит', 'только ведущий');
    pick('кто правит', 'только ведущий');
    expect(hits()).toMatchObject({ sees: 'gm', edits: 'gm' });
    pick('кто видит', 'все');
    pick('кто правит', 'игрок');
    expect(hits()).not.toHaveProperty('sees');
    expect(hits()).not.toHaveProperty('edits');
  });

  it('«никто не видит» сразу ставит «никто не правит», и другого выбора правки нет', () => {
    render(<Live />);
    pick('кто видит', 'никто — служебное');
    expect(hits()).toMatchObject({ sees: 'none', edits: 'none' });
    expect(comboOptions(screen.getByLabelText('кто правит')).map(option => option.label)).toEqual(['никто — только правила']);
  });

  it('у посчитанного поля настройки «Правит» нет', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...system, tables: { лист: { shape: 'single', columns: [system.tables!['лист']!.columns![0]!, { key: 'хиты', label: 'Хиты', expr: { expr: '@хиты_макс' } }] } } } as unknown as System,
    }));
    render(<Live />);
    expect(screen.getByLabelText('кто видит')).toBeTruthy();
    expect(screen.queryByLabelText('кто правит')).toBeNull();
  });
});

