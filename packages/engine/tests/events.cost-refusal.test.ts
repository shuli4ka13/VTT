import { describe, it, expect } from 'vitest';
import { costRefusal } from '../src/events/trial.ts';
import { perform } from '../src/core/perform.ts';
import { ActRefused } from '../src/engine/errors.ts';
import { system as dnd, compendium as dndBook, arven, mirra } from './fixtures.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const HIT = { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '3' } };

const system = {
  id: 'плата', name: 'Плата',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
      { key: 'действие', label: 'Действие', kind: 'number', default: 1, min: 0 },
      { key: 'ячейки_1', label: 'Ячейки 1-го круга', kind: 'number', default: 1, min: 0 },
      { key: 'ячейки_2', label: 'Ячейки 2-го круга', kind: 'number', min: 0 },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    чары: { shape: 'book', use: 'action', label: 'Чары', columns: [], bindings: [{ label: 'Сотворить', effect: 'стрела', args: {} }] },
    жест: { shape: 'book', use: 'action', label: 'Жест', columns: [], bindings: [{ label: 'Махнуть', effect: 'жест', args: {} }] },
  },
  effects: {
    ячейка: {
      label: 'Ячейка заклинания',
      params: [{ key: 'лист', label: 'Чья ячейка', kind: 'sheet' }, { key: 'круг', label: 'Круг', kind: 'number', role: 'amount' }],
      steps: [
        { type: 'branch', if: { expr: '@круг == 1' } },
        { id: 'есть_1', type: 'check', value: { expr: '@лист.ячейки_1' }, versus: { expr: '1' } },
        { type: 'branch', if: { expr: 'not @есть_1.success' } }, { type: 'stop', note: { expr: '"не хватает ячейки 1-го круга"' } }, { type: 'end' },
        { type: 'apply', target: { expr: '@лист.ячейки_1' }, direction: 'subtract', value: { expr: '1' } },
        { type: 'end' },
        { type: 'branch', if: { expr: '@круг == 2' } },
        { id: 'есть_2', type: 'check', value: { expr: '@лист.ячейки_2' }, versus: { expr: '1' } },
        { type: 'branch', if: { expr: 'not @есть_2.success' } }, { type: 'stop', note: { expr: '"не хватает ячейки 2-го круга"' } }, { type: 'end' },
        { type: 'apply', target: { expr: '@лист.ячейки_2' }, direction: 'subtract', value: { expr: '1' } },
        { type: 'end' },
      ],
    },
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
      cost: [
        { type: 'branch', if: { expr: '@действующий.действие < 1' } },
        { type: 'stop', note: { expr: '"действие на этом ходу уже потрачено"' } },
        { type: 'end' },
        { type: 'apply', target: { expr: '@действующий.действие' }, direction: 'subtract', value: { expr: '1' } },
      ],
      steps: [EACH, HIT],
    },
    стрела: {
      label: 'Волшебная стрела', activation: 'manual',
      params: [ACTOR, TARGETS, { key: 'круг', label: 'Каким кругом', kind: 'number', min: 1, max: 2, ask: { by: 'actor' } }],
      cost: [{ type: 'emit', effect: 'ячейка', args: { лист: { expr: '@действующий' }, круг: { expr: '@круг' } } }],
      steps: [EACH, HIT],
    },
    жест: { label: 'Жест', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, HIT] },
  },
} as unknown as System;

const book = { records: [
  { id: 'меч', table: 'приём', label: 'Меч', cells: {} },
  { id: 'стрела', table: 'чары', label: 'Волшебная стрела', cells: {} },
  { id: 'жест', table: 'жест', label: 'Жест', cells: {} },
] } as unknown as Compendium;

const sheet = (id: string, values: Record<string, number> = {}): Sheet => ({
  id, systemId: 'плата', name: id, values: { хиты: 20, действие: 1, ячейки_1: 1, ...values },
  has: [{ of: 'меч' }, { of: 'стрела' }, { of: 'жест' }], effects: [],
} as unknown as Sheet);

const world = { system, compendium: book, clock: null };
const why = (sheets: Sheet[], actionId: string, inputs?: Record<string, number>) =>
  costRefusal(world, sheets, { actionId, fromId: 'а', toIds: ['б'], ...(inputs ? { inputs } : {}) });

describe('почему действие сейчас не оплатить', () => {
  it('плата есть — причины нет', () => {
    expect(why([sheet('а'), sheet('б')], 'меч:0')).toBeNull();
  });

  it('платы нет — причина словами автора, без названия действия', () => {
    expect(why([sheet('а', { действие: 0 }), sheet('б')], 'меч:0')).toBe('действие на этом ходу уже потрачено');
  });

  it('действие без платы доступно всегда', () => {
    expect(why([sheet('а', { действие: 0 }), sheet('б')], 'жест:0')).toBeNull();
  });

  it('плата зависит от ответа игрока: пока ответа нет — причины нет, с ответом — причина', () => {
    const sheets = [sheet('а'), sheet('б')];
    expect(why(sheets, 'стрела:0')).toBeNull();
    expect(why(sheets, 'стрела:0', { круг: 1 })).toBeNull();
    expect(why(sheets, 'стрела:0', { круг: 2 })).toBe('не хватает ячейки 2-го круга');
  });

  it('проверка ничего не меняет и костей не бросает', () => {
    const sheets = [sheet('а'), sheet('б')];
    const before = JSON.stringify(sheets);
    why(sheets, 'меч:0');
    why(sheets, 'стрела:0', { круг: 1 });
    expect(JSON.stringify(sheets)).toBe(before);
  });

  it('настоящий ход отказывает теми же словами и листов не трогает', () => {
    const sheets = [sheet('а', { действие: 0 }), sheet('б')];
    let caught: unknown;
    try {
      perform({ system, compendium: book, clock: null, sheets, die: () => 1 }, { op: 'act', intent: { actionId: 'меч:0', fromId: 'а', toIds: ['б'] } });
    } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(ActRefused);
    expect((caught as ActRefused).why).toBe(why(sheets, 'меч:0'));
    expect((caught as ActRefused).message).toBe('«Меч» не состоялось: действие на этом ходу уже потрачено');
  });

  it('неизвестное действие и чужой лист — не причина платы', () => {
    expect(costRefusal(world, [sheet('а'), sheet('б')], { actionId: 'нет-такого:0', fromId: 'а', toIds: ['б'] })).toBeNull();
    expect(costRefusal(world, [sheet('а')], { actionId: 'меч:0', fromId: 'а', toIds: ['нет'] })).toBeNull();
  });
});

describe('образец D&D: действие потрачено', () => {
  const desk = (battle: boolean): Sheet => ({ id: 'desk', systemId: dnd.id ?? '', name: 'Стол', values: { battle }, has: [], effects: [] } as unknown as Sheet);
  const spent = { ...arven, values: { ...arven!.values, turn_action: 0 } } as Sheet;
  const ready = { ...arven, values: { ...arven!.values, turn_action: 1 } } as Sheet;
  const ask = (actor: Sheet, battle: boolean) => costRefusal(
    { system: dnd as System, compendium: dndBook as Compendium, clock: null }, [actor, mirra as Sheet, desk(battle)],
    { actionId: 'longsword-item:0', fromId: actor.id, toIds: [mirra!.id] });

  it('в бою без действия удар мечом недоступен, и сказано почему', () => {
    expect(ask(spent, true)).toBe('действие на этом ходу уже потрачено');
  });

  it('с действием и вне боя удар доступен', () => {
    expect(ask(ready, true)).toBeNull();
    expect(ask(spent, false)).toBeNull();
  });
});
