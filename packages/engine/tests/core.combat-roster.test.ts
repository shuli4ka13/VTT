import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = flattenSystem({
  id: 'с', name: 'с', tags: {},
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ sides: 20 }] } },
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'ловк', label: 'Ловкость', kind: 'number', default: 0 }, { key: 'кончился', label: 'Кончился', kind: 'number', default: 0 }, { key: 'вышел', label: 'Вышел', kind: 'number', default: 0 }, { key: 'концы', label: 'Концы ходов', kind: 'number', default: 0 }] } },
  initiative: { die: 'к20', bonus: { expr: '@ловк' } },
  effects: {
    стойка: { label: 'Стойка', activation: 'passive', duration: { kind: 'combat' } },
    шок: { label: 'Шок', activation: 'passive', duration: { kind: 'rounds', max: 3 } },
    счёт: { label: 'Счёт', activation: 'passive', on: [
      { on: 'moment:turn-end', if: { expr: '@ходит == @носитель' }, steps: [{ type: 'apply', target: { expr: '@носитель.концы' }, direction: 'add', value: { expr: '1' } }] },
      { on: 'moment:combat-end', steps: [{ type: 'apply', target: { expr: '@носитель.кончился' }, direction: 'add', value: { expr: '1' } }] },
      { on: 'moment:combat-leave', steps: [{ type: 'apply', target: { expr: '@носитель.вышел' }, direction: 'add', value: { expr: '1' } }] },
    ] },
  },
} as unknown as System);
const book = { records: [] } as unknown as Compendium;
const sheet = (id: string, name: string, ловк: number): Sheet =>
  ({ id, systemId: 'с', name, values: { ловк }, has: [], effects: [] }) as unknown as Sheet;
const a = sheet('а', 'Арен', 3);
const b = sheet('б', 'Бора', 1);
const c = sheet('в', 'Вера', 2);

const run = (sheets: Sheet[], clock: unknown, op: unknown, die = () => 10) => {
  const out = perform({ system, compendium: book, clock: clock as never, sheets, die }, op as never);
  if (out.kind !== 'done') throw new Error(out.kind);
  return out;
};
const idle = { round: 0, order: [], active: null };

describe('бой по выбранным участникам', () => {
  it('бросают только выбранные, по их порядку; итоги хранятся в часах', () => {
    const faces: number[] = [];
    const out = run([a, b, c], idle, { op: 'turn', turn: 'start', who: ['в', 'а'] }, () => { faces.push(faces.length); return 10; });
    expect(out.clock).toMatchObject({ round: 1, order: ['а', 'в'], active: 'а', scores: { а: 13, в: 12 } });
    expect(out.log.join('\n')).toContain('Инициатива: Арен 13, Вера 12');
  });

  it('стол и группу в бой не берут; бросок и порядок руками вместе — отказ', () => {
    const desk = { ...sheet('стол', 'Стол', 0) } as Sheet;
    expect(() => run([a, desk], idle, { op: 'turn', turn: 'start', who: ['стол'] })).toThrow('стол в бою не участвует');
    expect(() => run([a, b], idle, { op: 'turn', turn: 'start', who: ['а'], order: ['б'] })).toThrow('не оба');
  });

  it('без выбора бросают все, как раньше', () => {
    const out = run([a, b], idle, { op: 'turn', turn: 'start' });
    expect(out.clock).toMatchObject({ order: ['а', 'б'], scores: { а: 13, б: 11 } });
  });
});

