import { group, test, eq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dh = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'daggerheart')!;
const system = dh.system as System;
const compendium = dh.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}) => {
  const sheet = structuredClone(dh.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values } } as Sheet;
};
const tape = (...values: number[]) => () => values.shift() ?? 1;
const valueOf = (out: ReturnType<typeof exchange>, id: string, tag: string) => out.sheets.find(s => s.id === id)!.values[tag];
const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));

group('Daggerheart: герой по SRD', () => {
  test('класс, происхождение и доспех считают уклонение, хиты, Стресс и пороги', () => {
    const bran = sheetOf('bran');
    eq(computed(bran, 'evasion'), 10, 'Воин 11, кольчуга −1');
    eq(computed(bran, 'hp_max'), 6);
    eq(computed(bran, 'stress_max'), 7, 'человек: +1 клетка Стресса');
    eq(computed(bran, 'major'), 8, 'кольчуга 7 + уровень 1');
    eq(computed(bran, 'severe'), 16);
    eq(computed(sheetOf('toma'), 'major'), 9, 'галапа: + мастерство к порогам');
  });

  test('без доспеха пороги — уровень и двойной уровень', () => {
    const bare = { ...sheetOf('bran'), has: [] } as Sheet;
    eq(computed(bare, 'major'), 1);
    eq(computed(bare, 'severe'), 2);
  });
});

group('Daggerheart: противник — тип листа переопределяет формулы героя', () => {
  test('хиты, Стресс и пороги — числами из блока, без класса и уровня', () => {
    const bandit = sheetOf('bandit');
    eq(computed(bandit, 'hp_max'), 5);
    eq(computed(bandit, 'stress_max'), 3);
    eq(computed(bandit, 'major'), 8, 'порог без прибавки уровня');
    eq(computed(bandit, 'severe'), 14);
    eq(computed(sheetOf('bran'), 'major'), 8, 'у героя по-прежнему основа доспеха + уровень');
  });
});

group('Daggerheart: двуручный меч — ещё кость урона, худшая отбрасывается', () => {
  test('мастерство 1: бросаются две к10, остаётся лучшая', () => {
    const bran = { ...sheetOf('bran'), has: [{ of: 'greatsword' }] } as Sheet;
    const out = exchange({
      system, compendium, die: tape(9, 4, 1, 4), sheets: [bran, sheetOf('bandit'), sheetOf('desk')],
      actionId: 'greatsword:0', fromId: 'bran', toId: 'bandit',
    });
    eq(valueOf(out, 'bandit', 'hp'), 1, 'к10: 1 и 4 — остаётся 4, + 3 = 7 ниже порога 8; сумма дала бы 8 и две клетки');
  });
});
