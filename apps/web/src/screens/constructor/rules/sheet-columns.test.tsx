// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { placeOnSheet } from '../table-field.tsx';
import type { System } from '@vtt/schema';

const withTable = (): System => ({
  ...emptySystem(),
  tables: {
    abilities: {
      label: 'Характеристики',
      columns: [],
      rows: [{ value: 'сила', key: 'str', label: 'Сила' }, { value: 'ловкость', key: 'dex', label: 'Ловкость' }],
      sheet: { group: 'Характеристики' },
    },
  },
});

describe('таблица на листе', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: withTable() })); });

  it('новая колонка сразу даёт поле на каждой строке, правка формулы колонки меняет все поля', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [
        { key: 'score', label: 'Значение', kind: 'number' },
        { key: 'mod', label: 'Модификатор', kind: 'number', expr: '@строка.score' },
      ];
    });
    expect(useWorld.getState().system.fields.map(f => f.tag)).toEqual(['abilities.str.score', 'abilities.str.mod', 'abilities.dex.score', 'abilities.dex.mod']);

    editRules(draft => {
      draft.tables!.abilities!.columns![1]!.expr = 'округлить вниз((@строка.score - 10) / 2)';
    });
    const mods = useWorld.getState().system.fields.filter(f => f.cell?.column === 'mod');
    expect(mods.map(f => (f.value as { expr: string }).expr)).toEqual(['округлить вниз((@abilities.str.score - 10) / 2)', 'округлить вниз((@abilities.dex.score - 10) / 2)']);
  });

  it('новая строка таблицы — новые поля на листе', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [{ key: 'score', label: 'Значение', kind: 'number' }];
    });
    editRules(draft => { draft.tables!.abilities!.rows!.push({ value: 'мудрость', key: 'wis', label: 'Мудрость' }); });
    expect(useWorld.getState().system.fields.map(f => f.label)).toEqual(['Сила', 'Ловкость', 'Мудрость']);
  });

  it('«+ из таблицы» на вкладке «Лист»: пустая таблица получает колонку «Значение», формулы идут следом', () => {
    const { editSystem } = useWorld.getState();
    editSystem(draft => {
      delete draft.tables!.abilities!.sheet;
      draft.tables!.abilities!.columns = [{ key: 'mod', label: 'Модификатор', kind: 'number', expr: 'округлить вниз((@строка.value - 10) / 2)' }];
      placeOnSheet(draft, 'abilities');
    });
    const fields = useWorld.getState().system.fields;
    expect(fields.map(f => f.tag)).toEqual(['abilities.str.value', 'abilities.str.mod', 'abilities.dex.value', 'abilities.dex.mod']);
    expect(fields.map(f => f.label)).toEqual(['Сила', 'Модификатор: Сила', 'Ловкость', 'Модификатор: Ловкость']);
  });

  it('вписанное в клетку значение — одно на всех, поля не даёт', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [{ key: 'score', label: 'Значение', kind: 'number' }];
      draft.tables!.abilities!.rows![0]!.cells = { score: 12 };
    });
    expect(useWorld.getState().system.fields.map(f => f.tag)).toEqual(['abilities.dex.score']);
  });
});
