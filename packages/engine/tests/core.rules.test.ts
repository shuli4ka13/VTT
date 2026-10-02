import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { perform } from '../src/core/perform.ts';
import { CUT_WORDS } from '../src/core/limits.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const hit = (amount: string, tag = 'хп') => ({ type: 'apply', target: { tag }, direction: 'subtract', value: { expr: amount } });

const world = (effects: Record<string, unknown>, extra: Partial<System> = {}): System => ({
  id: 'ядро', name: 'Ядро',
  tables: {
    лист: { shape: 'single', columns: [
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
      { key: 'ки', label: 'Ки', kind: 'number', default: 0 },
      { key: 'уклон', label: 'Уклонение', kind: 'number', default: 0 },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  roll_edits: { помеха: { label: 'помеха', ops: [{ op: 'addDie', count: 1 }, { op: 'keepWorst', n: 1 }] } },
  effects,
  ...extra,
} as unknown as System);

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;

const sheet = (id: string, values: Record<string, number> = {}, effects: Record<string, unknown>[] = []): Sheet =>
  ({ id, systemId: 'ядро', name: id, values: { хп: 20, ...values }, has: [{ of: 'приём' }], effects } as Sheet);

const play = (system: System, sheets: Sheet[], to: string, dice: number[], extra: { edits?: string[]; targetEdits?: string[] } = {}) =>
  act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal: emptyJournal() },
    { actionId: 'приём:0', fromId: 'а', toIds: [to], ...extra });

const value = (out: { sheets: Sheet[] }, id: string, tag: string) => out.sheets.find(s => s.id === id)!.values[tag];

describe('новое ядро: сознательные изменения', () => {
  it('цена автоподписки берётся; нечем платить — подписка не срабатывает', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      стойка: {
        label: 'Стойка', activation: 'passive',
        on: [{ on: 'affected', of: 'удар', cost: [{ type: 'compare', value: { expr: '@ки' }, versus: { expr: '1' }, breakIf: 'less' }, hit('1', 'ки')], steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '5' } }] }],
      },
    });
    const paid = play(system, [sheet('а'), sheet('б', { ки: 1 }, [{ effectId: 'стойка' }])], 'б', []);
    expect(value(paid, 'б', 'ки')).toBe(0);
    expect(value(paid, 'б', 'хп')).toBe(24);
    const broke = play(system, [sheet('а'), sheet('б', { ки: 0 }, [{ effectId: 'стойка' }])], 'б', []);
    expect(value(broke, 'б', 'хп')).toBe(19);
  });

  it('эффект, снятый подпиской раньше в том же моменте, уже не срабатывает', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      лёд: { label: 'Лёд', activation: 'passive', on: [{ on: 'affected', of: 'удар', steps: [{ type: 'status', mode: 'remove', effect: { const: 'огонь' } }] }] },
      огонь: { label: 'Огонь', activation: 'passive', on: [{ on: 'affected', of: 'удар', steps: [hit('5')] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', {}, [{ effectId: 'лёд' }, { effectId: 'огонь' }])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(19);
  });

  it('заряд тратится у одного экземпляра стопки, а не у всех копий', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      щит: { label: 'Щит', activation: 'passive', reapply: 'stack', duration: { kind: 'uses', max: 2 }, on: [{ on: 'affected', of: 'удар', steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '1' } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', {}, [{ effectId: 'щит', usesLeft: 2 }, { effectId: 'щит', usesLeft: 2 }])], 'б', []);
    expect(out.sheets.find(s => s.id === 'б')!.effects).toEqual([{ effectId: 'щит', usesLeft: 1 }, { effectId: 'щит', usesLeft: 1 }]);
    expect(value(out, 'б', 'хп')).toBe(21);
  });

  it('встречный бросок цели получает правки «бросок по мне» нападающего и заявки цели', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [{ id: 'спор', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { roll: { die: { constant: 'к20' } } } }, hit('3')],
      },
      неуловим: { label: 'Неуловим', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', as: 'against', op: 'add', value: { expr: '-@уклон' } }] },
    });
    const plain = play(system, [sheet('а', { уклон: 4 }), sheet('б')], 'б', [10, 12]);
    expect(value(plain, 'б', 'хп'), 'без правок цель перебрасывает: 12 против 10').toBe(20);
    const dodgy = play(system, [sheet('а', { уклон: 4 }, [{ effectId: 'неуловим' }]), sheet('б')], 'б', [10, 12]);
    expect(value(dodgy, 'б', 'хп'), '«по мне» с нападающего: 12 − 4 = 8 против 10').toBe(17);
    const claimed = play(system, [sheet('а', { уклон: 4 }), sheet('б')], 'б', [10, 12, 7], { targetEdits: ['помеха'] });
    expect(value(claimed, 'б', 'хп'), 'заявка цели — у её броска: худшая из 12 и 7').toBe(17);
  });

  it('реакция «увидев кости» не будит бросок, пропущенный по «когда» от раннего шага', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [
          { id: 'сила', type: 'amount', source: 'item', fixed: { expr: '2' } },
          { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '10' }, when: { expr: '@сила > 3' } },
          hit('1'),
        ],
      },
      удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', steps: [hit('1', 'ки'), { type: 'roll-plus', value: { expr: '0' } }] }] },
    });
    const out = play(system, [sheet('а', { ки: 3 }, [{ effectId: 'удача' }]), sheet('б')], 'б', []);
    expect(value(out, 'а', 'ки')).toBe(3);
    expect(value(out, 'б', 'хп')).toBe(19);
  });

  it('копия реакции в стопке: выбрана одна — платит и тратит заряд одна', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      парир: { label: 'Парирование', activation: 'passive', reapply: 'stack', duration: { kind: 'uses', max: 1 }, on: [{ on: 'targeted', of: 'удар', confirm: true, steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '1' } }] }] },
    });
    const sheets = [sheet('а'), sheet('б', {}, [{ effectId: 'парир', usesLeft: 1 }, { effectId: 'парир', usesLeft: 1 }])];
    const first = act({ system, compendium: book, clock: null, sheets, die: queue(), journal: emptyJournal() }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(first.kind).toBe('paused');
    if (first.kind !== 'paused') return;
    expect(first.question.offers.map(o => o.id)).toEqual(['парир']);
    const second = act({ system, compendium: book, clock: null, sheets, die: queue(), journal: { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['парир'] } } }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(second.kind).toBe('done');
    expect(second.sheets.find(s => s.id === 'б')!.effects).toEqual([{ effectId: 'парир', usesLeft: 1 }]);
  });

  it('кинуть() в прибавке порога бросает свою кость, а не делит ключ с ведущей', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ id: 'б', type: 'threshold', roll: { die: { constant: 'к20' }, bonus: { expr: "кинуть('1к4')" } }, versus: { expr: '100' }, continueOn: 'always' }] },
    });
    const out = play(system, [sheet('а'), sheet('б')], 'б', [15, 3]);
    expect(out.kind).toBe('done');
    expect(JSON.stringify(out.entries)).toContain('"total":18');
  });

  it('стопка без id копий: первая сгорела — вторая всё равно срабатывает и сгорает сама', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      щит: { label: 'Щит', activation: 'passive', reapply: 'stack', duration: { kind: 'uses', max: 1 }, on: [{ on: 'affected', of: 'удар', steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '1' } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', {}, [{ effectId: 'щит', usesLeft: 1 }, { effectId: 'щит', usesLeft: 1 }])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(21);
    expect(out.sheets.find(s => s.id === 'б')!.effects).toEqual([]);
  });

  it('«при наложении» двух копий одним действием — у каждой своя кость', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'status', effect: { const: 'яд' } }, { type: 'status', effect: { const: 'яд' } }] },
      яд: { label: 'Яд', activation: 'passive', reapply: 'stack', attach: [hit("кинуть('1к6')")] },
    });
    const out = play(system, [sheet('а'), sheet('б')], 'б', [3, 4]);
    expect(value(out, 'б', 'хп')).toBe(13);
  });

  it('предел во вложенной доставке — отказ обработчика целиком: цена и заряд не тратятся', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      месть: {
        label: 'Месть', activation: 'passive', duration: { kind: 'uses', max: 3 },
        on: [{ on: 'affected', of: 'удар', to: 'other', cost: [hit('1', 'ки')], steps: [hit('2')] }],
      },
    }, { limits: { budget: 0 } } as never);
    const out = play(system, [sheet('а'), sheet('б', { ки: 2 }, [{ effectId: 'месть', usesLeft: 3 }])], 'б', []);
    expect(value(out, 'б', 'ки')).toBe(2);
    expect(out.sheets.find(s => s.id === 'б')!.effects).toEqual([{ effectId: 'месть', usesLeft: 3 }]);
    expect(value(out, 'а', 'хп')).toBe(20);
    expect(out.log).toContain(CUT_WORDS);
  });

  it('подписка на момент с вопросом спрашивает; «другому» без другого не платит и не тратит заряд', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      вдох: { label: 'Второе дыхание', activation: 'passive', on: [{ on: 'moment:turn-start', confirm: true, steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '3' } }] }] },
      шип: { label: 'Шип', activation: 'passive', duration: { kind: 'uses', max: 2 }, on: [{ on: 'moment:turn-start', to: 'other', steps: [hit('1')] }] },
    });
    const sheets = [sheet('а', {}, [{ effectId: 'вдох' }, { effectId: 'шип', usesLeft: 2 }]), sheet('б')];
    const first = perform({ system, compendium: book, clock: null, sheets, die: queue() }, { op: 'turn', turn: 'start', order: ['а', 'б'] });
    expect(first.kind).toBe('paused');
    if (first.kind !== 'paused') return;
    expect(first.question.window).toBe('moment');
    expect(first.clock).toBeNull();
    const second = perform({ system, compendium: book, clock: null, sheets, die: queue(), journal: { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['вдох'] } } }, { op: 'turn', turn: 'start', order: ['а', 'б'] });
    expect(second.kind).toBe('done');
    expect(value(second, 'а', 'хп')).toBe(23);
    expect(second.sheets.find(s => s.id === 'а')!.effects).toContainEqual({ effectId: 'шип', usesLeft: 2 });
  });

  it('{ tag } в значении читается на листе, где идёт шаг (у цели)', () => {
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { tag: 'ки' } }] } });
    const out = play(system, [sheet('а', { ки: 2 }), sheet('б', { ки: 7 })], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(13);
  });
});
