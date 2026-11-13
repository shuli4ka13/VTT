import { describe, it, expect } from 'vitest';
import { LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { perform } from '../src/core/perform.ts';
import { exchange } from './play.ts';
import type { Sheet } from '../src/model/types.ts';

const world = LITE_WORLDS.find(one => one.system.id === 'imperium-maledictum')!;
const system = flattenSystem(world.system);

const hero = (target: number): Sheet => ({ id: 'г', systemId: system.id, name: 'Г', values: { 'характеристики.сила.значение': target }, has: [], effects: [] } as unknown as Sheet);

const test = (target: number, rolled: number, claims?: string[]): string => {
  const out = perform({ system, compendium: world.compendium, clock: null, sheets: [hero(target)], die: () => rolled } as never,
    { op: 'roll', sheetId: 'г', tag: 'характеристики.сила.итог', ...(claims ? { claims } : {}) } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  return out.log.join('\n');
};

const wounds = (sheets: Sheet[], id: string): number => Number((sheets.find(one => one.id === id)!.values as Record<string, unknown>)['раны'] ?? 0);

describe('Imperium Maledictum: проверка к100', () => {
  it('степени — десятки цели минус десятки выпавшего (с. 187, 189, 190)', () => {
    expect(test(72, 26)).toContain('успех · степеней: 5 · Ошеломительный успех');
    expect(test(43, 16)).toContain('успех · степеней: 3 · Впечатляющий успех');
    expect(test(41, 57)).toContain('провал · степеней: -1 · Провал');
  });

  it('ноль со знаком: те же десятки — на грани, успех и провал различаются', () => {
    expect(test(45, 40)).toContain('успех · степеней: 0 · Успех на грани');
    expect(test(45, 49)).toContain('провал · степеней: 0 · Провал на грани');
  });

  it('01–05 — всегда успех, 96–00 — всегда провал, оба на грани (с. 188)', () => {
    expect(test(3, 4)).toContain('успех · степеней: 0 · Успех на грани');
    expect(test(80, 3)).toContain('успех · степеней: 0 · Успех на грани');
    expect(test(99, 97)).toContain('провал · степеней: 0 · Провал на грани');
    expect(test(30, 100)).toContain('провал · степеней: 0 · Провал на грани');
  });

  it('Преимущество переставляет цифры в пользу, Помеха — против (с. 189)', () => {
    expect(test(30, 72)).toContain('провал');
    expect(test(30, 72, ['преимущество'])).toContain('успех');
    expect(test(30, 27, ['преимущество'])).toContain('успех');
    expect(test(30, 27, ['помеха'])).toContain('провал');
  });
});

describe('Imperium Maledictum: сложность словом перед броском с листа (с. 188)', () => {
  it('сложность правит цель до броска, степени считаются от новой цели', () => {
    expect(test(45, 50)).toContain('не больше 45: провал · степеней: -1');
    expect(test(45, 50, ['простая'])).toContain('не больше 65: успех · степеней: 1');
    expect(test(45, 40, ['трудная'])).toContain('не больше 35: провал · степеней: -1');
    expect(test(45, 12, ['очень_тяжёлая'])).toContain('не больше 15: успех · степеней: 0');
    expect(test(20, 75, ['очень_лёгкая'])).toContain('не больше 80: успех · степеней: 1');
  });

  it('сложность и Преимущество складываются', () => {
    expect(test(45, 82, ['трудная', 'преимущество'])).toContain('не больше 35: успех · степеней: 1');
  });
});

describe('Imperium Maledictum: выстрел и первая помощь', () => {
  const shot = (rolled: number) => exchange({
    system, compendium: world.compendium, die: () => rolled, sheets: world.sheets,
    actionId: 'lasgun:0', fromId: 'ваал', toId: 'культист',
  } as never);

  it('урон оружия плюс степени, минус броня места по цифре единиц (с. 211–212)', () => {
    expect(wounds(shot(13).sheets, 'культист')).toBe(9);
    expect(wounds(shot(27).sheets, 'культист')).toBe(7);
    expect(wounds(shot(55).sheets, 'культист')).toBe(0);
  });

  it('раны не копятся выше максимума: бонус Силы + 2 × бонус Выносливости + бонус Воли (с. 214)', () => {
    const once = shot(1).sheets;
    const twice = exchange({ system, compendium: world.compendium, die: () => 13, sheets: shot(13).sheets, actionId: 'lasgun:0', fromId: 'ваал', toId: 'культист' } as never).sheets;
    expect(wounds(once, 'культист')).toBe(6);
    expect(wounds(twice, 'культист')).toBe(11);
  });

  it('первая помощь: Медицина +20, снимает степени плюс бонус Интеллекта (с. 219)', () => {
    const hurt = shot(13).sheets;
    const heal = (rolled: number) => exchange({
      system, compendium: world.compendium, die: () => rolled, sheets: hurt,
      actionId: 'first_aid:0', fromId: 'ваал', toId: 'культист', inputs: { сложность: 20 },
    } as never);
    expect(wounds(heal(21).sheets, 'культист')).toBe(4);
    expect(wounds(heal(77).sheets, 'культист')).toBe(9);
  });
});

describe('Imperium Maledictum: удар в ближнем бою (с. 190, 211)', () => {
  const queue = (...values: number[]) => () => values.shift() ?? 1;

  const strike = (dice: number[], defender: Record<string, number> = {}, how = 'ближний_бой', answer?: string) => {
    const sheets = world.sheets.map(one => one.id === 'культист'
      ? { ...one, values: { ...(one.values as Record<string, unknown>), ...defender } }
      : one) as Sheet[];
    return exchange({
      system, compendium: world.compendium, die: queue(...dice), sheets,
      actionId: 'sword:0', fromId: 'ваал', toId: 'культист', inputs: { чем: how },
      ...(answer ? { answer: () => [answer] } : {}),
    } as never);
  };

  it('победа по степеням: Меч 2 + бонус Силы 4 + разница степеней 4 − броня тела 1 = 9 ран', () => {
    const out = strike([27, 52]);
    expect(wounds(out.sheets, 'культист')).toBe(9);
    expect(wounds(out.sheets, 'ваал')).toBe(0);
  });

  it('победа защитника: у бьющего −1 степень, у защитника +1 — ран нет, ответного урона нет', () => {
    const out = strike([55, 21]);
    expect(wounds(out.sheets, 'культист')).toBe(0);
    expect(wounds(out.sheets, 'ваал')).toBe(0);
  });

  it('равные степени, выше навык бьющего (45 против 30): 2 + 4 + 0 − броня тела 1 = 5 ран', () => {
    const out = strike([38, 25]);
    expect(wounds(out.sheets, 'культист')).toBe(5);
  });

  it('равные степени, выше навык защитника (50 против 45): удар не прошёл', () => {
    const out = strike([38, 45], { 'характеристики.ближний_бой.значение': 50 });
    expect(wounds(out.sheets, 'культист')).toBe(0);
    expect(out.log.join('\n')).not.toContain('ничья');
  });

  it('защита Рефлексами (ловкость 30): те же кости дают тот же урон, 9 ран', () => {
    const out = strike([27, 52], {}, 'рефлексы');
    expect(wounds(out.sheets, 'культист')).toBe(9);
  });

  it('полная ничья (степени и навык равны, по 45): решает ведущий — «Защитник»: ран нет; «Бьющий»: удар прошёл', () => {
    const tie = { 'характеристики.ближний_бой.значение': 45 };
    const lost = strike([38, 38], tie, 'ближний_бой', 'нет');
    expect(lost.questions.map(one => `${one.sheetId}: ${one.label}`)).toEqual(['стол: Ничья. Кто победил?']);
    expect(wounds(lost.sheets, 'культист')).toBe(0);
    const won = strike([38, 38], tie, 'ближний_бой', 'да');
    expect(wounds(won.sheets, 'культист')).toBe(5);
    expect(won.log.join('\n')).toContain('«Ничья. Кто победил?»: Бьющий');
  });
});
