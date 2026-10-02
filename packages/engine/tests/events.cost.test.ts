import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'ячейки', label: 'Ячейки', kind: 'number', default: 3, min: 0 },
  ] } , заклинание: { shape: 'book', use: 'action', label: 'Заклинание', columns: [], bindings: [{ label: 'Снаряд', effect: 'снаряд', args: {} }] }, приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
  effects: {
    снаряд: {
      label: 'Снаряд', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
      cost: [{ type: 'apply', target: { expr: '@действующий.ячейки' }, direction: 'subtract', value: { expr: '1' } }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '4' } }],
    },
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '2' } }],
    },
  },
  
} as unknown as System;

const compendium = {
  records: [{ id: 'снаряд', table: 'заклинание', label: 'Снаряд', cells: {} }, { id: 'меч', table: 'приём', label: 'Меч', cells: {} }],
} as unknown as Compendium;

const sheet = (id: string): Sheet => ({
  id, systemId: 'x', name: id, values: { хиты: 20, ячейки: 3 },
  has: [{ of: 'снаряд' }, { of: 'меч' }], effects: [],
} as unknown as Sheet);

const world = { system, compendium, die: () => 1 };

group('цена действия', () => {
  test('ячейка тратится один раз за действие, у цели — свой урон', () => {
    const out = exchange({
      ...world, sheets: [sheet('маг'), sheet('цель')],
      actionId: 'снаряд:0', fromId: 'маг', toId: 'цель',
    });
    eq(out.sheets.find(s => s.id === 'маг')!.values.ячейки, 2);
    eq(out.sheets.find(s => s.id === 'цель')!.values.хиты, 16);
    ok(out.reports.some(entry => entry.report.kind === 'cost'), 'отчёт цены есть');
  });

  test('на трёх целях ячейка всё равно одна: дорожка идёт до целей', () => {
    const out = exchange({
      ...world, sheets: [sheet('маг'), sheet('а'), sheet('б'), sheet('в')],
      actionId: 'снаряд:0', fromId: 'маг', toIds: ['а', 'б', 'в'],
    });
    eq(out.sheets.find(s => s.id === 'маг')!.values.ячейки, 2, 'дорожка сработала один раз');
    for (const id of ['а', 'б', 'в']) eq(out.sheets.find(s => s.id === id)!.values.хиты, 16);
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
    const out = exchange({ ...world, sheets: [empty, sheet('цель')], actionId: 'снаряд:0', fromId: 'маг', toId: 'цель' });
    eq(out.sheets.find(s => s.id === 'маг')!.values.ячейки, 0);
  });
});

group('в цене цель не названа', () => {
  const withSelf = (self: unknown[], params: unknown[] = [], args: Record<string, unknown> = {}) => ({
    ...system,
    effects: { ...system.effects, снаряд: { ...(system.effects as any).снаряд, cost: self, params: [...(system.effects as any).снаряд.params, ...params] } },
    tables: { ...system.tables, заклинание: { ...(system.tables as any).заклинание, bindings: [{ label: 'Снаряд', effect: 'снаряд', args }] } },
  }) as unknown as System;

  test('поле цели прямо в цене — ошибка словами, а не свой лист молча', () => {
    const sys = withSelf([{ type: 'apply', target: { expr: '@действующий.ячейки' }, direction: 'set', value: { expr: '@цель.хиты' } }]);
    throws(() => exchange({ system: sys, compendium, die: () => 1, sheets: [sheet('маг'), sheet('цель')], actionId: 'снаряд:0', fromId: 'маг', toId: 'цель' }), 'цель');
  });

  test('голое имя поля в цене — ошибка «чьё поле», а не свой лист молча', () => {
    const sys = withSelf([{ type: 'apply', target: { expr: '@действующий.ячейки' }, direction: 'subtract', value: { expr: '@хиты' } }]);
    throws(() => exchange({ system: sys, compendium, die: () => 1, sheets: [sheet('маг'), sheet('цель')], actionId: 'снаряд:0', fromId: 'маг', toId: 'цель' }), 'чьё поле');
  });
});

group('цена — только плата', () => {
  test('наложение эффекта в цене — предупреждение линта', async () => {
    const { lintSystem } = await import('../src/model/lint.ts');
    const sys = { ...system, effects: { ...system.effects, снаряд: { ...(system.effects as any).снаряд, cost: [{ type: 'status', mode: 'apply', effect: 'удар' }] } } } as unknown as System;
    ok(lintSystem(sys, compendium).some(p => p.level === 'warn' && p.text.includes('не плата')));
  });
});
