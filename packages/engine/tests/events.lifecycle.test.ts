import { group, test, eq, deepEq, throws } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { fireLifecycle, lifecycleChanges } from '../src/events/lifecycle.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const add = (tag: string, n: number) => ({ type: 'apply', target: { tag }, direction: 'add', value: { expr: `${JSON.stringify(n)}` } });

const system = {
  id: 'x', name: 'x',
  fields: [
    { tag: 'ярость', label: 'Ярость', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'усталость', label: 'Истощение', value: { kind: 'stored', type: 'number', default: 0 } },
  ],
  effects: {
    ярость: {
      label: 'Ярость', activation: 'passive', duration: { kind: 'permanent' },
      attach: [add('ярость', 1)],
      detach: [add('усталость', 1)],
    },
    впасть: { label: 'Впасть в ярость', activation: 'manual', steps: [{ type: 'status', mode: 'apply', effect: { const: 'ярость' }, side: 'source' }] },
    успокоиться: { label: 'Успокоиться', activation: 'manual', steps: [{ type: 'status', mode: 'remove', effect: { const: 'ярость' }, side: 'source' }] },
    пинг: { label: 'Пинг', activation: 'passive', attach: [{ type: 'status', mode: 'remove', effect: { const: 'пинг' } }, { type: 'status', mode: 'apply', effect: { const: 'понг' } }] },
    понг: { label: 'Понг', activation: 'passive', attach: [{ type: 'status', mode: 'remove', effect: { const: 'понг' } }, { type: 'status', mode: 'apply', effect: { const: 'пинг' } }] },
  },
  records: { умение: { kind: 'action', label: 'Умение', props: [], bindings: [] } },
} as unknown as System;

const book = {
  records: [{ id: 'в', rk: 'умение', label: 'Впасть', bindings: [{ label: 'Впасть', effect: 'впасть', args: {} }] }, { id: 'у', rk: 'умение', label: 'Успокоиться', bindings: [{ label: 'Успокоиться', effect: 'успокоиться', args: {} }] }],
} as unknown as Compendium;

const hero = (worn: string[] = []): Sheet => ({
  id: 'г', systemId: 'x', kind: 'pc', name: 'Герой', values: { ярость: 0, усталость: 0 },
  has: [{ of: 'в' }, { of: 'у' }], effects: worn.map(effectId => ({ effectId })),
} as unknown as Sheet);

const act = (actionId: string, sheet: Sheet) =>
  exchange({ system, compendium: book, die: () => 1, sheets: [sheet], actionId, fromId: 'г', toId: 'г' });

group('при наложении и при спадании', () => {
  test('повесили — сработало «при наложении»', () => {
    const out = act('в:0', hero());
    eq(out.sheets[0]!.values.ярость, 1);
    eq(out.sheets[0]!.values.усталость, 0);
    eq(out.reports.at(-1)!.report.label, 'Ярость · при наложении');
  });

  test('сняли — сработало «при спадании», с какой угодно причины', () => {
    const out = act('у:0', hero(['ярость']));
    deepEq(out.sheets[0]!.effects, []);
    eq(out.sheets[0]!.values.усталость, 1);
  });

  test('сравнение листов видит и наложенное, и снятое', () => {
    const changes = lifecycleChanges([hero(['ярость'])], [{ ...hero(), effects: [{ effectId: 'пинг' }] }]);
    deepEq(changes.map(c => `${c.turn}:${c.entry.effectId}`), ['attach:пинг', 'detach:ярость']);
  });

  test('наложения, будящие друг друга по кругу, обрываются словами', () => {
    const start = hero();
    throws(() => fireLifecycle([start], [{ ...start, effects: [{ effectId: 'пинг' }] }], { system, compendium: book, die: () => 1 } as never),
      'без остановки');
  });
});
