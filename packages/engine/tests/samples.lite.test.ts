import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { availableActions } from '../src/events/actions.ts';

type Bag = Record<string, unknown>;

const WHOLE = ['effects', 'tables', 'roll_edits', 'rolls', 'constants', 'groups', 'tags'] as const;
const SAME = ['id', 'name', 'blocks', 'pages', 'initiative', 'grid'] as const;

describe('лёгкие миры', () => {
  it('у каждого полного мира есть лёгкий', () => {
    expect(LITE_WORLDS.map(world => world.system.id)).toEqual(expect.arrayContaining(SAMPLE_WORLDS.map(world => world.system.id)));
  });

  for (const lite of LITE_WORLDS) {
    const full = SAMPLE_WORLDS.find(world => world.system.id === lite.system.id) ?? lite;
    const mine = lite.system as unknown as Bag;
    const theirs = full.system as unknown as Bag;

    describe(lite.system.name, () => {
      it('чист для «Проблем»', () => {
        expect(errorsOf(lintSystem(flattenSystem(lite.system), lite.compendium)).map(p => p.text)).toEqual([]);
      });

      it('всё оставленное совпадает с полным миром', () => {
        for (const part of WHOLE) {
          for (const [key, value] of Object.entries((mine[part] ?? {}) as Bag)) {
            expect(value, `${part}.${key}`).toEqual(((theirs[part] ?? {}) as Bag)[key]);
          }
        }
        for (const part of SAME) expect(mine[part], part).toEqual(theirs[part]);
        const records = new Map((full.compendium.records ?? []).map(record => [record.id, record]));
        for (const record of lite.compendium.records ?? []) expect(record, `запись ${record.id}`).toEqual(records.get(record.id));
      });

      it('таблицы листа и справочники — все, выдача — только из полного', () => {
        const tables = Object.entries(full.system.tables ?? {}).filter(([, table]) => table.shape !== 'book').map(([key]) => key);
        expect(Object.keys(lite.system.tables ?? {})).toEqual(expect.arrayContaining(tables));
        expect(full.system.grants ?? []).toEqual(expect.arrayContaining(lite.system.grants ?? []));
      });

      it('листы — те же значения, вещи только из лёгкой книги, действие есть', () => {
        const sheets = new Map(full.sheets.map(sheet => [sheet.id, sheet]));
        const book = new Set((lite.compendium.records ?? []).map(record => record.id));
        const world = { system: flattenSystem(lite.system), compendium: lite.compendium, sheets: lite.sheets };
        let actions = 0;
        for (const sheet of lite.sheets) {
          expect(sheet.values, sheet.id).toEqual(sheets.get(sheet.id)?.values);
          for (const thing of sheet.has ?? []) expect(book.has(thing.of), `${sheet.id}: ${thing.of}`).toBe(true);
          actions += availableActions(sheet, world as never).length;
        }
        expect(actions).toBeGreaterThan(0);
      });
    });
  }
});
