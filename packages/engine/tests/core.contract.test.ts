import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { perform } from '../src/core/perform.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sub = (amount: string, tag = 'хп') => ({ type: 'apply', target: { tag }, direction: 'subtract', value: { expr: amount } });
const add = (amount: string, tag = 'хп') => ({ type: 'apply', target: { tag }, direction: 'add', value: { expr: amount } });

function world(effects: Record<string, unknown>, extra: Record<string, unknown> = {}): System {
  return {
    id: 'контракт', name: 'Контракт',
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [
        { key: 'хп', label: 'Хиты', kind: 'number', default: 20, min: 0, max: 30 },
        { key: 'ки', label: 'Ки', kind: 'number', default: 0 },
        { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 0, roll: { die: { constant: 'к20' } } },
      ] },
      казна: { shape: 'single', owner: 'group', columns: [{ key: 'золото', label: 'Золото', kind: 'number', default: 0 }] },
      приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    },
    effects,
    ...extra,
  } as unknown as System;
}

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;

const sheet = (id: string, values: Record<string, number> = {}, effects: string[] = [], extra: Partial<Sheet> = {}): Sheet =>
  ({ id, systemId: 'контракт', name: id, values: { хп: 20, ...values }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })), ...extra } as Sheet);

const value = (out: { sheets: Sheet[] }, id: string, tag: string) => out.sheets.find(s => s.id === id)!.values[tag];

const strike = (system: System, sheets: Sheet[], to: string, dice: number[], extra: Record<string, unknown> = {}) =>
  perform({ system, compendium: book, clock: null, sheets, die: queue(...dice), ...extra }, { op: 'act', intent: { actionId: 'приём:0', fromId: 'а', toIds: [to] } });

describe('режимы операции', () => {
  const system = world({
    удар: { label: 'Удар', activation: 'manual', steps: [sub("кинуть('1к6')")] },
    щит: { label: 'Щит', activation: 'passive', on: [{ on: 'targeted', of: 'удар', confirm: true, steps: [] }] },
  });
  const sheets = [sheet('а'), sheet('б', {}, ['щит'])];

  it('проба: выбранная кость, на вопросы «нет» без паузы', () => {
    const out = strike(system, sheets, 'б', [6], { mode: 'trial' });
    expect(out.kind).toBe('done');
    expect(value(out, 'б', 'хп')).toBe(14);
  });

  it('предпросмотр: новые кости — середина и в журнал не пишутся, известные — из журнала', () => {
    const fresh = strike(system, sheets, 'б', [], { mode: 'preview' });
    expect(value(fresh, 'б', 'хп')).toBe(16);
    expect(fresh.journal.dice).toEqual({});
    const real = strike(system, sheets, 'б', [2]);
    expect(real.kind).toBe('paused');
    const known = strike(system, sheets, 'б', [], { mode: 'preview', journal: real.journal });
    expect(value(known, 'б', 'хп'), 'кость 2 уже в журнале — её и берёт').toBe(18);
  });
});

describe('проба внутри прогона', () => {
  it('не ставит паузу: вопрос «увидев кости» в теле не опережает окно цели', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ id: 'б', type: 'threshold', side: 'target', roll: { die: { constant: 'к20' } }, versus: { expr: '10' }, continueOn: 'always' }] },
      щит: { label: 'Щит', activation: 'passive', on: [{ on: 'targeted', of: 'удар', confirm: true, steps: [] }] },
      удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', confirm: true, steps: [{ type: 'roll-plus', value: { expr: '1' } }] }] },
    });
    const sheets = [sheet('а'), sheet('б', {}, ['щит', 'удача'])];
    const first = act({ system, compendium: book, clock: null, sheets, die: queue(7, 7), journal: emptyJournal() }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(first.kind).toBe('paused');
    if (first.kind !== 'paused') return;
    expect(first.question.window).toBe('target');
    const second = act({ system, compendium: book, clock: null, sheets, die: queue(), journal: { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: [] } } }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(second.kind).toBe('paused');
    if (second.kind !== 'paused') return;
    expect(second.question.window).toBe('seen');
  });
});

describe('пределы', () => {
  it('вызовы по кругу в теле — ошибка словами, мир не меняется', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'emit', event: 'пинг' }] },
      пинг: { label: 'Пинг', params: [], steps: [{ type: 'emit', event: 'понг' }] },
      понг: { label: 'Понг', params: [], steps: [{ type: 'emit', event: 'пинг' }] },
    });
    expect(() => strike(system, [sheet('а'), sheet('б')], 'б', [])).toThrow(/вложены глубже/);
  });

  it('старт боя на двенадцати листах с подпиской каждого не упирается в бюджет', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [] },
      бодрость: { label: 'Бодрость', activation: 'passive', on: [{ on: 'moment:combat-start', steps: [add('1', 'ки')] }, { on: 'moment:round-start', steps: [add('1', 'ки')] }] },
    });
    const many = Array.from({ length: 12 }, (_, i) => sheet(`л${i}`, {}, ['бодрость']));
    const out = perform({ system, compendium: book, clock: null, sheets: many, die: queue() }, { op: 'turn', turn: 'start', order: many.map(s => s.id) });
    expect(out.kind).toBe('done');
    expect(many.every(s => value(out as never, s.id, 'ки') === 2)).toBe(true);
  });
});

