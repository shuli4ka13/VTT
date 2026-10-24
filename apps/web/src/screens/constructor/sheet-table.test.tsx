// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderOpen, openAll } from '../../testing/render-open.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

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

  it('строки таблицы на листе становятся полями героя; подпись таблицы в блоке открывает её редактор', () => {
    renderOpen(<SheetTab />);
    press('блоки и типы листов');
    press('+ таблица');
    const row = screen.getByPlaceholderText('слово');
    fireEvent.change(row, { target: { value: 'сила' } });
    fireEvent.blur(row);
    openAll();
    expect(fieldsOf(useWorld.getState().system).some(field => field.label.includes('сила'))).toBe(true);

    fireEvent.click(screen.getByTitle('закрыть таблицу'));
    expect(useWorld.getState().activeSheetTable).toBeNull();
    press('новая таблица:');
    expect(useWorld.getState().activeSheetTable).not.toBeNull();
  });
});
