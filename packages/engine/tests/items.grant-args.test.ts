import { describe, it, expect, beforeEach } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem } from '../src/model/lint.ts';
import { world } from '@vtt/schema';
const systemSchema = world.system;
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const lose = (extra: Record<string, unknown> = {}) => ({
  label: 'Потеря человечности', activation: 'passive',
  params: [
    { key: 'die', label: 'Кость', kind: 'dice', optional: true },
    { key: 'x', label: 'Куда записать', kind: 'field', optional: true },
  ],
  attach: [
    { type: 'branch', if: { expr: 'empty(@x) and not(empty(@die))' } },
    { type: 'roll', id: 'r', die: { expr: '@die' } },
    { type: 'apply', target: { expr: '@x' }, direction: 'set', value: { expr: '@r.total' } },
    { type: 'apply', target: { expr: '@holder.hum' }, direction: 'subtract', value: { expr: '@r.total' } },
    { type: 'end' },
  ],
  ...extra,
});

const raw = (effect = lose()) => ({
  id: 'с', name: 'с',
  tables: {
    list: { shape: 'single', owner: 'sheet', columns: [{ key: 'hum', label: 'Человечность', kind: 'number', default: 60 }] },
    imp: { shape: 'book', use: 'item', label: 'Импланты', columns: [
      { key: 'loss', label: 'Потеря', kind: 'dice' },
      { key: 'x', label: 'X', kind: 'number' },
    ], grants: [{ effect: 'lose', args: { die: { expr: '@item.loss' }, x: { expr: '@item.x' } } }] },
  },
  effects: { lose: effect },
});
const system = flattenSystem(raw() as unknown as System);
const book = { records: [
  { id: 'sandy', table: 'imp', label: 'Сенди', cells: { loss: '2d6' } },
  { id: 'chip', table: 'imp', label: 'Щепка', cells: { loss: '1d6' } },
  { id: 'none', table: 'imp', label: 'Без потери', cells: {} },
] } as unknown as Compendium;
const hero = (has: Sheet['has'] = []): Sheet => ({ id: 'г', systemId: 'с', name: 'Г', values: {}, has, effects: [] } as unknown as Sheet);

let n = 0;
const op = (sheets: Sheet[], o: Record<string, unknown>, faces: number[] = [4, 3, 6, 2, 5, 1]) => {
  let at = 0;
  const out = perform({ system, compendium: book, clock: null, sheets, die: () => faces[at++ % faces.length]!, newId: () => `в${++n}`, table: { payment: 'strict' } }, o as never);
  if (out.kind !== 'done') throw new Error(JSON.stringify(out).slice(0, 300));
  return out;
};
const add = (sheets: Sheet[], id: string, faces?: number[]) => op(sheets, { op: 'belonging', sheetId: 'г', list: 'has', id, on: true, add: true }, faces);
const wear = (sheets: Sheet[], id: string, inst: string, off: boolean) => op(sheets, { op: 'belonging', sheetId: 'г', list: 'has', id, on: true, off, inst });

