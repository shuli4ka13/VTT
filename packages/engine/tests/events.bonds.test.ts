import { group, test, eq, ok } from './harness.ts';
import { sweepBonds } from '../src/events/bonds.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  fields: [{ tag: 'бонус', label: 'Бонус', value: { kind: 'stored', type: 'number', default: 0 } }],
  effects: {
    благословение: {
      label: 'Благословение', activation: 'manual', bond: true,
      steps: [{ type: 'status', mode: 'apply', effect: { const: 'благословлён' } }],
    },
    благословлён: {
      label: 'Благословлён', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'value', target: 'бонус', op: 'add', value: { expr: '2' }, stacking: 'sum' }],
    },
  },
  records: {
    молитва: { kind: 'action', label: 'Молитва', props: [], bindings: [{ label: 'Благословение', effect: 'благословение', args: {} }] },
  },
} as unknown as System;

const compendium = { records: [{ id: 'молитва', rk: 'молитва', label: 'Молитва', props: {} }] } as unknown as Compendium;

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
    eq(worn[0]!.from, 'жрец');
    eq(worn[0]!.by, 'благословение');
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
    const bonded = { effectId: 'благословлён', from: 'жрец', by: 'благословение' };
    const sheets = [
      sheet('жрец', [{ effectId: 'благословение' }]),
      sheet('воин', [bonded]), sheet('лучник', [bonded]),
    ];
    const out = sweepBonds(system, sheets);
    eq(out.broken.length, 0);
    out.sheets.forEach((sheet, at) => eq(sheet, sheets[at], 'лист не переписан'));
  });

  test('источник снят — связанное спадает со всех и названо', () => {
    const bonded = { effectId: 'благословлён', from: 'жрец', by: 'благословение' };
    const out = sweepBonds(system, [sheet('жрец'), sheet('воин', [bonded]), sheet('лучник', [bonded])]);
    eq(out.broken.length, 2);
    ok(out.broken.every(b => b.effectId === 'благословлён' && b.from === 'жрец'));
    eq(out.sheets.find(s => s.id === 'воин')!.effects!.length, 0);
    eq(out.sheets.find(s => s.id === 'лучник')!.effects!.length, 0);
  });

  test('несвязанное не трогают', () => {
    const sheets = [sheet('воин', [{ effectId: 'благословлён' }])];
    eq(sweepBonds(system, sheets).broken.length, 0);
  });

  test('эффект без bond связей не заводит', () => {
    const plain = structuredClone(system) as System;
    delete (plain.effects.благословение as { bond?: boolean }).bond;
    const out = exchange({
      system: plain, compendium, die: () => 1, sheets: [sheet('жрец'), sheet('воин')],
      actionId: 'молитва:0', fromId: 'жрец', toId: 'воин',
    });
    const worn = out.sheets.find(s => s.id === 'воин')!.effects![0]!;
    eq(worn.from, undefined);
    eq(worn.by, undefined);
  });
});
