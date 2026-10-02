import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { startCombat, idleClock } from '../src/engine/clock.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'с', name: 'с', tables: { приём: { shape: 'book', use: 'action', label: 'Приём' } },
  effects: {
    помочь: { label: 'Помочь', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],  steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'status', mode: 'apply', effect: { const: 'помощь' }, to: { expr: '@цель' }, args: { помогающий: { expr: '@действующий' } } }] },
    помощь: { label: 'Помощь', activation: 'passive', params: [{ key: 'помогающий', kind: 'sheet', optional: true }], duration: { kind: 'turns', max: 1, ends: 'turn-start', by: 'помогающий' } },
    отвлечь: { label: 'Отвлечь', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],  steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'status', mode: 'apply', effect: { const: 'отвлечён' }, to: { expr: '@цель' } }] },
    отвлечён: { label: 'Отвлечён', activation: 'passive', duration: { kind: 'turns', max: 1 } },
  },
  
} as unknown as System;

const book = {
  records: [
    { id: 'помочь', table: 'приём', label: 'Помочь', bindings: [{ label: 'Помочь', effect: 'помочь', args: {} }] },
    { id: 'отвлечь', table: 'приём', label: 'Отвлечь', bindings: [{ label: 'Отвлечь', effect: 'отвлечь', args: {} }] },
  ],
} as unknown as Compendium;

const who = (id: string): Sheet => ({ id, systemId: 'с', name: id, values: {}, has: [{ of: 'помочь' }, { of: 'отвлечь' }], effects: [] }) as Sheet;

const apply = (action: string) => {
  const clock = startCombat(idleClock(), ['а', 'б']);
  const out = exchange({ system, compendium: book, die: () => 1, clock, sheets: [who('а'), who('б')], actionId: action, fromId: 'а', toId: 'б' });
  return out.sheets.find(x => x.id === 'б')!.effects;
};

group('срок по ходам наложившего', () => {
  test('наложенное помнит, кто наложил, — по его ходам оно и спадёт', () => {
    deepEq(apply('помочь:0'), [{ effectId: 'помощь', args: { помогающий: 'а' }, turnsLeft: 1 }]);
  });

  test('свой срок имени наложившего не хранит — лист не пухнет', () => {
    const worn = apply('отвлечь:0');
    eq(worn.length, 1);
    eq('args' in worn[0]!, false);
  });
});
