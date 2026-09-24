import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { send } from '../src/events/envelope.ts';
import { runSelfTrack } from '../src/events/self.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'ячейки', label: 'Ячейки', value: { kind: 'stored', type: 'number', default: 3, min: 0 } },
  ],
  effects: {
    снаряд: {
      label: 'Снаряд', activation: 'manual',
      self: [{ type: 'apply', target: { tag: 'ячейки' }, direction: 'subtract', value: { expr: '1' } }],
      steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '4' } }],
    },
    удар: {
      label: 'Удар', activation: 'manual',
      steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '2' } }],
    },
  },
  records: {
    заклинание: { kind: 'action', label: 'Заклинание', props: [], bindings: [{ label: 'Снаряд', effect: 'снаряд', args: {} }] },
    приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
} as unknown as System;

const compendium = {
  records: [{ id: 'снаряд', rk: 'заклинание', label: 'Снаряд', props: {} }, { id: 'меч', rk: 'приём', label: 'Меч', props: {} }],
} as unknown as Compendium;

const sheet = (id: string): Sheet => ({
  id, systemId: 'x', kind: 'pc', name: id, values: { хиты: 20, ячейки: 3 },
  has: [{ of: 'снаряд' }, { of: 'меч' }], effects: [],
} as unknown as Sheet);

const world = { system, compendium, die: () => 1 };

group('дорожка «со мной»', () => {
  test('ячейка тратится один раз за действие, у цели — свой урон', () => {
    const out = exchange({
      ...world, sheets: [sheet('маг'), sheet('цель')],
      actionId: 'снаряд:0', fromId: 'маг', toId: 'цель',
    });
    eq(out.sheets.find(s => s.id === 'маг')!.values.ячейки, 2);
    eq(out.sheets.find(s => s.id === 'цель')!.values.хиты, 16);
    ok(out.reports.some(entry => entry.report.kind === 'self'), 'отчёт дорожки есть');
  });

  test('на трёх целях ячейка всё равно одна: дорожка идёт до целей', () => {
    const sheets = [sheet('маг'), sheet('а'), sheet('б'), sheet('в')];
    const envelope = send('снаряд:0', { ...world, sheet: sheets[0]! });
    const own = runSelfTrack('снаряд:0', sheets[0]!, world);
    eq(own.sheet.values.ячейки, 2, 'дорожка сработала один раз');
    ok(envelope.steps.length > 0);
  });

  test('без дорожки ничего не меняется и лишнего отчёта нет', () => {
    const out = exchange({
      ...world, sheets: [sheet('воин'), sheet('цель')],
      actionId: 'меч:0', fromId: 'воин', toId: 'цель',
    });
    eq(out.sheets.find(s => s.id === 'воин')!.values.ячейки, 3);
    eq(out.reports.length, 1);
    eq(out.reports[0]!.report.kind, 'effect');
  });

  test('дорожка не может опустить поле ниже нижней границы', () => {
    const empty = { ...sheet('маг'), values: { хиты: 20, ячейки: 0 } } as Sheet;
    const out = runSelfTrack('снаряд:0', empty, world);
    eq(out.sheet.values.ячейки, 0);
  });
});

group('в шагах отправителя получателя нет', () => {
  const withSelf = (self: unknown[], params: unknown[] = [], args: Record<string, unknown> = {}) => ({
    ...system,
    effects: { ...system.effects, снаряд: { ...(system.effects as any).снаряд, self, params } },
    records: { ...system.records, заклинание: { ...(system.records as any).заклинание, bindings: [{ label: 'Снаряд', effect: 'снаряд', args }] } },
  }) as unknown as System;

  test('поле получателя прямо в шаге отправителя — ошибка словами, а не свой лист молча', () => {
    const sys = withSelf([{ type: 'apply', target: { tag: 'ячейки' }, direction: 'set', value: { expr: '@получатель.хиты' } }]);
    throws(() => runSelfTrack('снаряд:0', sheet('маг'), { system: sys, compendium, die: () => 1 }), 'получателя нет');
  });

  test('вход-формула с полем получателя, пришедшая из записи в шаг отправителя, — та же ошибка', () => {
    const sys = withSelf(
      [{ type: 'apply', target: { tag: 'ячейки' }, direction: 'subtract', value: { expr: '@сколько + 0' } }],
      [{ key: 'сколько', label: 'Сколько', kind: 'number' }],
      { сколько: '@получатель.хиты' },
    );
    throws(() => runSelfTrack('снаряд:0', sheet('маг'), { system: sys, compendium, die: () => 1 }), 'получателя нет');
  });
});
