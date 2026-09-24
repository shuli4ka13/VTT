import { group, test, eq, deepEq } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
import { startCombat, idleClock } from '../src/engine/clock.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'с', name: 'с', fields: [],
  effects: {
    помочь: { label: 'Помочь', activation: 'manual', steps: [{ type: 'status', mode: 'apply', effect: { const: 'помощь' } }] },
    помощь: { label: 'Помощь', activation: 'passive', duration: { kind: 'turns', max: 1, ends: 'turn-start', whose: 'source' } },
    отвлечь: { label: 'Отвлечь', activation: 'manual', steps: [{ type: 'status', mode: 'apply', effect: { const: 'отвлечён' } }] },
    отвлечён: { label: 'Отвлечён', activation: 'passive', duration: { kind: 'turns', max: 1 } },
  },
  records: { приём: { kind: 'action', label: 'Приём' } },
} as unknown as System;

const book = {
  records: [
    { id: 'помочь', rk: 'приём', label: 'Помочь', bindings: [{ label: 'Помочь', effect: 'помочь', args: {} }] },
    { id: 'отвлечь', rk: 'приём', label: 'Отвлечь', bindings: [{ label: 'Отвлечь', effect: 'отвлечь', args: {} }] },
  ],
} as unknown as Compendium;

const who = (id: string): Sheet => ({ id, systemId: 'с', name: id, values: {}, has: [{ of: 'помочь' }, { of: 'отвлечь' }], effects: [] }) as Sheet;

const apply = (action: string) => {
  const clock = startCombat(idleClock(), ['а', 'б']);
  const env = send(action, { system, sheet: who('а'), compendium: book, die: () => 1 });
  return receive(env, { system, sheet: who('б'), compendium: book, die: () => 1, clock }).sheet.effects;
};

group('срок по ходам наложившего', () => {
  test('наложенное помнит, кто наложил, — по его ходам оно и спадёт', () => {
    deepEq(apply('помочь:0'), [{ effectId: 'помощь', turnsLeft: 1, from: 'а' }]);
  });

  test('свой срок имени наложившего не хранит — лист не пухнет', () => {
    const worn = apply('отвлечь:0');
    eq(worn.length, 1);
    eq('from' in worn[0]!, false);
  });
});
