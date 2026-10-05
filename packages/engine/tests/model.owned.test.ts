import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { availableActions } from '../src/events/actions.ts';
import { exchange } from './play.ts';
import { wornEffects } from '../src/engine/effects.ts';
import { shownOn } from '../src/model/owned.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';

const system = {
  id: 'в', name: 'в',
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [
    { key: 'кд', label: 'Класс брони', kind: 'number', default: 10 },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
  ] } , оружие: {
      shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'урон', label: 'Урон', kind: 'number' }],
      bindings: [{ label: 'Ударить', effect: 'удар', args: { урон: { expr: '@урон' } } }],
    }, щит: { shape: 'book', use: 'item', label: 'Щит', columns: [] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }, { key: 'урон', label: 'Урон', kind: 'number' }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } }],
    },
    зоркость: { label: 'Зоркость', activation: 'passive', modifiers: [] },
  },
  
} as unknown as System;

const book = {
  records: [
    { id: 'меч', table: 'оружие', label: 'Меч', cells: { урон: 5 } },
    { id: 'щит', table: 'щит', label: 'Щит', cells: {}, grants: ['зоркость'], modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '2' } }] },
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
      const out = exchange({ system, compendium: book, die: () => 1, sheets: [sheet, target()], actionId: 'меч:0', fromId: 'герой', toId: 'цель' });
      return out.sheets.find(x => x.id === 'цель')!.values.хиты;
    };
    eq(hit(hero([{ of: 'меч' }])), 15);
    eq(hit(hero([{ of: 'меч', values: { урон: 8 } }])), 12);
  });
});

group('тип листа — как запись, которую лист носит всегда', () => {
  const withKinds = {
    ...system,
    blocks: [
      { name: 'Щиты', parent: 'Защита', parts: [{ table: 'лист', columns: ['кд'] }] },
      { name: 'Магия', parts: [{ table: 'лист', columns: ['ячейки'] }] },
    ],
    tables: { лист: { shape: 'single', columns: [
      { key: 'кд', label: 'Класс брони', kind: 'number', default: 10 },
      { key: 'ячейки', label: 'Ячейки', kind: 'number', default: 2 },
    ] } },
    sheets: {
      противник: {
        label: 'Противник', blocks: ['Защита'], grants: ['зоркость'],
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