describe('имена в формулах', () => {
  it('в вызванном эффекте голое имя — лист вызова, @отправитель — действующий; в обработчике — держатель', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'emit', event: 'урон' }] },
      урон: { label: 'Урон', params: [], steps: [sub('@ки'), sub('@отправитель.ки')] },
      память: { label: 'Память', activation: 'passive', on: [{ on: 'affected', of: 'event:урон', steps: [add('@ки')] }] },
    });
    const out = strike(system, [sheet('а', { ки: 2 }), sheet('б', { ки: 5 }, ['память'])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(20 - 5 - 2 + 5);
  });

  it('@получатель в шагах до цели — ошибка словами', () => {
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'compare', value: { expr: '@получатель.хп' }, versus: { expr: '0' } }, { type: 'each' }] } });
    expect(() => strike(system, [sheet('а'), sheet('б')], 'б', [])).toThrow(/получателя/);
  });
});

describe('бросок вне действия', () => {
  it('реакция «увидев кости» срабатывает на инициативе', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [] },
      шустрый: { label: 'Шустрый', activation: 'passive', on: [{ on: 'seen', steps: [{ type: 'roll-plus', value: { expr: '10' } }] }] },
    }, { initiative: { die: { constant: 'к20' } } });
    const out = perform({ system, compendium: book, clock: null, sheets: [sheet('а'), sheet('б', {}, ['шустрый'])], die: queue(15, 8) }, { op: 'turn', turn: 'start' });
    expect(out.kind).toBe('done');
    expect(out.clock?.order).toEqual(['б', 'а']);
  });
});

describe('операции над листом', () => {
  it('поле группы, вписанное с листа участника, ложится держателю', () => {
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps: [] } });
    const sheets = [sheet('а', {}, [], { group: 'банда' } as never), sheet('банда')];
    const out = perform({ system, compendium: book, clock: null, sheets, die: queue() }, { op: 'set', sheetId: 'а', tag: 'золото', value: 7 });
    expect(value(out, 'банда', 'золото')).toBe(7);
    expect(value(out, 'а', 'золото')).toBeUndefined();
  });

  it('группа: сам себе, вложенно и стол — отказ словами', () => {
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps: [] } });
    const sheets = [sheet('а'), sheet('б', {}, [], { group: 'а' } as never), sheet('стол')];
    const go = (sheetId: string, group: string) => () => perform({ system, compendium: book, clock: null, sheets, die: queue() }, { op: 'group', sheetId, group });
    expect(go('а', 'а')).toThrow(/самому себе/);
    expect(go('а', 'стол')).toThrow(/стол/);
    expect(go('а', 'б')).toThrow(/группа для других|не вкладываются|сам состоит/);
  });

  it('действие с записью, которой нет на листе, отклоняется', () => {
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps: [sub('1')] } });
    const sheets = [{ ...sheet('а'), has: [] } as Sheet, sheet('б')];
    expect(() => strike(system, sheets, 'б', [])).toThrow(/нет действия/);
  });
});

describe('формы эффекта', () => {
  it('обрыв до «Для каждой цели» отклоняет всё действие: цена не списана, цели не тронуты', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual',
        cost: [sub('1', 'ки')],
        steps: [{ type: 'compare', value: { expr: '@хп' }, versus: { expr: '100' }, breakIf: 'less' }, { type: 'each' }, sub('5')],
      },
    });
    expect(() => strike(system, [sheet('а', { ки: 3 }), sheet('б')], 'б', [])).toThrow(/не состоялось/);
  });

  it('обрыв в теле на цели — мягкий конец: сделанное остаётся, «на меня подействовали» срабатывает', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [sub('2'), { type: 'compare', value: { expr: '0' }, versus: { expr: '1' }, breakIf: 'less' }, sub('10')] },
      отметка: { label: 'Отметка', activation: 'passive', on: [{ on: 'affected', of: 'удар', steps: [add('1', 'ки')] }] },
    });
    const out = strike(system, [sheet('а'), sheet('б', {}, ['отметка'])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(18);
    expect(value(out, 'б', 'ки')).toBe(1);
  });
});