describe('выдача вещью с аргументами: эффект на каждую вещь, вход — клетка этой вещи', () => {
  beforeEach(() => { n = 0; });
  it('схема принимает эффект с аргументами у типа и записи', () => {
    expect(systemSchema.safeParse(raw()).success).toBe(true);
  });

  it('надел — бросок его кости, выпавшее в его «X», человечность ниже', () => {
    const out = add([hero()], 'sandy');
    const sheet = out.sheets[0]!;
    expect(sheet.has).toEqual([{ of: 'sandy', id: 'в1', values: { x: 7 } }]);
    expect(sheet.values['hum']).toBe(53);
    expect(out.log.join('\n')).toContain('Сенди · X: — → 7');
    expect(out.log.join('\n')).not.toContain('item:');
  });

  it('два импланта — у каждого свой бросок и своя клетка', () => {
    const one = add([hero()], 'sandy', [4, 3]);
    const two = add(one.sheets, 'chip', [5]);
    const sheet = two.sheets[0]!;
    expect(sheet.has!.map(h => h.values)).toEqual([{ x: 7 }, { x: 5 }]);
    expect(sheet.values['hum']).toBe(48);
  });

  it('снял и надел снова — без нового броска', () => {
    const one = add([hero()], 'sandy');
    const off = wear(one.sheets, 'sandy', 'в1', true);
    const on = wear(off.sheets, 'sandy', 'в1', false);
    expect(on.sheets[0]!.values['hum']).toBe(53);
    expect(on.sheets[0]!.has![0]!.values).toEqual({ x: 7 });
  });

  it('имплант без потери — ничего не бросается и не падает', () => {
    const out = add([hero()], 'none');
    expect(out.sheets[0]!.values['hum'] ?? 60).toBe(60);
  });

  it('эффект, повешенный руками, не съедает наложение от вещи', () => {
    const start = hero();
    start.effects = [{ effectId: 'lose' }];
    const out = add([start], 'sandy');
    expect(out.sheets[0]!.has![0]!.values).toEqual({ x: 7 });
  });

  it('убрать надетый имплант — операция проходит', () => {
    const one = add([hero()], 'sandy');
    const out = op(one.sheets, { op: 'belonging', sheetId: 'г', list: 'has', id: 'sandy', on: false, inst: 'в1' });
    expect(out.sheets[0]!.has).toEqual([]);
    expect(out.sheets[0]!.values['hum']).toBe(53);
  });

  it('система с такой выдачей без замечаний', () => {
    expect(lintSystem(system, book).filter(p => p.level === 'error')).toEqual([]);
  });

  it('«Проблемы»: чужой вход, вопрос игроку, свои правки', () => {
    const bad = flattenSystem({ ...raw(lose({
      params: [{ key: 'die', label: 'Кость', kind: 'text', ask: {} }, { key: 'x', label: 'Куда записать', kind: 'field', optional: true }],
      modifiers: [{ kind: 'value', target: 'hum', op: 'add', value: { expr: '-1' } }],
    })) } as unknown as System);
    (bad.tables!['imp'] as { grants: unknown[] }).grants = [{ effect: 'lose', args: { die: { expr: '@item.loss' }, zzz: { expr: '1' } } }];
    const texts = lintSystem(bad, book).map(p => `${p.level}: ${p.text}`);
    expect(texts).toEqual(expect.arrayContaining([
      'error: «Потеря человечности»: входа «zzz» у эффекта нет',
      'error: «Потеря человечности»: вход «Кость» спрашивает игрока — у выданного вещью спросить некого',
      'warn: у «Потеря человечности» свои правки полей — со входами он висит на каждой вещи, и правки сложатся столько раз, сколько вещей',
    ]));
  });

  it('убрать имплант, у эффекта которого есть «при спадании», — операция проходит, шаги не идут', () => {
    const withDetach = flattenSystem(raw(lose({ detach: [{ type: 'apply', target: { expr: '@x' }, direction: 'set', value: { expr: '0' } }] })) as unknown as System);
    let k = 0;
    const run = (sheets: Sheet[], o: Record<string, unknown>) => {
      const out = perform({ system: withDetach, compendium: book, clock: null, sheets, die: () => 3, newId: () => `д${++k}`, table: { payment: 'strict' } }, o as never);
      if (out.kind !== 'done') throw new Error(JSON.stringify(out).slice(0, 300));
      return out;
    };
    const one = run([hero()], { op: 'belonging', sheetId: 'г', list: 'has', id: 'sandy', on: true, add: true });
    const off = run(one.sheets, { op: 'belonging', sheetId: 'г', list: 'has', id: 'sandy', on: true, off: true, inst: 'д1' });
    expect(off.sheets[0]!.has![0]!.values).toEqual({ x: 0 });
    const gone = run(one.sheets, { op: 'belonging', sheetId: 'г', list: 'has', id: 'sandy', on: false, inst: 'д1' });
    expect(gone.sheets[0]!.has).toEqual([]);
  });

  it('«Проблемы»: вход в условии подписки, кнопка, имя у типа и объект у записи', () => {
    const bad = flattenSystem(raw(lose({ on: [{ on: 'moment:turn_end', if: { expr: 'not(empty(@die))' }, manual: true, steps: [] }] })) as unknown as System);
    const twice = { records: [{ id: 'z', table: 'imp', label: 'З', cells: {}, grants: ['lose'] }] } as unknown as Compendium;
    const texts = lintSystem(bad, twice).map(p => p.text);
    expect(texts).toEqual(expect.arrayContaining([
      '«Потеря человечности»: вход «Кость» читается в условии или правке — у выданного вещью входы видят только шаги',
      '«Потеря человечности»: кнопка у выданного вещью со входами — одна на все вещи; сделайте кнопкой типа',
      '«Потеря человечности» выдан дважды: просто и со входами — оставьте один',
    ]));
  });
});
