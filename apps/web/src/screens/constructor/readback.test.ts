import { describe, it, expect } from 'vitest';
import { checkReadback, rollReadback, changeReadback, numberReadback, joinReadback, editReadback, dieReadback, dieSaid, editNotation, seenReadback } from './readback.ts';
import type { System, Effect, Step } from '@vtt/schema';
import { withColumn } from '@vtt/engine';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'armor', label: 'Класс брони', kind: 'number', default: 10 },
    { key: 'wounds', label: 'Текущие хиты', kind: 'number', default: 10 },
    { key: 'power_mod', label: 'Мод Силы', expr: { expr: '1' } },
  ] } },
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: { poison: { label: 'Отравлен', activation: 'passive', modifiers: [] } },
} as unknown as System;

const effect = { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect;

const hero = { ...effect, params: [...(effect.params ?? []), { key: 'атакующий', label: 'Атакующий', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } }], steps: [{ type: 'each', of: 'цели' }] } as unknown as Effect;

describe('checkReadback', () => {
  it('сравнение читается фразой «что знак с чем»; лист справа в сравнении назван, о ходе шагов проверка не говорит', () => {
    const step = { type: 'check', value: { expr: '@dmg' }, versus: { expr: '@цель.armor' }, successWhen: 'over' } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, hero))).toBe('результат «dmg» больше «Класс брони» (цель).');
  });

  it('знак по умолчанию — «не меньше»; каждый знак сказан своими словами', () => {
    const base = { type: 'check', value: { expr: '@x' }, versus: { expr: '10' } };
    const said = (successWhen?: string) => joinReadback(checkReadback({ ...base, ...(successWhen ? { successWhen } : {}) } as unknown as Step, system, effect));
    expect(said()).toBe('результат «x» не меньше 10.');
    expect(said('atLeast')).toBe('результат «x» не меньше 10.');
    expect(said('notOver')).toBe('результат «x» не больше 10.');
    expect(said('under')).toBe('результат «x» меньше 10.');
    expect(said('equals')).toBe('результат «x» равно 10.');
  });

  it('пустая проверка — оранжевые пропуски: что проверяем и с чем', () => {
    const step = { type: 'check' } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect))).toBe('⟨что проверяем?⟩ не меньше ⟨с чем?⟩.');
  });
});

describe('rollReadback', () => {
  it('кость с хозяином: кто бросает, кость, счёт, прибавка и метки', () => {
    const step = {
      id: 'hit', type: 'roll', die: 'lead', count: { expr: '2' }, bonus: { expr: '#power_mod' }, by: { expr: '@атакующий' }, tags: ['атака', 'меч'],
    } as unknown as Step;
    expect(joinReadback(rollReadback(step, system, hero))).toBe('hit = «Атакующий» бросает 1к20 × 2 + «Мод Силы» (атака, меч)');
  });

  it('нулевая прибавка не пишется', () => {
    const step = { type: 'roll', die: 'lead', by: { expr: '@атакующий' }, bonus: { expr: '0' } } as unknown as Step;
    expect(joinReadback(rollReadback(step, system, hero))).toBe('«Атакующий» бросает 1к20');
  });

  it('бросок поля с вторым полем называет оба поля', () => {
    const step = { type: 'roll', field: { expr: '@цель.armor' }, second: { expr: '@цель.wounds' } } as unknown as Step;
    expect(joinReadback(rollReadback(step, system, hero))).toBe('бросок поля «Класс брони» (цель) и «Текущие хиты» (цель)');
  });

  it('бросок поля: поле и поправка', () => {
    const step = { type: 'roll', field: { expr: '@цель.armor' }, shift: { expr: '2' } } as unknown as Step;
    expect(joinReadback(rollReadback(step, system, hero))).toBe('бросок поля «Класс брони» (цель) с поправкой 2');
  });

  it('кости ничьи названы, а недостающее — оранжевым пропуском', () => {
    expect(joinReadback(rollReadback({ type: 'roll', die: 'lead' } as unknown as Step, system, effect))).toBe('кости ничьи: 1к20');
    expect(joinReadback(rollReadback({ type: 'roll' } as unknown as Step, system, effect))).toBe('кости ничьи: ⟨что бросает?⟩');
  });
});

