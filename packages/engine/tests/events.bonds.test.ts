import { group, test, eq, ok, deepEq } from './harness.ts';
import { sweepBonds } from '../src/events/bonds.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [{ key: 'бонус', label: 'Бонус', kind: 'number' }] } , молитва: { shape: 'book', use: 'action', label: 'Молитва', columns: [], bindings: [{ label: 'Благословение', effect: 'благословение', args: {} }] } },
  effects: {
    благословение: {
      label: 'Благословение', activation: 'manual', bond: { effect: 'благословение', by: 'действующий' },
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'status', mode: 'apply', effect: 'благословлён', to: { expr: '@цель' } }],
    },
    благословлён: {
      label: 'Благословлён', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'value', target: 'бонус', op: 'add', value: { expr: '2' } }],
    },
  },
  
} as unknown as System;

const compendium = { records: [{ id: 'молитва', table: 'молитва', label: 'Молитва', cells: {} }] } as unknown as Compendium;

const sheet = (id: string, effects: object[] = []): Sheet => ({
  id, systemId: 'x', name: id, values: {}, has: [{ of: 'молитва' }], effects,
} as unknown as Sheet);

group('эффект, который держится другим эффектом', () => {
  test('наложенное записывает, кто и чем его держит', () => {
    const out = exchange({
      system, compendium, die: () => 1, sheets: [sheet('жрец'), sheet('воин')],
      actionId: 'молитва:0', fromId: 'жрец', toId: 'воин',
    });
    const worn = out.sheets.find(s => s.id === 'воин')!.effects!;
    eq(worn.length, 1);
    eq(worn[0]!.effectId, 'благословлён');
    deepEq(worn[0]!.bond, { sheet: 'жрец', effect: 'благословение' });
  });

  test('заклинатель сам получает пометку концентрации — иначе связанное спало бы сразу', () => {
    const out = exchange({
      system, compendium, die: () => 1, sheets: [sheet('жрец'), sheet('воин')],
      actionId: 'молитва:0', fromId: 'жрец', toId: 'воин',
    });
    const caster = out.sheets.find(s => s.id === 'жрец')!;
    eq((caster.effects ?? []).map(e => e.effectId).join(','), 'благословение');
    eq(sweepBonds(system, out.sheets).broken.length, 0, 'пока держит — ничего не спадает');
  });

  test('пока жрец носит источник — связанное держится на всех', () => {
    const bonded = { effectId: 'благословлён', bond: { sheet: 'жрец', effect: 'благословение' } };
    const sheets = [
      sheet('жрец', [{ effectId: 'благословение' }]),
      sheet('воин', [bonded]), sheet('лучник', [bonded]),
    ];
    const out = sweepBonds(system, sheets);
    eq(out.broken.length, 0);
    out.sheets.forEach((sheet, at) => eq(sheet, sheets[at], 'лист не переписан'));
  });

  test('источник снят — связанное спадает со всех и названо', () => {
    const bonded = { effectId: 'благословлён', bond: { sheet: 'жрец', effect: 'благословение' } };
    const out = sweepBonds(system, [sheet('жрец'), sheet('воин', [bonded]), sheet('лучник', [bonded])]);
    eq(out.broken.length, 2);
    ok(out.broken.every(b => b.effectId === 'благословлён' && b.from === 'жрец' && b.holder === 'благословение'));
    eq(out.sheets.find(s => s.id === 'воин')!.effects!.length, 0);
    eq(out.sheets.find(s => s.id === 'лучник')!.effects!.length, 0);
  });

  test('несвязанное не трогают', () => {
    const sheets = [sheet('воин', [{ effectId: 'благословлён' }])];
    eq(sweepBonds(system, sheets).broken.length, 0);
  });

  test('эффект без bond связей не заводит', () => {
    const plain = structuredClone(system) as System;
    delete (plain.effects.благословение as { bond?: unknown }).bond;
    const out = exchange({
      system: plain, compendium, die: () => 1, sheets: [sheet('жрец'), sheet('воин')],
      actionId: 'молитва:0', fromId: 'жрец', toId: 'воин',
    });
    const worn = out.sheets.find(s => s.id === 'воин')!.effects![0]!;
    eq(worn.bond, undefined);
  });
});

group('держание с условием: концентрация — галочкой заклинания', () => {
  const held = (holds: string): System => {
    const copy = JSON.parse(JSON.stringify(system)) as System & { effects: Record<string, any>; tables: Record<string, any> };
    copy.effects.благословение.bond = { effect: 'благословение', by: 'действующий', if: { expr: '@держит' } };
    copy.effects.благословение.params.push({ key: 'держит', kind: 'boolean', default: false });
    copy.tables.молитва.bindings = [{ label: 'Благословение', effect: 'благословение', args: { держит: { expr: holds } } }];
    return copy;
  };
  const cast = (s: System) => exchange({ system: s, compendium, die: () => 1, sheets: [sheet('жрец'), sheet('воин')], actionId: 'молитва:0', fromId: 'жрец', toId: 'воин' });

  test('держится — наложенное связано с заклинателем', () => {
    const out = cast(held('true'));
    deepEq(out.sheets.find(s => s.id === 'воин')!.effects![0]!.bond, { sheet: 'жрец', effect: 'благословение' });
  });

  test('не держится — наложено без связи, заклинателю пометки нет', () => {
    const out = cast(held('false'));
    eq(out.sheets.find(s => s.id === 'воин')!.effects![0]!.bond, undefined);
    eq((out.sheets.find(s => s.id === 'жрец')!.effects ?? []).length, 0);
  });
});
