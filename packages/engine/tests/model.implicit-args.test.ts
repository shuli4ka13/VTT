import { group, test, eq, ok } from './harness.ts';
import { availableActions } from '../src/events/actions.ts';
import { exchange } from './play.ts';
import { propsNeeded } from '../src/model/owned.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 's', name: 's',
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 10 }] } , weapon: {
      shape: 'book', use: 'item', label: 'Оружие',
      columns: [{ key: 'урон', kind: 'number' }, { key: 'заметка', kind: 'text' }],
      bindings: [{ label: 'Удар', effect: 'hit' }],
    } },
  effects: {
    hit: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }, { key: 'урон', kind: 'number' }, { key: 'заметка', kind: 'text', optional: true }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@урон' } }],
    },
  },
  
} as unknown as System;
const compendium = { records: [{ id: 'club', table: 'weapon', label: 'Дубина', cells: { урон: 3 } }] } as Compendium;
const sheet = (id: string, has: string[] = []) => ({ id, systemId: 's', name: id, values: {}, has: has.map(of => ({ of })), effects: [] }) as Sheet;

group('вход с именем свойства записи берёт его сам', () => {
  test('кнопка без аргументов: «урон» берётся из свойства записи', () => {
    const [action] = availableActions(sheet('a', ['club']), { system, compendium });
    ok(action);
    const out = exchange({ system, compendium, die: () => 1, sheets: [sheet('a', ['club']), sheet('b')], actionId: action!.id, fromId: 'a', toId: 'b' });
    eq(out.sheets.find(s => s.id === 'b')!.values.hp, 7);
  });

  test('обязательное свойство запись должна заполнить, необязательное — нет', () => {
    const need = propsNeeded(system, system.tables!.weapon, system.tables!.weapon!.bindings!);
    ok(need.has('урон'));
    ok(!need.has('заметка'));
  });
});
