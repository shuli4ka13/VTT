import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { rollInitiative } from '../src/engine/clock.ts';
import { sharedOf } from '../src/events/desk.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'г', name: 'г',
  tables: { лист: { shape: 'single', columns: [
    { key: 'сила', label: 'Сила', kind: 'number', default: 2 },
  ] }, группа: { shape: 'single', owner: 'group', columns: [
    { key: 'урон', label: 'Урон отряда', kind: 'number' },
    { key: 'выбыло', label: 'Выбыло', expr: 'округлить вниз(@урон / 3)' },
  ] } },
  effects: {
    удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'apply', target: { tag: 'урон' }, direction: 'add', value: { expr: '4' } }] },
  },
  records: { приём: { kind: 'action', label: 'Приём', props: [], bindings: [] } },
} as unknown as System;
const book = { records: [{ id: 'удар', rk: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;

const sheet = (id: string, extra: Partial<Sheet> = {}) =>
  ({ id, systemId: 'г', name: id, values: {}, has: [{ of: 'удар' }], effects: [], ...extra }) as unknown as Sheet;
const squad = sheet('отряд', { has: [] });
const goblin = (id: string) => sheet(id, { group: 'отряд' });

group('группа — общий лист для нескольких', () => {
  test('поле группы читается из листа группы у каждого участника', () => {
    const shared = [{ ...squad, values: { урон: 7 } }];
    const a = goblin('а');
    eq(calc(system, a, 'урон', newPass(system, a, { shared })), 7);
    eq(calc(system, a, 'выбыло', newPass(system, a, { shared })), 2, 'формула поля группы считается на листе группы');
  });

  test('урон по одному участнику пишется в лист группы — видят все', () => {
    const sheets = [sheet('герой'), goblin('а'), goblin('б'), squad];
    const out = exchange({ system, compendium: book, die: () => 1, sheets, actionId: 'удар:0', fromId: 'герой', toId: 'а' });
    eq(out.sheets.find(s => s.id === 'отряд')!.values.урон, 4);
    eq(out.sheets.find(s => s.id === 'а')!.values.урон, undefined, 'у самого участника ничего не записано');
    const б = out.sheets.find(s => s.id === 'б')!;
    eq(calc(system, б, 'урон', newPass(system, б, { shared: sharedOf(system, out.sheets) })), 4);
  });

  test('лист без группы хранит поле у себя', () => {
    const out = exchange({ system, compendium: book, die: () => 1, sheets: [sheet('герой'), sheet('одиночка')], actionId: 'удар:0', fromId: 'герой', toId: 'одиночка' });
    eq(out.sheets.find(s => s.id === 'одиночка')!.values.урон, 4);
  });

  test('лист группы не ходит в бою', () => {
    const sheets = [sheet('герой'), goblin('а'), squad];
    deepEq(rollInitiative(system, sheets, book, () => 1).order.includes('отряд'), false);
  });
});
