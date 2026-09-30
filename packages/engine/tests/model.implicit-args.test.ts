import { group, test, eq, ok } from './harness.ts';
import { availableActions } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { propsNeeded } from '../src/model/owned.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 's', name: 's',
  tables: { лист: { shape: 'single', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 10 }] } },
  effects: {
    hit: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'урон', kind: 'number' }, { key: 'заметка', kind: 'text', optional: true }],
      steps: [{ type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '@урон' } }],
    },
  },
  records: {
    weapon: {
      kind: 'item', label: 'Оружие',
      props: [{ key: 'урон', kind: 'number' }, { key: 'заметка', kind: 'text' }],
      bindings: [{ label: 'Удар', effect: 'hit' }],
    },
  },
} as unknown as System;
const compendium = { records: [{ id: 'club', rk: 'weapon', label: 'Дубина', props: { урон: 3 } }] } as Compendium;
const sheet = (id: string, has: string[] = []) => ({ id, systemId: 's', name: id, values: {}, has: has.map(of => ({ of })), effects: [] }) as Sheet;

group('вход с именем свойства записи берёт его сам', () => {
  test('кнопка без аргументов: «урон» берётся из свойства записи', () => {
    const [action] = availableActions(sheet('a', ['club']), { system, compendium });
    ok(action);
    const out = exchange({ system, compendium, die: () => 1, sheets: [sheet('a', ['club']), sheet('b')], actionId: action!.id, fromId: 'a', toId: 'b' });
    eq(out.sheets.find(s => s.id === 'b')!.values.hp, 7);
  });

  test('обязательное свойство запись должна заполнить, необязательное — нет', () => {
    const need = propsNeeded(system, system.records!.weapon, system.records!.weapon!.bindings!);
    ok(need.has('урон'));
    ok(!need.has('заметка'));
  });
});
