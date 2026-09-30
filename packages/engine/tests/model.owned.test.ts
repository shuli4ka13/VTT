import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { availableActions, send, receive } from '../src/events/envelope.ts';
import { wornEffects } from '../src/engine/effects.ts';
import { shownOn } from '../src/model/owned.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';

const system = {
  id: 'в', name: 'в',
  tables: { лист: { shape: 'single', columns: [
    { key: 'кд', label: 'Класс брони', kind: 'number', default: 10 },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
  ] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'урон', label: 'Урон', kind: 'number' }],
      steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } }],
    },
    зоркость: { label: 'Зоркость', activation: 'passive', modifiers: [] },
  },
  records: {
    оружие: {
      kind: 'item', label: 'Оружие', props: [{ key: 'урон', label: 'Урон', kind: 'number' }],
      bindings: [{ label: 'Ударить', effect: 'удар', args: { урон: { prop: 'урон' } } }],
    },
    щит: { kind: 'item', label: 'Щит', props: [] },
  },
} as unknown as System;

const book = {
  records: [
    { id: 'меч', rk: 'оружие', label: 'Меч', props: { урон: 5 } },
    { id: 'щит', rk: 'щит', label: 'Щит', props: {}, grants: ['зоркость'], modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '2' } }] },
  ],
} as unknown as Compendium;

const hero = (has: Sheet['has']): Sheet =>
  ({ id: 'герой', systemId: 'в', name: 'Герой', values: {}, has, effects: [] }) as Sheet;

const target = (): Sheet => ({ id: 'цель', systemId: 'в', name: 'Цель', values: {}, has: [], effects: [] }) as Sheet;

group('что есть у листа: запись со своим состоянием', () => {
  test('надетое правит и выдаёт, в сумке — ни правок, ни выданного, ни кнопок', () => {
    const worn = hero([{ of: 'щит' }, { of: 'меч' }]);
    eq(calc(system, worn, 'кд', newPass(system, worn, { compendium: book })), 12);
    deepEq(wornEffects(system, worn, { compendium: book }).map(w => w.id), ['зоркость']);
    eq(availableActions(worn, { system, compendium: book }).length, 1);

    const bagged = hero([{ of: 'щит', off: true }, { of: 'меч', off: true }]);
    eq(calc(system, bagged, 'кд', newPass(system, bagged, { compendium: book })), 10);
    deepEq(wornEffects(system, bagged, { compendium: book }), []);
    eq(availableActions(bagged, { system, compendium: book }).length, 0);
  });

  test('значение экземпляра перекрывает свойство записи: этот меч наточен', () => {
    const hit = (sheet: Sheet) => {
      const env = send('меч:0', { system, sheet, compendium: book, die: () => 1 });
      return receive(env, { system, sheet: target(), compendium: book, die: () => 1 }).sheet.values.хиты;
    };
    eq(hit(hero([{ of: 'меч' }])), 15);
    eq(hit(hero([{ of: 'меч', values: { урон: 8 } }])), 12);
  });
});

group('тип листа — как запись, которую лист носит всегда', () => {
  const withKinds = {
    ...system,
    groups: { Защита: {}, Магия: {}, Щиты: { parent: 'Защита' } },
    tables: { лист: { shape: 'single', columns: [
      { key: 'кд', label: 'Класс брони', kind: 'number', default: 10, block: 'Щиты' },
      { key: 'ячейки', label: 'Ячейки', kind: 'number', default: 2, block: 'Магия' },
    ] } },
    records: {
      ...system.records,
      противник: {
        kind: 'sheet', label: 'Противник', blocks: ['Защита'], grants: ['зоркость'],
        modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '1' } }],
      },
    },
  } as unknown as System;
  const orc = { ...hero([]), id: 'орк', of: 'противник' } as Sheet;

  test('правки и выданное рода действуют без записи в листе', () => {
    eq(calc(withKinds, orc, 'кд', newPass(withKinds, orc, { compendium: book })), 11);
    deepEq(wornEffects(withKinds, orc, { compendium: book }).map(w => w.id), ['зоркость']);
    eq(calc(withKinds, hero([]), 'кд', newPass(withKinds, hero([]), { compendium: book })), 10, 'лист без типа — как прежде');
  });

  test('тип показывает только свои блоки, вложенные — вместе с родителем', () => {
    const shown = fieldsOf(withKinds).filter(shownOn(withKinds, orc)).map(f => f.tag);
    deepEq(shown, ['кд']);
    deepEq(fieldsOf(withKinds).filter(shownOn(withKinds, hero([]))).map(f => f.tag), ['кд', 'ячейки']);
  });
});

group('правила комнаты — выданное системой каждому листу', () => {
  const ruled = { ...system, grants: ['зоркость'] } as unknown as System;

  test('висят на любом листе, с типом и без, и считаются как висящее', () => {
    deepEq(wornEffects(ruled, hero([]), { compendium: book }).map(w => w.id), ['зоркость']);
    deepEq(wornEffects(ruled, hero([{ of: 'щит' }]), { compendium: book }).map(w => w.id), ['зоркость'], 'выданное дважды — одно');
  });
});
