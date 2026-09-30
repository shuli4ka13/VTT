// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { placeOnSheet } from '../table-field.tsx';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import type { System } from '@vtt/schema';

const withTable = (): System => ({
  ...emptySystem(),
  tables: {
    abilities: {
      label: 'Характеристики', owner: 'sheet', block: 'Характеристики',
      columns: [],
      rows: [{ value: 'сила', label: 'Сила' }, { value: 'ловкость', label: 'Ловкость' }],
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
    expect(fieldsOf(useWorld.getState().system).map(f => f.tag)).toEqual(['abilities.сила.score', 'abilities.сила.mod', 'abilities.ловкость.score', 'abilities.ловкость.mod']);

    editRules(draft => {
      draft.tables!.abilities!.columns![1]!.expr = 'округлить вниз((@строка.score - 10) / 2)';
    });
    const mods = fieldsOf(useWorld.getState().system).filter(f => f.cell?.column === 'mod');
    expect(mods.map(f => (f.value as { expr: string }).expr)).toEqual(['округлить вниз((@abilities.сила.score - 10) / 2)', 'округлить вниз((@abilities.ловкость.score - 10) / 2)']);
  });

  it('новая строка таблицы — новые поля на листе', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [{ key: 'score', label: 'Значение', kind: 'number' }];
    });
    editRules(draft => { draft.tables!.abilities!.rows!.push({ value: 'мудрость', label: 'Мудрость' }); });
    expect(fieldsOf(useWorld.getState().system).map(f => f.label)).toEqual(['Сила', 'Ловкость', 'Мудрость']);
  });

  it('«+ из таблицы» на вкладке «Лист»: пустая таблица получает колонку «Значение», формулы идут следом', () => {
    const { editSystem } = useWorld.getState();
    editSystem(draft => {
      delete draft.tables!.abilities!.owner;
      draft.tables!.abilities!.columns = [{ key: 'mod', label: 'Модификатор', kind: 'number', expr: 'округлить вниз((@строка.value - 10) / 2)' }];
      placeOnSheet(draft, 'abilities');
    });
    const fields = fieldsOf(useWorld.getState().system);
    expect(fields.map(f => f.tag)).toEqual(['abilities.сила.value', 'abilities.сила.mod', 'abilities.ловкость.value', 'abilities.ловкость.mod']);
    expect(fields.map(f => f.label)).toEqual(['Сила', 'Модификатор: Сила', 'Ловкость', 'Модификатор: Ловкость']);
  });

  it('вписанное в клетку значение — одно на всех, поля не даёт', () => {
    const { editRules } = useWorld.getState();
    editRules(draft => {
      draft.tables!.abilities!.columns = [{ key: 'score', label: 'Значение', kind: 'number' }];
      draft.tables!.abilities!.rows![0]!.cells = { score: 12 };
    });
    expect(fieldsOf(useWorld.getState().system).map(f => f.tag)).toEqual(['abilities.ловкость.score']);
  });
});
