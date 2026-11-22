// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderOpen, openAll } from '../../testing/render-open.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import { fieldsOf } from '@vtt/engine';

const press = (name: string | RegExp) => { fireEvent.click(screen.getAllByRole('button', { name })[0]!); openAll(); };

describe('таблица прямо на листе', () => {
  beforeEach(() => {
    useWorld.getState().replaceWorld({
      system: { ...emptySystem(), blocks: [{ name: 'Характеристики', parts: [] }] },
      compendium: { records: [] },
      sheets: [],
    });
  });
  afterEach(() => { cleanup(); });

  it('«+ таблица» в блоке заводит таблицу своей у каждого листа, ставит её в блок и открывает тот же редактор таблицы; название не закрывает его', () => {
    renderOpen(<SheetTab />);
    press('блоки и типы листов');
    press('+ таблица');

    const made = () => Object.entries(useWorld.getState().system.tables ?? {}).filter(([, table]) => table.shape !== 'single');
    expect(made()).toHaveLength(1);
    const [key, table] = made()[0]!;
    expect(table.owner).toBe('sheet');
    expect(useWorld.getState().system.blocks![0]!.parts).toEqual([{ table: key }]);
    expect(useWorld.getState().activeSheetTable).toBe(key);

    const name = screen.getByPlaceholderText('как зовётся таблица');
    fireEvent.change(name, { target: { value: 'Характеристики' } });
    fireEvent.blur(name);
    openAll();

    const [renamed, labelled] = made()[0]!;
    expect(labelled.label).toBe('Характеристики');
    expect(useWorld.getState().activeSheetTable, 'редактор следует за новым ключом').toBe(renamed);
    expect(useWorld.getState().system.blocks![0]!.parts).toEqual([{ table: renamed }]);
    expect(screen.getByDisplayValue('Характеристики')).toBeTruthy();
  });

  it('колонка, которая читает свою же таблицу, не делает таблицу «занятой»: её можно удалить', () => {
    useWorld.getState().replaceWorld({
      system: { ...emptySystem(), tables: { характеристики: { label: 'Характеристики', key: 'word', owner: 'sheet', rows: [{ value: 'сила' }], columns: [
        { key: 'value', label: 'Значение', kind: 'number' },
        { key: 'бонус', label: 'Бонус', expr: { expr: 'округлить вниз(@строка.value / 10)' } },
      ] } } as never },
      compendium: { records: [] },
      sheets: [],
    });
    useWorld.getState().pick({ activeSheetTable: 'характеристики' });
    renderOpen(<SheetTab />);
    expect(document.body.textContent).not.toContain('берут отсюда');
    const remove = screen.getAllByRole('button', { name: 'Удалить' })[0] as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
  });

  it('строки таблицы на листе становятся полями героя; подпись таблицы в блоке открывает её редактор', () => {
    renderOpen(<SheetTab />);
    press('блоки и типы листов');
    press('+ таблица');
    const row = screen.getByPlaceholderText('как зовётся строка');
    fireEvent.change(row, { target: { value: 'сила' } });
    fireEvent.blur(row);
    openAll();
    expect(fieldsOf(useWorld.getState().system).some(field => field.label.includes('сила'))).toBe(true);

    fireEvent.click(screen.getByTitle('закрыть таблицу'));
    expect(useWorld.getState().activeSheetTable).toBeNull();
    press('новая таблица:');
    expect(useWorld.getState().activeSheetTable).not.toBeNull();
  });

  it('строка таблицы — одно название: слово для формул выводится из него и идёт за ним, формулы следуют за словом', () => {
    useWorld.getState().replaceWorld({
      system: { ...emptySystem(), tables: {
        действия: { label: 'Действия', key: 'word', owner: 'sheet', rows: [{ value: '' }], columns: [{ key: 'value', label: 'Осталось', kind: 'number' }] },
        лист: { shape: 'single', columns: [{ key: 'x', label: 'X', expr: { expr: '@действия.главное.value' } }] },
      } as never },
      compendium: { records: [] },
      sheets: [],
    });
    useWorld.getState().pick({ activeSheetTable: 'действия' });
    renderOpen(<SheetTab />);
    const name = (text: string, at = 0) => {
      const input = screen.getAllByPlaceholderText('как зовётся строка')[at]!;
      fireEvent.change(input, { target: { value: text } });
      fireEvent.blur(input);
      openAll();
    };
    const rows = () => useWorld.getState().system.tables!.действия!.rows!;

    name('Бонусное действие');
    expect(rows()[0]!.value).toBe('бонусное_действие');
    expect(rows()[0]!.label).toBe('Бонусное действие');

    name('Реакция', 0);
    expect(rows()[0]!.value, 'слово идёт за названием').toBe('реакция');
    expect(rows()[0]!.label).toBe('Реакция');

    useWorld.getState().editSystem(draft => { draft.tables!.действия!.rows = [{ value: 'главное', cells: {} }]; });
    openAll();
    name('Главное действие', 0);
    expect(rows()[0]!.value).toBe('главное_действие');
    expect(rows()[0]!.label).toBe('Главное действие');
    const formula = useWorld.getState().system.tables!.лист!.columns![0]!.expr as { expr: string };
    expect(formula.expr, 'формула, которая читала строку, переписана на новое слово').toBe('@действия.главное_действие.value');
  });
});
