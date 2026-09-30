import { describe, it, expect } from 'vitest';
import { checkReadback, changeReadback, numberReadback, joinReadback, editReadback, dieReadback } from './readback.ts';
import type { System, Effect, Step } from '@vtt/schema';
import { withColumn } from '@vtt/engine/model/sheet-columns';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'armor', label: 'Класс брони', kind: 'number', default: 10 },
    { key: 'wounds', label: 'Текущие хиты', kind: 'number', default: 10 },
    { key: 'power_mod', label: 'Мод Силы', expr: '1' },
  ] } },
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: { poison: { label: 'Отравлен', activation: 'passive', modifiers: [] } },
} as unknown as System;

const effect = { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect;

describe('checkReadback', () => {
  it('порог броском читается фразой с лейблами системы', () => {
    const step = {
      type: 'threshold', successWhen: 'atLeast', continueOn: 'success',
      roll: { die: { constant: 'lead' }, bonus: { expr: '#power_mod' }, check: null },
      versus: { expr: '@получатель.armor' },
    } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('Ты бросаешь 1к20 + Мод Силы против «Класс брони». Не добросил — эффект кончается.');
  });

  it('пустая мишень — оранжевый пропуск', () => {
    const step = { type: 'threshold', roll: { die: { constant: 'lead' } } } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('Ты бросаешь 1к20 против ⟨какого поля цели?⟩. Не добросил — эффект кончается.');
  });

  it('сравнение без броска', () => {
    const step = { type: 'compare', value: { expr: '@dmg' }, versus: { expr: '@получатель.armor' }, breakIf: 'atMost' } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('результат «dmg» против «Класс брони» у цели — не превысило, эффект кончается.');
  });
});

describe('changeReadback', () => {
  it('вычитание со склеенным числом: кости из записи + прибавка', () => {
    const amount = { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'p_1' }, bonus: { expr: '#power_mod' } } as unknown as Step;
    const apply = { type: 'apply', target: { tag: 'wounds' }, direction: 'subtract', value: { expr: '@dmg' } } as unknown as Step;
    expect(joinReadback(changeReadback(apply, amount, system, effect)))
      .toBe('Цель теряет ⟨вход «кость урона»⟩ + Мод Силы из «Текущие хиты».');
  });

  it('состояние по id читается лейблом', () => {
    const step = { type: 'status', mode: 'apply', effect: { const: 'poison' } } as unknown as Step;
    expect(joinReadback(changeReadback(step, null, system, effect)))
      .toBe('На цель вешается состояние «Отравлен».');
  });
});

describe('numberReadback', () => {
  it('одиночное число: машинное имя в пересказ не попадает', () => {
    const step = { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d6' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect))).toBe('Считается число: 2к6.');
  });
});

describe('editReadback — правка броска словами', () => {
  const sys = {
    ...system,
    roll_edits: {
      down: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] },
    },
  } as unknown as System;

  it('преимущество D&D читается фразой, а не «addDie · keepBest»', () => {
    const edit = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] };
    expect(joinReadback(editReadback(edit, sys)))
      .toBe('Кинуть на кость больше, оставить лучшую.');
  });

  it('гашение названо лейблом встречной правки, а не её ключом', () => {
    const edit = { label: 'Преимущество', ops: [{ op: 'addDie' }], canceledBy: 'down' };
    expect(joinReadback(editReadback(edit, sys)))
      .toBe('Кинуть на кость больше. Гасится: Помеха.');
  });

  it('ступень кости и сдвиг порога — своими словами, а не знаком', () => {
    expect(joinReadback(editReadback({ ops: [{ op: 'dieStep', by: 1 }] }, sys)))
      .toBe('Взять кость на 1 ступень выше.');

    expect(joinReadback(editReadback({ ops: [{ op: 'shiftVersus', by: -2 }] }, sys)))
      .toBe('Сделать порог легче на 2.');
  });

  it('несколько костей и несколько оставленных — с правильными окончаниями', () => {
    expect(joinReadback(editReadback({ ops: [{ op: 'addDie', n: 2 }, { op: 'keepBest', n: 3 }] }, sys)))
      .toBe('Кинуть на 2 кости больше, оставить 3 лучших.');
  });

  it('переворот цифр — фразой, с направлением', () => {
    expect(joinReadback(editReadback({ ops: [{ op: 'flip', prefer: 'low' }] }, sys)))
      .toBe('Перевернуть цифры, если так меньше.');
    expect(joinReadback(editReadback({ ops: [{ op: 'flip', prefer: 'high' }] }, sys)))
      .toBe('Перевернуть цифры, если так больше.');
  });

  it('переброс — фразой, с порогом', () => {
    expect(joinReadback(editReadback({ ops: [{ op: 'reroll', n: 1 }] }, sys)))
      .toBe('Перебросить единицы, новый результат обязателен.');
    expect(joinReadback(editReadback({ ops: [{ op: 'reroll', n: 2 }] }, sys)))
      .toBe('Перебросить кости не выше 2, новый результат обязателен.');
  });

  it('пустая правка — оранжевый пропуск, а не молчание', () => {
    expect(joinReadback(editReadback({ label: 'Фора', ops: [] }, sys)))
      .toBe('⟨что она делает с броском?⟩');
  });
});

describe('dieReadback — кость словами', () => {
  it('одна кость — складывать нечего, и об этом не говорят', () => {
    const die = { kind: 'die', dice: [{ count: 1, sides: 20 }] };
    expect(joinReadback(dieReadback(die, system))).toBe('Кинуть 1к20.');
  });

  it('несколько костей — сумма названа: их и правда складывают', () => {
    const die = { kind: 'die', dice: [{ count: 2, sides: 6 }] };
    expect(joinReadback(dieReadback(die, system))).toBe('Кинуть 2к6 и сложить.');
  });

  it('счёт успехов объясняет порог на кость', () => {
    const die = { kind: 'die', dice: [{ count: 4, sides: 6 }], read: { kind: 'count', atLeast: 5 } };
    expect(joinReadback(dieReadback(die, system)))
      .toBe('Кинуть 4к6 и посчитать, сколько выпало не ниже 5.');
  });

  it('пул из листа назван лейблом поля, а не тегом', () => {
    const sys = withColumn(system, { key: 'pool', label: 'Пул костей', kind: 'number', default: 4 });
    const die = { kind: 'die', dice: [{ count: { expr: '@pool' }, sides: 6 }], read: 'best' };
    expect(joinReadback(dieReadback(die, sys)))
      .toBe('Кинуть к6 по числу «Пул костей» и взять лучшую.');
  });
});

describe('крит в пересказе', () => {
  it('удвоение костей названо словами и порогом', () => {
    const step = {
      id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d6' },
      double: { expr: '@hit.natural >= 20' },
    } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect)))
      .toBe('Считается число: 2к6 — и вдвое, если выпавшее на костях не меньше 20.');
  });

  it('без удвоения фраза прежняя', () => {
    const step = { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d6' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect))).toBe('Считается число: 2к6.');
  });
});
