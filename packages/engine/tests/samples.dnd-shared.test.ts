import { describe, it, expect } from 'vitest';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { fireMoments } from './kit.ts';
import { exchange, fight } from './play.ts';
import type { System, Sheet, Effect } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const sheetOf = (id: string, values: Record<string, unknown> = {}, effects: string[] = []) => {
  const sheet = structuredClone(dnd.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values }, effects: [...(sheet.effects ?? []), ...effects.map(effectId => ({ effectId }))] } as Sheet;
};
const world = (die: number, own: System = system) => ({ system: own, compendium: dnd.compendium, die: () => die });

describe('D&D: отдых восполняет строки таблиц, а не перечень в правиле', () => {
  const spent = { 'resources.ki.max': 2, 'resources.ki.left': 0, 'resources.rages.max': 3, 'resources.rages.left': 0, 'slots.1.left': 0, 'slots.2.left': 0, 'slots.3.left': 0 };

  it('короткий отдых — ки (восполняется коротким), но не ярость и не ячейки', () => {
    const out = fireMoments([{ moment: 'short-rest', sheetId: 'mirra' }], [sheetOf('mirra', spent)], world(1) as never);
    const values = out.sheets[0]!.values;
    expect(values['resources.ki.left']).toBe(2);
    expect(values['resources.rages.left']).toBe(0);
    expect(values['slots.1.left']).toBe(0);
  });

  it('долгий отдых — все ресурсы и все круги ячеек', () => {
    const out = fireMoments([{ moment: 'long-rest', sheetId: 'mirra' }], [sheetOf('mirra', spent)], world(1) as never);
    const values = out.sheets[0]!.values;
    expect(values['resources.ki.left']).toBe(2);
    expect(values['resources.rages.left']).toBe(3);
    expect([values['slots.1.left'], values['slots.2.left'], values['slots.3.left']]).toEqual([4, 3, 2]);
  });
});

describe('D&D: начало хода — «В начале хода» каждой строки «За ход»', () => {
  const start = (effects: string[]) => fireMoments([{ moment: 'turn-start', sheetId: 'arven' }],
    [sheetOf('arven', { 'turn.deystvie.left': 0, 'turn.bonusnoe.left': 0, 'turn.reakciya.left': 0, 'turn.ataki.left': 3 }, effects)], world(1) as never)
    .sheets.find(s => s.id === 'arven')!.values;

  it('одно действие, по одному бонусному и реакции, атак — ноль', () => {
    const values = start([]);
    expect([values['turn.deystvie.left'], values['turn.bonusnoe.left'], values['turn.reakciya.left'], values['turn.ataki.left']]).toEqual([1, 1, 1, 0]);
  });

  it('«Ускорен» — два действия', () => {
    expect(start(['hasted'])['turn.deystvie.left']).toBe(2);
  });
});

describe('D&D: «Ячейка заклинания» — одна строка по кругу', () => {
  it('нет ячейки нужного круга — отказ называет круг', () => {
    expect(() => exchange({
      system, compendium: dnd.compendium, die: () => 10,
      sheets: [sheetOf('mirra', { 'slots.3.left': 0 }), sheetOf('goblin')], actionId: 'fireball:0', fromId: 'mirra', toId: 'goblin', inputs: { slot: 3 },
    })).toThrow(/нет ячейки 3-го круга/);
  });

  it('ячейка списывается со своего круга', () => {
    const out = exchange({
      system, compendium: dnd.compendium, die: () => 10,
      sheets: [sheetOf('mirra'), sheetOf('goblin')], actionId: 'fireball:0', fromId: 'mirra', toId: 'goblin', inputs: { slot: 3 },
    });
    const values = out.sheets.find(s => s.id === 'mirra')!.values;
    expect([values['slots.1.left'], values['slots.2.left'], values['slots.3.left']]).toEqual([4, 3, 1]);
  });
});

describe('D&D: «Лечение» — один шаг для всего, что лечит', () => {
  const disciple: Effect = {
    label: 'Ученик жизни', activation: 'passive', duration: { kind: 'permanent' },
    modifiers: [{ kind: 'edit', call: 'heal', param: 'amount', op: 'add', value: { expr: '2 + @slot' }, if: { expr: 'not empty(@slot)' } }],
  } as unknown as Effect;
  const own = { ...system, effects: { ...system.effects, disciple } } as System;
  const healed = (actionId: string, inputs?: Record<string, number>) => {
    const out = exchange({
      system: own, compendium: dnd.compendium, die: () => 4,
      sheets: [sheetOf('doran', {}, ['disciple']), sheetOf('arven', { hp_current: 10 })], actionId, fromId: 'doran', toId: 'arven',
      ...(inputs ? { inputs } : {}),
    });
    return Number(out.sheets.find(s => s.id === 'arven')!.values.hp_current) - 10;
  };

  it('правка лечения заклинанием прибавляет 2 + круг, зелье — без прибавки', () => {
    const plain = exchange({
      system, compendium: dnd.compendium, die: () => 4,
      sheets: [sheetOf('doran'), sheetOf('arven', { hp_current: 10 })], actionId: 'cure_wounds:0', fromId: 'doran', toId: 'arven', inputs: { slot: 2 },
    });
    const base = Number(plain.sheets.find(s => s.id === 'arven')!.values.hp_current) - 10;
    expect(healed('cure_wounds:0', { slot: 2 })).toBe(base + 4);
    const potion = exchange({
      system, compendium: dnd.compendium, die: () => 4,
      sheets: [sheetOf('doran'), sheetOf('arven', { hp_current: 10 })], actionId: 'potion_healing:0', fromId: 'doran', toId: 'arven',
    });
    expect(healed('potion_healing:0')).toBe(Number(potion.sheets.find(s => s.id === 'arven')!.values.hp_current) - 10);
  });
});

describe('D&D: плата реакции вложена в три вызова — и всё равно отказывает', () => {
  const attacked = (values: Record<string, unknown>) => exchange({
    system, compendium: dnd.compendium, die: () => 15,
    sheets: [sheetOf('orc'), sheetOf('mirra', values)], clock: fight('orc', 'mirra'), actionId: 'orc_greataxe:0', fromId: 'orc', toId: 'mirra',
    answer: () => [],
  }).questions.flatMap(question => question.offers.map(offer => offer.label));

  it('реакция есть — «Щит» предлагают', () => {
    expect(attacked({ 'turn.reakciya.left': 1 }).join(', ')).toMatch(/Щит/);
  });

  it('реакция потрачена — ни «Щита», ни «Адского возмездия»', () => {
    expect(attacked({ 'turn.reakciya.left': 0 })).toEqual([]);
  });

  it('ячеек 1-го круга нет — «Щит» не предлагают', () => {
    expect(attacked({ 'turn.reakciya.left': 1, 'slots.1.left': 0 }).join(', ')).not.toMatch(/Щит/);
  });
});
