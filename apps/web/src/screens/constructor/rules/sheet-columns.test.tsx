// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from '../../../store/world.ts';
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
        { key: 'score', label: 'Значение', sheet: { tag: '{key}', label: '{label}', group: 'Характеристики', value: { kind: 'stored', type: 'number', default: 10 } } },
        { key: 'mod', label: 'Модификатор', sheet: { tag: '{key}_mod', label: 'Модификатор: {label}', value: { kind: 'formula', expr: '@{key}' } } },
      ];
    });
    expect(useWorld.getState().system.fields.map(f => f.tag)).toEqual(['str', 'str_mod', 'dex', 'dex_mod']);

    editRules(draft => {
      const sheet = draft.tables!.abilities!.columns![1]!.sheet!;
      sheet.value = { kind: 'formula', expr: 'floor((@{key} - 10) / 2)' };
    });
    const mods = useWorld.getState().system.fields.filter(f => f.cell?.column === 'mod');
    expect(mods.map(f => (f.value as { expr: string }).expr)).toEqual(['floor((@str - 10) / 2)', 'floor((@dex - 10) / 2)']);
  });

  it('новая строка таблицы — новые поля на листе', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [{ key: 'score', label: 'Значение', sheet: { tag: '{key}', label: '{label}', value: { kind: 'stored', type: 'number', default: 10 } } }];
    });
    editRules(draft => { draft.tables!.abilities!.rows!.push({ value: 'мудрость', key: 'wis', label: 'Мудрость' }); });
    expect(useWorld.getState().system.fields.map(f => f.label)).toEqual(['Сила', 'Ловкость', 'Мудрость']);
  });
});
