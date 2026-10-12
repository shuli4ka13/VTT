import { group, test, eq } from './harness.ts';
import { readFileSync } from 'node:fs';
import { stackStages, paramStages } from '../src/engine/stages.ts';

const dnd = JSON.parse(readFileSync(new URL('../../../samples/dnd5e.world.json', import.meta.url), 'utf8'));
const stages = paramStages(dnd.system.effects.damage.params, 'amount');
const mul = (value: number, stage: string) => ({ op: 'mul', stage, value });
const damage = (base: number, mods: { op: string; stage: string; value: number }[]) =>
  stackStages(mods, base, 'Урон', mod => mod.value, stages);

group('урон D&D по этапам (SRD 5.2)', () => {
  test('сопротивление из таблицы и «В ярости» — одно сопротивление: 10 → 5', () => {
    eq(damage(10, [mul(0.5, 'сопротивление'), mul(0.5, 'сопротивление')]), 5);
  });
  test('сопротивление, затем уязвимость, с округлением вниз: 7 → 3 → 6', () => {
    eq(damage(7, [mul(0.5, 'сопротивление'), mul(2, 'уязвимость')]), 6);
  });
  test('таблица «как есть» (×1) не гасит уязвимость ×2', () => {
    eq(damage(7, [mul(1, 'уязвимость'), mul(2, 'уязвимость')]), 14);
  });
  test('иммунитет ×0 сильнее сопротивления ×0.5', () => {
    eq(damage(9, [mul(0.5, 'сопротивление'), mul(0, 'сопротивление')]), 0);
  });
  test('Невероятное уклонение и сопротивление складываются: 9 → 4 → 2', () => {
    eq(damage(9, [mul(0.5, 'половина'), mul(0.5, 'сопротивление')]), 2);
  });
});
