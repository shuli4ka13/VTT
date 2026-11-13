import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { availableActions } from '../src/events/actions.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };

const raw = {
  id: 'с', name: 'с',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'сущность', label: 'Сущность', expr: { expr: '6 - сумма(строки("имплант", "essence"))' } },
      { key: 'защита', label: 'Защита', kind: 'number', default: 0 },
      { key: 'сила', label: 'Сила', kind: 'number', default: 3 },
    ] },
    сорта: { label: 'Сорта', key: 'word', columns: [{ key: 'ess', label: 'Множитель Сущности', kind: 'number' }], rows: [
      { value: 'стандарт', cells: { ess: 1 } },
      { value: 'альфа', cells: { ess: 0.8 } },
    ] },
    снаряжение: { shape: 'book', use: 'item', label: 'Снаряжение', columns: [
      { key: 'cost', label: 'Цена', kind: 'number' },
      { key: 'rating', label: 'Рейтинг', kind: 'number' },
    ] },
    имплант: { shape: 'book', use: 'item', label: 'Имплант', extends: 'снаряжение', columns: [
      { key: 'essence', label: 'Сущность', kind: 'number' },
      { key: 'grade', label: 'Сорт', kind: 'choice', from: 'сорта' },
      { key: 'per', label: 'Сущность за рейтинг', kind: 'number' },
    ] },
    кожа: { shape: 'book', use: 'item', label: 'Кожа', extends: 'имплант', columns: [],
      modifiers: [{ kind: 'value', target: 'защита', op: 'add', value: { expr: '@строка.rating' } }] },
    оружие: { shape: 'book', use: 'item', label: 'Оружие', extends: 'снаряжение',
      columns: [{ key: 'ar', label: 'ЗА', kind: 'number' }, { key: 'ammo_max', label: 'Боезапас', kind: 'number' }, { key: 'ammo', label: 'Патроны', kind: 'number', expr: { expr: '@ammo_max' } }],
      bindings: [{ label: 'Выстрел', effect: 'выстрел' }] },
    мод: { shape: 'book', use: 'item', label: 'Модификация', extends: 'снаряжение', columns: [{ key: 'ar_mod', label: 'К ЗА', kind: 'number' }] },
  },
  effects: {
    выстрел: { label: 'Выстрел', activation: 'manual', params: [ACTOR], steps: [
      { type: 'check', id: 'есть', value: { expr: '@вещь.ammo' }, versus: { expr: '1' }, successWhen: 'atLeast' },
      { type: 'apply', target: { expr: '@вещь.ammo' }, direction: 'subtract', value: { expr: '1' } },
      { type: 'apply', target: { expr: '@действующий.защита' }, direction: 'set', value: { expr: '@вещь.ar + сумма(строки("мод", "ar_mod", @вещь))' } },
    ] },
  },
} as unknown as System;

const system = flattenSystem(raw);

const book = { records: [
  { id: 'мышцы', table: 'имплант', label: 'Замена мускулов', cells: { per: 0.7, grade: 'стандарт', rating: 1, essence: { expr: '@rating * @per * @grade.ess' } } },
  { id: 'пластины', table: 'кожа', label: 'Кожные пластины', cells: { per: 0.3, grade: 'стандарт', rating: 1, essence: { expr: '@rating * @per * @grade.ess' } } },
  { id: 'предатор', table: 'оружие', label: 'Предатор', cells: { ar: 10, ammo: 15, cost: 750 } },
  { id: 'кольт', table: 'оружие', label: 'Кольт', cells: { ar: 8, ammo_max: 11 } },
  { id: 'лазер', table: 'мод', label: 'Лазерный прицел', cells: { ar_mod: 1, cost: 125 } },
] } as unknown as Compendium;

const hero = (has: Sheet['has']): Sheet => ({ id: 'г', systemId: 'с', name: 'Герой', values: {}, has, effects: [] } as unknown as Sheet);
const at = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium: book }));
const ids = () => { let n = 0; return () => `в${++n}`; };
const op = (sheets: Sheet[], o: Record<string, unknown>) =>
  perform({ system, compendium: book, clock: null, sheets, die: () => 1, newId: ids() }, o as never);

