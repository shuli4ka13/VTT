import { group, test, eq, deepEq, throws } from './harness.ts';
import { packRef, resolveRef, resolveNumber } from '../src/engine/refs.ts';
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
  group('фаза отправителя: packRef', () => {
    test('литералы проходят как есть — это уже чистые данные', () => {
      eq(packRef(5, sender()), 5);
      eq(packRef('2d8', sender()), '2d8');
      eq(packRef(null, sender()), null);
    });

    test('const остаётся собой', () => {
      deepEq(packRef({ const: 0 }, sender()), { const: 0 });
    });

    test('своё выражение считается своим листом и уезжает числом', () => {
      deepEq(packRef({ expr: '#str_mod * 2' }, sender()), { const: 6 });
    });

    test('выражение с полем получателя проносится нетронутым — отправитель не считает за цель', () => {
      deepEq(packRef({ expr: '@получатель.dex_save' }, sender()),
        { expr: '@получатель.dex_save', of: 'target' });
    });

    test('вход-число, пришедший формулой, считается листом отправителя', () => {
      deepEq(packRef({ param: 'bonus' }, sender()), { const: 6 });
    });

    test('вход-число с полем получателя в формуле уезжает выражением', () => {
      const ctx = { ...sender(), params: { save: '@получатель.dex_save' } };
      deepEq(packRef({ param: 'save' }, ctx), { expr: '@получатель.dex_save', of: 'target' });
    });

    test('вход-формула с полем получателя внутри другой формулы уезжает к получателю вместе с ней', () => {
      const ctx = { ...sender(), params: { save: '@получатель.dex_save' } };
      const packed = packRef({ expr: '@save + #str_mod' }, ctx) as { expr: string; of: string; sent?: Record<string, unknown> };
      eq(packed.of, 'target');
      eq(packed.expr, '(@получатель.dex_save) + #str_mod');
      eq(resolveRef(packed, target()), 1 + 3, 'Ловкость цели считает цель, Силу отправитель прислал числом');
    });

    test('вход-формула без полей получателя в формуле считается у отправителя, как раньше', () => {
      deepEq(packRef({ expr: '@bonus + 1' }, sender()), { const: 7 });
    });

    test('параметр-число уезжает числом', () => {
      deepEq(packRef({ param: 'flat' }, sender()), { const: 4 });
    });

    test('незаполненный параметр — ошибка с именем параметра и владельцем', () => {
      const ctx = { ...sender(), params: {} };
      const err = throws(() => packRef({ param: 'bonus' }, ctx), 'bonus');
      eq(err.message.includes('эффект «Тестовый»'), true, 'кто виноват — в сообщении');
    });

    test('необъявленный параметр — ошибка: правило такого не обещало', () => {
      throws(() => packRef({ param: 'котик' }, sender()), 'котик');
    });

    test('свойство предмета читается из записи-источника', () => {
      deepEq(packRef({ item: 'damage_flat' }, sender()), { const: 3 });
    });

    test('ссылка на предмет без предмета-источника — внятная ошибка при упаковке', () => {
      const ctx = { ...sender(), props: null };
      const err = throws(() => packRef({ item: 'damage_flat' }, ctx), 'damage_flat');
      eq(err.message.includes('эффект «Тестовый»'), true);
    });

    test('свойство, которого запись не заполнила, — ошибка, а не undefined в рантайме', () => {
      throws(() => packRef({ item: 'котик' }, sender()), 'котик');
    });

    test('тег цели проносится нетронутым', () => {
      deepEq(packRef({ tag: 'hp_max' }, sender()), { tag: 'hp_max' });
    });

    test('ссылка на результат шага проносится нетронутой: результаты рождаются у цели', () => {
      deepEq(packRef({ ref: 'hit.margin' }, sender()), { ref: 'hit.margin' });
    });

    test('ссылка неизвестной формы — ошибка со списком форм', () => {
      throws(() => packRef({ котик: 1 }, sender()), 'котик');
    });
  });

  group('необязательные ссылки: для взаимоисключающих слотов', () => {

    test('незаполненный необязательный параметр — законная пустота', () => {
      const ctx = { ...sender(), params: {} };
      deepEq(packRef({ param: 'flat', optional: true }, ctx), { const: null });
    });

    test('необязательное свойство предмета без предмета — пустота, не ошибка', () => {
      const ctx = { ...sender(), props: null };
      deepEq(packRef({ item: 'damage_flat', optional: true }, ctx), { const: null });
    });

    test('незаполненное необязательное свойство предмета — пустота', () => {
      deepEq(packRef({ item: 'котик', optional: true }, sender()), { const: null });
    });

    test('но БЕЗ пометки те же пустоты остаются ошибками', () => {
      throws(() => packRef({ param: 'flat' }, { ...sender(), params: {} }), 'flat');
      throws(() => packRef({ item: 'damage_flat' }, { ...sender(), props: null }), 'damage_flat');
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
      eq(resolveRef({ ref: 'hit.margin' }, target()), 2);
      eq(resolveRef({ ref: 'hit.dice.kept' }, target()), 10);
    });

    test('ссылка на шаг, которого не было, — ошибка с именем шага', () => {
      throws(() => resolveRef({ ref: 'котик.margin' }, target()), 'котик');
    });

    test('неупакованный параметр в конверте — подделка, внятная ошибка', () => {
      throws(() => resolveRef({ param: 'bonus' }, target()), 'bonus');
    });

    test('выражение отправителя, пришедшее неразрешённым, — подделка', () => {
      throws(() => resolveRef({ expr: '#str_mod' }, target()));
    });

    test('resolveNumber сторожит нечисло', () => {
      eq(resolveNumber({ const: 7 }, target(), 'урон'), 7);
      throws(() => resolveNumber({ tag: 'race' }, target(), 'урон'), 'race');
    });
  });
});