describe('changeReadback', () => {
  it('вычитание со склеенным числом: кости из записи + прибавка', () => {
    const amount = { id: 'dmg', type: 'roll', die: { expr: '@p_1' }, bonus: { expr: '#power_mod' } } as unknown as Step;
    const apply = { type: 'apply', target: { expr: '@цель.wounds' }, direction: 'subtract', value: { expr: '@dmg' } } as unknown as Step;
    expect(joinReadback(changeReadback(apply, amount, system, hero)))
      .toBe('«Текущие хиты» (цель) уменьшается на ⟨вход «кость урона»⟩ + «Мод Силы».');
  });

  it('состояние по id читается лейблом, на кого вешается — по листу', () => {
    const step = { type: 'status', mode: 'apply', effect: 'poison', to: { expr: '@цель' } } as unknown as Step;
    expect(joinReadback(changeReadback(step, null, system, hero)))
      .toBe('На «цель» вешается состояние «Отравлен».');
  });

  it('состояние без листа — пропуск «кто?»', () => {
    const step = { type: 'status', mode: 'apply', effect: 'poison' } as unknown as Step;
    expect(joinReadback(changeReadback(step, null, system, effect)))
      .toBe('На ⟨кто?⟩ вешается состояние «Отравлен».');
  });
});

describe('numberReadback', () => {
  it('одиночное число: машинное имя в пересказ не попадает', () => {
    const step = { id: 'dmg', type: 'roll', die: { expr: '"2d6"' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect))).toBe('Считается число: 2к6.');
  });

  it('число с бросающим — чей-то бросок, назван листом', () => {
    const step = { id: 'dmg', type: 'roll', die: { expr: '"2d6"' }, by: { expr: '@атакующий' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, hero))).toBe('«Атакующий» бросает: 2к6.');
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
      .toBe('Добавить кость, оставить лучшую.');
  });

  it('гашение названо лейблом встречной правки, а не её ключом', () => {
    const edit = { label: 'Преимущество', ops: [{ op: 'addDie' }], cancels: ['down'] };
    expect(joinReadback(editReadback(edit, sys)))
      .toBe('Добавить кость. Гасится: Помеха.');
  });

  it('ступень кости и сдвиг порога — своими словами, а не знаком', () => {
    expect(joinReadback(editReadback({ ops: [{ op: 'dieStep', by: 1 }] }, sys)))
      .toBe('Взять кость на 1 ступень выше.');

    expect(joinReadback(editReadback({ ops: [{ op: 'shiftVersus', by: -2 }] }, sys)))
      .toBe('Сделать порог легче на 2.');
  });

  it('несколько костей и несколько оставленных — с правильными окончаниями', () => {
    expect(joinReadback(editReadback({ ops: [{ op: 'addDie', n: 2 }, { op: 'keepBest', n: 3 }] }, sys)))
      .toBe('Добавить 2 кости, оставить 3 лучших.');
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

  it('кость без счёта — тоже одна: складывать нечего', () => {
    const die = { kind: 'die', dice: [{ sides: 20 }] };
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
  it('без удвоения фраза прежняя', () => {
    const step = { id: 'dmg', type: 'roll', die: { expr: '"2d6"' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect))).toBe('Считается число: 2к6.');
  });
});

describe('правка броска записью костей', () => {
  const lead = { constants: { lead: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } } } as unknown as System;

  it('одна простая кость — «было → стало»', () => {
    expect(editNotation({ ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] }, lead)).toBe('к20 → 2к20, лучшая');
    expect(editNotation({ ops: [{ op: 'plus', die: { expr: '1к6' }, minus: true }] }, lead)).toBe('к20 → к20 − 1к6');
    expect(editNotation({ ops: [{ op: 'floorDie', least: 10 }] }, lead)).toBe('к20 → к20, не меньше 10');
    expect(editNotation({ ops: [{ op: 'shiftVersus', by: 99 }] }, lead)).toBe('порог труднее на 99');
  });

  it('составная кость или несколько костей — словами', () => {
    const duality = { constants: { d: { kind: 'die', dice: [{ count: 1, sides: 12, name: 'hope' }, { count: 1, sides: 12, name: 'fear' }] } } } as unknown as System;
    expect(editNotation({ ops: [{ op: 'plus', die: { expr: '1к6' } }] }, duality)).toBeNull();
    expect(joinReadback(editReadback({ ops: [{ op: 'plus', die: { expr: '1к6' } }] }, duality))).toBe('Прибавить 1к6.');
    expect(joinReadback(editReadback({ ops: [{ op: 'floorDie', least: 10 }] }, duality))).toBe('Считать кость не меньше 10.');
  });
});

describe('сводка свёрнутого шага «увидев кости»', () => {
  const words = (step: Record<string, unknown>) => seenReadback(step as never, {} as never).map(part => ('text' in part ? part.text : part.hole)).join(' ');

  it('«Перебросить»: два режима читаются по-разному', () => {
    expect(words({ type: 'roll-reroll', which: 'lowest' })).toBe('одну меньшую кость');
    expect(words({ type: 'roll-reroll', upTo: { expr: '1' } })).toBe('кости не выше 1');
  });

  it('«Докинуть» и «Прибавить»', () => {
    expect(words({ type: 'roll-add', count: { expr: '1' }, keep: 'best' })).toBe('1, оставить лучшую');
    expect(words({ type: 'roll-plus', value: { expr: '2' } })).toBe('+ 2');
  });
});
