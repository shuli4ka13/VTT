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
    },
  },
});

describe('колонка таблицы, своя у каждого листа', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: withTable() })); });

  it('новая колонка сразу даёт поле на каждой строке, правка формулы колонки меняет все поля', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [
        { key: 'score', label: 'Значение', kind: 'number', start: 10, sheet: { tag: '{key}', label: '{label}', group: 'Характеристики' } },
        { key: 'mod', label: 'Модификатор', kind: 'expr', expr: '@строка.score', sheet: { tag: '{key}_mod', label: 'Модификатор: {label}' } },
      ];
    });
    expect(useWorld.getState().system.fields.map(f => f.tag)).toEqual(['str', 'str_mod', 'dex', 'dex_mod']);

    editRules(draft => {
      draft.tables!.abilities!.columns![1]!.expr = 'округлить вниз((@строка.score - 10) / 2)';
    });
    const mods = useWorld.getState().system.fields.filter(f => f.cell?.column === 'mod');
    expect(mods.map(f => (f.value as { expr: string }).expr)).toEqual(['округлить вниз((@str - 10) / 2)', 'округлить вниз((@dex - 10) / 2)']);
  });

  it('новая строка таблицы — новые поля на листе', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [{ key: 'score', label: 'Значение', kind: 'number', start: 10, sheet: { tag: '{key}', label: '{label}' } }];
    });
    editRules(draft => { draft.tables!.abilities!.rows!.push({ value: 'мудрость', key: 'wis', label: 'Мудрость' }); });
    expect(useWorld.getState().system.fields.map(f => f.label)).toEqual(['Сила', 'Ловкость', 'Мудрость']);
  });

  it('«+ из таблицы» на вкладке «Лист»: пустая таблица получает колонку «Значение», формулы идут следом', () => {
    const { editSystem } = useWorld.getState();
    editSystem(draft => {
      draft.tables!.abilities!.columns = [{ key: 'mod', label: 'Модификатор', kind: 'expr', expr: 'округлить вниз((@строка.value - 10) / 2)' }];
      placeOnSheet(draft, 'abilities');
    });
    const fields = useWorld.getState().system.fields;
    expect(fields.map(f => f.tag)).toEqual(['str', 'str_mod', 'dex', 'dex_mod']);
    expect(fields.map(f => f.label)).toEqual(['Сила', 'Модификатор: Сила', 'Ловкость', 'Модификатор: Ловкость']);
  });
});
