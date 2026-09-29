import { group, test, eq, deepEq, throws, ok } from './harness.ts';
import { grantedTo } from '../src/engine/effects.ts';
import { exchange } from '../src/events/exchange.ts';
import { fireLifecycle, lifecycleChanges } from '../src/events/lifecycle.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const add = (tag: string, n: number) => ({ type: 'apply', target: { tag }, direction: 'add', value: { expr: `${JSON.stringify(n)}` } });

const system = {
  id: 'x', name: 'x',
  fields: [
    { tag: 'ярость', label: 'Ярость', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'усталость', label: 'Истощение', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'замечено', label: 'Замечено', value: { kind: 'stored', type: 'number', default: 0 } },
  ],
  effects: {
    ярость: {
      label: 'Ярость', activation: 'passive', duration: { kind: 'permanent' }, stacking: 'refresh',
      attach: [add('ярость', 1)],
      detach: [add('усталость', 1)],
    },
    буйство: { label: 'Буйство', activation: 'passive', grants: ['ярость'] },
    сторож: {
      label: 'Сторож', activation: 'passive',
      on: [{ on: 'gained:ярость', steps: [add('замечено', 1)] }, { on: 'lost:ярость', steps: [add('замечено', 10)] }],
    },
    впасть: { label: 'Впасть в ярость', activation: 'manual', steps: [{ type: 'status', mode: 'apply', effect: { const: 'ярость' }, side: 'source' }] },
    успокоиться: { label: 'Успокоиться', activation: 'manual', steps: [{ type: 'status', mode: 'remove', effect: { const: 'ярость' }, side: 'source' }] },
    пинг: { label: 'Пинг', activation: 'passive', attach: [{ type: 'status', mode: 'remove', effect: { const: 'пинг' } }, { type: 'status', mode: 'apply', effect: { const: 'понг' } }] },
    понг: { label: 'Понг', activation: 'passive', attach: [{ type: 'status', mode: 'remove', effect: { const: 'понг' } }, { type: 'status', mode: 'apply', effect: { const: 'пинг' } }] },
  },
  records: {
    умение: { kind: 'action', label: 'Умение', props: [], bindings: [] },
    вещь: { kind: 'item', label: 'Вещь', props: [] },
  },
} as unknown as System;

const book = {
  records: [
    { id: 'в', rk: 'умение', label: 'Впасть', bindings: [{ label: 'Впасть', effect: 'впасть', args: {} }] },
    { id: 'у', rk: 'умение', label: 'Успокоиться', bindings: [{ label: 'Успокоиться', effect: 'успокоиться', args: {} }] },
    { id: 'топор', rk: 'вещь', label: 'Топор берсерка', props: {}, grants: ['ярость'] },
  ],
} as unknown as Compendium;

const world = { system, compendium: book, die: () => 1 } as never;

const hero = (worn: string[] = [], has: Sheet['has'] = []): Sheet => ({
  id: 'г', systemId: 'x', name: 'Герой', values: { ярость: 0, усталость: 0, замечено: 0 },
  has: [{ of: 'в' }, { of: 'у' }, ...(has ?? [])], effects: worn.map(effectId => ({ effectId })),
} as unknown as Sheet);

const act = (actionId: string, sheet: Sheet) =>
  exchange({ system, compendium: book, die: () => 1, sheets: [sheet], actionId, fromId: 'г', toId: 'г' });

const settle = (before: Sheet, after: Sheet) => fireLifecycle([before], [after], world).sheets[0]!.values;

group('при наложении и при спадании', () => {
  test('повесили шагом — сработало «при наложении»', () => {
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

  test('повесили второй раз с обновлением срока — «при наложении» не повторяется', () => {
    eq(act('в:0', hero(['ярость'])).sheets[0]!.values.ярость, 0);
  });

  test('выданное вещью: надели — появилось, сняли в сумку — ушло', () => {
    eq(settle(hero(), hero([], [{ of: 'топор' }])).ярость, 1);
    eq(settle(hero([], [{ of: 'топор' }]), hero([], [{ of: 'топор', off: true }])).усталость, 1);
  });

  test('выданное другим эффектом приходит и уходит вместе с ним', () => {
    eq(settle(hero(), hero(['буйство'])).ярость, 1);
    eq(settle(hero(['буйство']), hero()).усталость, 1);
  });

  test('если то же выдано ещё и вещью, снятая запись ничего не меняет', () => {
    const both = hero(['ярость'], [{ of: 'топор' }]);
    deepEq(lifecycleChanges([both], [hero([], [{ of: 'топор' }])], world), []);
  });

  test('наложения, будящие друг друга по кругу, обрываются словами', () => {
    const start = hero();
    throws(() => fireLifecycle([start], [{ ...start, effects: [{ effectId: 'пинг' }] }], world), 'без остановки');
  });
});

group('подписка на чужое: «на мне появилось» и «с меня ушло»', () => {
  test('слушатель слышит, что эффект наложили шагом и что его сняли', () => {
    const came = act('в:0', hero(['сторож']));
    eq(came.sheets[0]!.values.замечено, 1);
    eq(act('у:0', hero(['сторож', 'ярость'])).sheets[0]!.values.замечено, 10);
  });

  test('слышит и выданное вещью', () => {
    eq(settle(hero(['сторож']), hero(['сторож'], [{ of: 'топор' }])).замечено, 1);
  });
});

group('выдача у типа предмета', () => {
  test('надел вещь — висит то, что выдаёт её тип, снял — ушло', () => {
    const system = {
      id: 's', name: 's', fields: [{ tag: 'ac', label: 'КБ', value: { kind: 'stored', type: 'number', default: 10 } }],
      effects: { shield_rule: { label: 'Щит', activation: 'passive', modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: 2 }] } },
      records: { shield: { kind: 'item', label: 'Щит', grants: ['shield_rule'] } },
    } as unknown as System;
    const compendium = { records: [{ id: 'buckler', rk: 'shield', label: 'Баклер' }] } as Compendium;
    const worn = { id: 'h', systemId: 's', name: 'h', values: {}, has: [{ of: 'buckler' }], effects: [] } as Sheet;
    ok(grantedTo(system, worn, compendium).includes('shield_rule'));
    ok(!grantedTo(system, { ...worn, has: [{ of: 'buckler', off: true }] }, compendium).includes('shield_rule'));
  });
});
