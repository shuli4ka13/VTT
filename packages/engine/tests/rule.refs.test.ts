import { group, test, eq, throws } from './harness.ts';
import { resolveRef, resolveNumber } from '../src/engine/refs.ts';
import { newPass } from '../src/engine/calc.ts';
import { system, arven, compendium } from './fixtures.ts';

const sender = () => ({
  pass: newPass(system, arven, { compendium }),
  params: { bonus: '#attack_bonus', flat: 4 },
  paramDefs: [
    { key: 'bonus', label: 'Бонус', kind: 'number' },
    { key: 'save', label: 'Чем спасается цель', kind: 'number' },
    { key: 'flat', label: 'Число', kind: 'number' },
  ],
  props: { damage_dice: '1d8', damage_flat: 3 },
  owner: 'эффект «Тестовый»',
});

const target = () => {
  const pass = newPass(system, arven, { compendium });
  return {
    pass,
    sheets: { bound: { цель: arven.id }, view: () => pass },
    results: { hit: { margin: 2, dice: { rolls: [10], kept: 10 } } },
    owner: 'конверт «Тестовый»',
  };
};

group('структурные ссылки', () => {
  group('ссылки по имени листа: resolveRef', () => {
    test('литералы и const дают значение', () => {
      eq(resolveRef(5, target()), 5);
      eq(resolveRef({ expr: '0' }, target()), 0);
    });

    test('выражение через имя листа считается этим листом', () => {
      eq(resolveRef({ expr: '@цель.dex_save' }, target()), 1);
    });

    test('ссылка на результат шага идёт по пути через точку', () => {
      eq(resolveRef({ expr: '@hit.margin', later: true }, target()), 2);
      eq(resolveRef({ expr: '@hit.dice.kept', later: true }, target()), 10);
    });

    test('ссылка на шаг, которого не было, — ошибка с именем шага', () => {
      throws(() => resolveRef({ expr: '@котик.margin', later: true }, target()), 'котик');
    });

    test('неупакованный параметр в конверте — подделка, внятная ошибка', () => {
      throws(() => resolveRef({ expr: '@bonus' }, target()), 'bonus');
    });

    test('resolveNumber сторожит нечисло', () => {
      eq(resolveNumber({ expr: '7' }, target(), 'урон'), 7);
      throws(() => resolveNumber({ expr: '@цель.race' }, target(), 'урон'), 'race');
    });
  });
});
