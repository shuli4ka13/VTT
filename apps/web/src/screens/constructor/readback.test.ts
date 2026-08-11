import { describe, it, expect } from 'vitest';
import { checkReadback, changeReadback, numberReadback, joinReadback } from './readback.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  fields: [
    { tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'wounds', label: 'Текущие хиты', value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'power_mod', label: 'Мод Силы', value: { kind: 'formula', expr: '1' } },
  ],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: { poison: { label: 'Отравлен', activation: 'passive', modifiers: [] } },
} as unknown as System;

const effect = { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect;

describe('checkReadback', () => {
  it('порог броском читается фразой с лейблами системы', () => {
    const step = {
      type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
      roll: { die: { constant: 'lead' }, bonus: { expr: '#power_mod' }, check: null },
      versus: { tag: 'armor' },
    } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('Отправитель бросает 1d20 + Мод Силы против «Класс брони». Не добросил — эффект кончается.');
  });

  it('пустая мишень — оранжевый пропуск', () => {
    const step = { type: 'threshold', roll: { die: { constant: 'lead' } } } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('Отправитель бросает 1d20 против ⟨какого поля цели?⟩. Не добросил — эффект кончается.');
  });

  it('сравнение без броска', () => {
    const step = { type: 'compare', value: { ref: 'dmg' }, versus: { tag: 'armor' }, breakIf: 'atMost' } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('результат «dmg» против «Класс брони» у цели — не превысило, эффект кончается.');
  });
});

describe('changeReadback', () => {
  it('вычитание со склеенным числом: кости из записи + прибавка', () => {
    const amount = { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'p_1' }, bonus: { expr: '#power_mod' } } as unknown as Step;
    const apply = { type: 'apply', target: { tag: 'wounds' }, direction: 'subtract', value: { ref: 'dmg' } } as unknown as Step;
    expect(joinReadback(changeReadback(apply, amount, system, effect)))
      .toBe('Цель теряет ⟨кость урона — из записи⟩ + Мод Силы из «Текущие хиты».');
  });

  it('состояние по id читается лейблом', () => {
    const step = { type: 'status', mode: 'apply', effect: { const: 'poison' } } as unknown as Step;
    expect(joinReadback(changeReadback(step, null, system, effect)))
      .toBe('На цель вешается состояние «Отравлен».');
  });
});

describe('numberReadback', () => {
  it('одиночное число с именем', () => {
    const step = { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d6' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect)))
      .toBe('Считается число: 2d6 — дальше это «dmg».');
  });
});
