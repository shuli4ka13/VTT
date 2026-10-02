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

const target = () => ({
  pass: newPass(system, arven, { compendium }),
  results: { hit: { margin: 2, dice: { rolls: [10], kept: 10 } } },
  owner: 'конверт «Тестовый»',
});

group('структурные ссылки', () => {
  group('необязательные ссылки: для взаимоисключающих слотов', () => {

    test('незаполненный необязательный параметр — законная пустота', () => {
      const ctx = { ...sender(), params: {} };
      eq(resolveRef({ param: 'flat', optional: true }, ctx), null);
    });

    test('необязательное свойство предмета без предмета — пустота, не ошибка', () => {
      const ctx = { ...sender(), props: null };
      eq(resolveRef({ prop: 'damage_flat', optional: true }, ctx), null);
    });

    test('незаполненное необязательное свойство предмета — пустота', () => {
      eq(resolveRef({ prop: 'котик', optional: true }, sender()), null);
    });

    test('но БЕЗ пометки те же пустоты остаются ошибками', () => {
      throws(() => resolveRef({ param: 'flat' }, { ...sender(), params: {} }), 'flat');
      throws(() => resolveRef({ prop: 'damage_flat' }, { ...sender(), props: null }), 'damage_flat');
    });
  });

  group('фаза получателя: resolveRef', () => {
    test('литералы и const дают значение', () => {
      eq(resolveRef(5, target()), 5);
      eq(resolveRef({ const: 0 }, target()), 0);
    });

    test('выражение цели считается листом получателя', () => {
      eq(resolveRef({ expr: '@получатель.dex_save', of: 'target' }, target()), 1);
    });

    test('тег считается формулами получателя', () => {
      eq(resolveRef({ tag: 'hp_max' }, target()), 44);
    });

    test('ссылка на результат шага идёт по пути через точку', () => {
      eq(resolveRef({ expr: '@hit.margin', later: true }, target()), 2);
      eq(resolveRef({ expr: '@hit.dice.kept', later: true }, target()), 10);
    });

    test('ссылка на шаг, которого не было, — ошибка с именем шага', () => {
      throws(() => resolveRef({ expr: '@котик.margin', later: true }, target()), 'котик');
    });

    test('неупакованный параметр в конверте — подделка, внятная ошибка', () => {
      throws(() => resolveRef({ param: 'bonus' }, target()), 'bonus');
    });

    test('resolveNumber сторожит нечисло', () => {
      eq(resolveNumber({ const: 7 }, target(), 'урон'), 7);
      throws(() => resolveNumber({ expr: '@получатель.race', of: 'target' }, target(), 'урон'), 'race');
    });
  });
});
