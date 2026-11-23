import { group, test, eq } from './harness.ts';
import { readFileSync } from 'node:fs';
import { stackStages, paramStages, targetStages } from '../src/engine/stages.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet } from '../src/model/types.ts';

const dnd = JSON.parse(readFileSync(new URL('../../../samples/dnd5e.world.json', import.meta.url), 'utf8'));
const stages = paramStages(dnd.system.effects.damage.params, 'amount');
const mul = (value: number, stage: string) => ({ op: 'mul', stage, value });
const damage = (base: number, mods: { op: string; stage: string; value: number }[]) =>
  stackStages(mods, base, 'Урон', mod => mod.value, stages);

group('урон D&D по этапам (SRD 5.2)', () => {
  test('сопротивление из таблицы и «В ярости» — одно сопротивление: 10 → 5', () => {
    eq(damage(10, [mul(0.5, 'soprotivlenie'), mul(0.5, 'soprotivlenie')]), 5);
  });
  test('сопротивление, затем уязвимость, с округлением вниз: 7 → 3 → 6', () => {
    eq(damage(7, [mul(0.5, 'soprotivlenie'), mul(2, 'uyazvimost')]), 6);
  });
  test('таблица «как есть» (×1) не гасит уязвимость ×2', () => {
    eq(damage(7, [mul(1, 'uyazvimost'), mul(2, 'uyazvimost')]), 14);
  });
  test('иммунитет ×0 сильнее сопротивления ×0.5', () => {
    eq(damage(9, [mul(0.5, 'soprotivlenie'), mul(0, 'soprotivlenie')]), 0);
  });
  test('Невероятное уклонение и сопротивление складываются: 9 → 4 → 2', () => {
    eq(damage(9, [mul(0.5, 'polovina'), mul(0.5, 'soprotivlenie')]), 2);
  });
});

group('клетка таблицы: правки строки и «любой строки» складываются одним этапом', () => {
  const system = {
    id: 'к', name: 'к', constants: {},
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [
        { key: 'тип', label: 'Тип', kind: 'choice', from: 'урон', default: 'огонь' },
        { key: 'прибавка_типа', label: 'Прибавка типа', expr: { expr: '@тип.прибавка' } },
      ] },
      урон: {
        label: 'Типы урона', key: 'word',
        columns: [{ key: 'прибавка', label: 'Прибавка', kind: 'number', stages: [{ key: 'множители', combine: { mul: 'min' } }] }],
        rows: [{ value: 'огонь', cells: { прибавка: { expr: '8' } } }, { value: 'лёд.вечный', cells: { прибавка: { expr: '8' } } }],
      },
    },
    effects: {
      стойкость: {
        label: 'Стойкость', activation: 'passive',
        modifiers: [
          { kind: 'value', target: 'cell:урон.огонь.прибавка', op: 'mul', value: { expr: '0.5' } },
          { kind: 'value', target: 'cell:урон.*.прибавка', op: 'mul', value: { expr: '0.5' } },
        ],
      },
    },
  } as unknown as System;
  const sheet = (тип: string) => ({ id: 'я', systemId: 'к', name: 'я', values: { тип }, has: [], effects: [{ effectId: 'стойкость' }] } as unknown as Sheet);

  test('наименьший множитель из правки строки и правки всех строк: 8 → 4, а не 2', () => {
    const one = sheet('огонь');
    eq(calc(system, one, 'прибавка_типа', newPass(system, one, { compendium: { records: [] } as never })), 4);
  });
  test('этапы колонки находятся и у строки с точкой в имени', () => {
    eq(targetStages(system, 'cell:урон.лёд.вечный.прибавка').map(stage => stage.key).join(), 'множители');
  });
});