describe('Д0: клетка-формула вещи считается в контексте экземпляра', () => {
  it('Сущность = 6 − сумма по имплантам: рейтинг и сорт — у экземпляра, ссылка по выбору — через справочник', () => {
    const sheet = hero([{ of: 'мышцы', values: { rating: 3 } }, { of: 'пластины', values: { rating: 2, grade: 'альфа' } }]);
    expect(at(sheet, 'сущность')).toBeCloseTo(6 - 3 * 0.7 - 2 * 0.3 * 0.8, 6);
  });

  it('правка типа с @строка видит рейтинг экземпляра', () => {
    expect(at(hero([{ of: 'пластины', values: { rating: 4 } }]), 'защита')).toBe(4);
  });

  it('круг клеток — внятная ошибка', () => {
    const loop = { records: [{ id: 'п', table: 'кожа', label: 'П', cells: { rating: { expr: '@per' }, per: { expr: '@rating' } } }] } as unknown as Compendium;
    const sheet = hero([{ of: 'п' }]);
    expect(() => calc(system, sheet, 'защита', newPass(system, sheet, { compendium: loop }))).toThrow(/по кругу/);
  });
});

describe('Д5: «строки» по типу видят наследников', () => {
  it('кожа — наследник импланта: её Сущность входит в сумму по импланту', () => {
    expect(at(hero([{ of: 'пластины', values: { rating: 5 } }]), 'сущность')).toBeCloseTo(6 - 1.5, 6);
  });
});

describe('Д3: несколько экземпляров одной вещи', () => {
  it('«добавить» кладёт новый экземпляр со своим id, у каждого своя кнопка', () => {
    const one = op([hero([{ of: 'предатор' }])], { op: 'belonging', sheetId: 'г', list: 'has', id: 'предатор', on: true, add: true });
    if (one.kind !== 'done') throw new Error(one.kind);
    const sheet = one.sheets[0]!;
    expect(sheet.has.map(entry => entry.id ?? entry.of)).toEqual(['предатор', 'в1']);
    expect(availableActions(sheet, { system, compendium: book }).map(a => a.id)).toEqual(['предатор:0', 'предатор@в1:0']);
  });

  it('без «добавить» прежнее поведение: правится первая вещь, вторая не появляется', () => {
    const out = op([hero([{ of: 'предатор' }])], { op: 'belonging', sheetId: 'г', list: 'has', id: 'предатор', on: true, off: true });
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.has).toEqual([{ of: 'предатор', off: true }]);
  });

  it('убрать хозяина — уходит и то, что в нём стоит', () => {
    const sheet = hero([{ of: 'предатор', id: 'п1' }, { of: 'лазер', in: 'п1' }, { of: 'предатор', id: 'п2' }]);
    const out = op([sheet], { op: 'belonging', sheetId: 'г', list: 'has', id: 'предатор', on: false, inst: 'п1' });
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.has).toEqual([{ of: 'предатор', id: 'п2' }]);
  });
});

describe('Д2: вещь в вещи — только чтение', () => {
  it('«строки» с хозяином берут моды этого ствола, а не соседнего', () => {
    const sheet = hero([{ of: 'предатор', id: 'п1' }, { of: 'предатор', id: 'п2' }, { of: 'лазер', in: 'п1' }]);
    const shot = (inst: string) => op([sheet], { op: 'act', intent: { actionId: `предатор@${inst}:0`, fromId: 'г', toIds: [] } });
    const first = shot('п1');
    const second = shot('п2');
    if (first.kind !== 'done' || second.kind !== 'done') throw new Error('не сыграно');
    expect(first.sheets[0]!.values['защита']).toBe(11);
    expect(second.sheets[0]!.values['защита']).toBe(10);
  });

  it('снятый хозяин выключает всё, что в нём стоит', () => {
    const sheet = hero([{ of: 'пластины', id: 'к', off: true, values: { rating: 3 } }, { of: 'пластины', id: 'к2', in: 'к', values: { rating: 2 } }]);
    expect(at(sheet, 'защита')).toBe(0);
  });
});