describe('вступить в бой и выйти из боя', () => {
  const fight = () => run([a, b, c], idle, { op: 'turn', turn: 'start', who: ['а', 'б'] });

  it('вступающий бросает и встаёт по инициативе, ход не меняется; уже в бою — отказ', () => {
    const start = fight();
    const joined = run(start.sheets, start.clock, { op: 'turn', turn: 'join', who: ['в'] });
    expect(joined.clock).toMatchObject({ active: 'а', order: ['а', 'в', 'б'], scores: { а: 13, б: 11, в: 12 } });
    expect(joined.log.join('\n')).toContain('Вера вступает в бой: инициатива 12');
    expect(() => run(joined.sheets, joined.clock, { op: 'turn', turn: 'join', who: ['в'] })).toThrow('уже в бою');
  });

  it('при равной инициативе вступающий встаёт после равных; порядок руками — в конец', () => {
    const start = fight();
    const tie = run(start.sheets, start.clock, { op: 'turn', turn: 'join', who: ['в'] }, () => 11);
    expect(tie.clock!.order).toEqual(['а', 'в', 'б']);
    const manual = run([a, b, c], idle, { op: 'turn', turn: 'start', order: ['б', 'а'] });
    const late = run(manual.sheets, manual.clock, { op: 'turn', turn: 'join', who: ['в'] });
    expect(late.clock!.order).toEqual(['б', 'а', 'в']);
  });

  it('уходит тот, чей ход: ход следующему, через край — новый раунд и +3 с; для ушедшего бой кончился — боевые сроки сняты', () => {
    const start = run([a, b], { ...idle, sec: 30 }, { op: 'turn', turn: 'start', who: ['б', 'а'] });
    const second = run(start.sheets, start.clock, { op: 'turn', turn: 'next' });
    const worn = run(second.sheets, second.clock, { op: 'belonging', sheetId: 'б', list: 'effects', id: 'стойка', on: true });
    const shocked = run(worn.sheets, worn.clock, { op: 'belonging', sheetId: 'б', list: 'effects', id: 'шок', on: true });
    expect(shocked.clock).toMatchObject({ active: 'б', round: 1 });
    const left = run(shocked.sheets, shocked.clock, { op: 'turn', turn: 'leave', who: ['б'] });
    expect(left.clock).toMatchObject({ order: ['а'], active: 'а', round: 2, sec: 33, scores: { а: 13 } });
    const bora = left.sheets.find(one => one.id === 'б')!;
    expect(bora.effects).toEqual([]);
    expect(left.log.join('\n')).toContain('Бора выходит из боя');
  });

  it('выход из боя — свой момент «когда вышел из боя», а не «когда бой кончился»', () => {
    const start = run([a, b], idle, { op: 'turn', turn: 'start', who: ['а', 'б'] });
    const worn = run(start.sheets, start.clock, { op: 'belonging', sheetId: 'б', list: 'effects', id: 'счёт', on: true });
    const left = run(worn.sheets, worn.clock, { op: 'turn', turn: 'leave', who: ['б'] });
    const bora = left.sheets.find(one => one.id === 'б')!;
    expect(bora.values).toMatchObject({ вышел: 1 });
    expect(bora.values.кончился ?? 0).toBe(0);
  });

  it('уходят ходящий и следующий за ним: конец хода — только у того, кто ходил', () => {
    const d = sheet('г', 'Гай', 0);
    const start = run([a, b, c, d], idle, { op: 'turn', turn: 'start', order: ['а', 'б', 'в', 'г'] });
    const worn = run(start.sheets, start.clock, { op: 'belonging', sheetId: 'в', list: 'effects', id: 'счёт', on: true });
    const second = run(worn.sheets, worn.clock, { op: 'turn', turn: 'next' });
    const left = run(second.sheets, second.clock, { op: 'turn', turn: 'leave', who: ['б', 'в'] });
    expect(left.clock).toMatchObject({ active: 'г', order: ['а', 'г'] });
    expect(left.sheets.find(one => one.id === 'в')!.values.концы ?? 0).toBe(0);
  });

  it('двое вступающих с равной инициативой встают по правилу ничьей, а не по порядку галочек', () => {
    const tied = flattenSystem({ ...system, initiative: { die: 'к20', bonus: { expr: '@ловк' }, ties: ['ловк'] } } as unknown as System);
    const x = sheet('х', 'Хан', 1);
    const y = sheet('у', 'Ума', 1);
    const go = (sheets: Sheet[], clock: unknown, op: unknown, die: () => number) => {
      const out = perform({ system: tied, compendium: book, clock: clock as never, sheets, die }, op as never);
      if (out.kind !== 'done') throw new Error(out.kind);
      return out;
    };
    const start = go([a, x, y], idle, { op: 'turn', turn: 'start', who: ['а'] }, () => 10);
    let toss = 0;
    const joined = go(start.sheets, start.clock, { op: 'turn', turn: 'join', who: ['х', 'у'] }, () => (toss++ < 2 ? 10 : toss === 3 ? 1 : 6));
    expect(joined.clock!.order).toEqual(['а', 'у', 'х']);
  });

  it('уходят все — бой окончен; не в бою — отказ', () => {
    const start = fight();
    expect(() => run(start.sheets, start.clock, { op: 'turn', turn: 'leave', who: ['в'] })).toThrow('не в бою');
    const all = run(start.sheets, start.clock, { op: 'turn', turn: 'leave', who: ['а', 'б'] });
    expect(all.clock).toMatchObject({ round: 0, order: [], active: null });
    expect(all.clock!.scores).toBeUndefined();
    expect(all.log.join('\n')).toContain('Бой окончен');
  });
});
