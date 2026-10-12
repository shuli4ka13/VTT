import { group, test, eq, ok, throws } from './harness.ts';
import { availableActions } from '../src/events/actions.ts';
import { exchange } from './play.ts';
import { propsNeeded } from '../src/model/owned.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 's', name: 's',
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 10 }] } , weapon: {
      shape: 'book', use: 'item', label: 'Оружие',
      columns: [{ key: 'урон', kind: 'number' }, { key: 'заметка', kind: 'text' }, { key: 'раз', kind: 'number' }],
      bindings: [{ label: 'Удар', effect: 'hit', args: { урон: { expr: '@урон' }, заметка: { expr: '@заметка' }, раз: { expr: '@раз' } } }],
    } },
  effects: {
    hit: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }, { key: 'урон', kind: 'number' }, { key: 'заметка', kind: 'text', optional: true }, { key: 'раз', kind: 'number', default: 1 }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@урон * @раз' } }],
    },
  },
  
} as unknown as System;
const compendium = { records: [{ id: 'club', table: 'weapon', label: 'Дубина', cells: { урон: 3 } }] } as Compendium;
const sheet = (id: string, has: string[] = []) => ({ id, systemId: 's', name: id, values: {}, has: has.map(of => ({ of })), effects: [] }) as Sheet;

const bare = (): System => {
  const copy = structuredClone(system);
  copy.tables!.weapon!.bindings![0]!.args = undefined;
  return copy;
};

group('вход с именем свойства записи заполняет явный аргумент кнопки', () => {
  test('кнопка без аргументов: свойство записи само во вход не уходит — ошибка о незаполненном входе', () => {
    const open = bare();
    const [action] = availableActions(sheet('a', ['club']), { system: open, compendium });
    ok(action);
    const lost = throws(() => exchange({ system: open, compendium, die: () => 1, sheets: [sheet('a', ['club']), sheet('b')], actionId: action!.id, fromId: 'a', toId: 'b' }));
    ok(String(lost.message).includes('«урон»'), String(lost.message));
  });

  test('кнопка с аргументом «@урон»: «урон» берётся из свойства записи', () => {
    const [action] = availableActions(sheet('a', ['club']), { system, compendium });
    ok(action);
    const out = exchange({ system, compendium, die: () => 1, sheets: [sheet('a', ['club']), sheet('b')], actionId: action!.id, fromId: 'a', toId: 'b' });
    eq(out.sheets.find(s => s.id === 'b')!.values.hp, 7);
  });

  test('обязательное свойство запись должна заполнить, необязательное — нет', () => {
    ok(!propsNeeded(bare(), bare().tables!.weapon, bare().tables!.weapon!.bindings!).has('урон'));
    const need = propsNeeded(system, system.tables!.weapon, system.tables!.weapon!.bindings!);
    ok(need.has('урон'));
    ok(!need.has('заметка'));
  });

  test('свойство входа с умолчанием запись может не заполнять — берётся умолчание', () => {
    ok(!propsNeeded(system, system.tables!.weapon, system.tables!.weapon!.bindings!).has('раз'));
    const [action] = availableActions(sheet('a', ['club']), { system, compendium });
    const out = exchange({ system, compendium, die: () => 1, sheets: [sheet('a', ['club']), sheet('b')], actionId: action!.id, fromId: 'a', toId: 'b' });
    eq(out.sheets.find(s => s.id === 'b')!.values.hp, 7);
    const blank = { records: [{ id: 'club', table: 'weapon', label: 'Дубина', cells: { урон: 3, раз: '' } }] } as Compendium;
    const again = exchange({ system, compendium: blank, die: () => 1, sheets: [sheet('a', ['club']), sheet('b')], actionId: action!.id, fromId: 'a', toId: 'b' });
    eq(again.sheets.find(s => s.id === 'b')!.values.hp, 7);
  });
});