describe('Д1: шаг «Изменение» пишет в свою вещь', () => {
  it('выстрел тратит патрон своего ствола', () => {
    const sheet = hero([{ of: 'предатор', id: 'п1' }, { of: 'предатор', id: 'п2', values: { ammo: 3 } }]);
    const out = op([sheet], { op: 'act', intent: { actionId: 'предатор@п2:0', fromId: 'г', toIds: [] } });
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.has).toEqual([{ of: 'предатор', id: 'п1' }, { of: 'предатор', id: 'п2', values: { ammo: 2 } }]);
  });

  it('патроны по умолчанию — формула колонки (= боезапас): выстрел пишет 10', () => {
    const out = op([hero([{ of: 'кольт' }])], { op: 'act', intent: { actionId: 'кольт:0', fromId: 'г', toIds: [] } });
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.has).toEqual([{ of: 'кольт', values: { ammo: 10 } }]);
  });

  it('проверка мира не ругается на @вещь в эффекте кнопки вещи', () => {
    expect(errorsOf(lintSystem(system, book)).map(p => p.text)).toEqual([]);
  });
});

describe('по ревью: экземпляры, круги, @вещь в клетке, живое чтение', () => {
  it('убрать без указания экземпляра, когда их несколько, — отказ, а не «всё сразу»', () => {
    const sheet = hero([{ of: 'предатор' }, { of: 'предатор', id: 'п2' }, { of: 'лазер', in: 'п2' }]);
    expect(() => op([sheet], { op: 'belonging', sheetId: 'г', list: 'has', id: 'предатор', on: false })).toThrow(/укажите, какой экземпляр/);
  });

  it('поставить хозяина в его же содержимое — отказ', () => {
    const sheet = hero([{ of: 'предатор', id: 'п1' }, { of: 'предатор', id: 'п2', in: 'п1' }]);
    expect(() => op([sheet], { op: 'belonging', sheetId: 'г', list: 'has', id: 'предатор', on: true, inst: 'п1', in: 'п2' })).toThrow(/сама в себя/);
  });

  it('клетка-формула видит @вещь: занятая ёмкость — сумма того, что стоит в этой вещи', () => {
    const roomy = flattenSystem({
      ...raw,
      tables: { ...raw.tables, оружие: { ...raw.tables!['оружие']!, columns: [...raw.tables!['оружие']!.columns!, { key: 'занято', label: 'Занято', kind: 'number', expr: { expr: 'сумма(строки("мод", "cost", @вещь))' } }] } },
      effects: { ...raw.effects, выстрел: { ...raw.effects['выстрел']!, steps: [{ type: 'apply', target: { expr: '@действующий.защита' }, direction: 'set', value: { expr: '@вещь.занято' } }] } },
    } as unknown as System);
    const sheet = hero([{ of: 'предатор', id: 'п1' }, { of: 'лазер', in: 'п1' }, { of: 'лазер', id: 'л2', in: 'п1' }, { of: 'предатор', id: 'п2' }]);
    const shot = (inst: string) => perform({ system: roomy, compendium: book, clock: null, sheets: [sheet], die: () => 1, newId: ids() },
      { op: 'act', intent: { actionId: `предатор@${inst}:0`, fromId: 'г', toIds: [] } } as never);
    const first = shot('п1');
    const second = shot('п2');
    if (first.kind !== 'done' || second.kind !== 'done') throw new Error('не сыграно');
    expect(first.sheets[0]!.values['защита']).toBe(250);
    expect(second.sheets[0]!.values['защита'] ?? 0).toBe(0);
  });

  it('@вещь.x после записи в вещь видит новое значение, а не снимок начала действия', () => {
    const live = flattenSystem({
      ...raw,
      effects: { ...raw.effects, выстрел: { ...raw.effects['выстрел']!, steps: [
        { type: 'apply', target: { expr: '@вещь.ammo' }, direction: 'subtract', value: { expr: '2' } },
        { type: 'apply', target: { expr: '@действующий.защита' }, direction: 'set', value: { expr: '@вещь.ammo' } },
      ] } },
    } as unknown as System);
    const out = perform({ system: live, compendium: book, clock: null, sheets: [hero([{ of: 'кольт' }])], die: () => 1, newId: ids() },
      { op: 'act', intent: { actionId: 'кольт:0', fromId: 'г', toIds: [] } } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.values['защита']).toBe(9);
  });
});
