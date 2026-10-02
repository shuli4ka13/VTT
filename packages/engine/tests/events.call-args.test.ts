import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'общий-кусок', name: 'общий кусок',
  tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 40, min: 0 }] } , оружие: {
      shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      bindings: [{ label: 'Удар', effect: 'меч', args: { кость: { prop: 'кость' } } }],
    }, чары: { shape: 'book', use: 'action', label: 'Чары', columns: [], bindings: [{ label: 'Сотворить', effect: 'шар', args: {} }] } },
  effects: {
    урон_костями: {
      label: 'Урон костями',
      tags: ['рубящий', 'огонь'],
      params: [
        { key: 'лист', label: 'Лист', kind: 'sheet' },
        { key: 'кость', label: 'Кость', kind: 'dice' },
        { key: 'сколько', label: 'Сколько костей', kind: 'number' },
      ],
      steps: [
        { id: 'н', type: 'roll', fixed: { expr: 'кинуть(@кость, @сколько)' } },
        { type: 'apply', target: { expr: '@лист.хп' }, direction: 'subtract', value: { expr: '@н' } },
      ],
    },
    меч: {
      label: 'Удар мечом', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }, { key: 'кость', label: 'Кость урона', kind: 'dice' }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'emit', event: 'урон_костями', args: { лист: { expr: '@цель' }, кость: { expr: '@кость' }, сколько: { const: 2 } } }],
    },
    шар: {
      label: 'Огненный шар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'emit', event: 'урон_костями', args: { лист: { expr: '@цель' }, кость: { const: '1d6' }, сколько: { const: 8 } } }],
    },
  },
  
} as unknown as System;

const compendium = {
  records: [{ id: 'секира', table: 'оружие', label: 'Секира', cells: { кость: '1d12' } }, { id: 'шар', table: 'чары', label: 'Огненный шар', cells: {} }],
} as unknown as Compendium;

const sheet = (id: string): Sheet => ({
  id, systemId: 'общий-кусок', name: id,
  values: {}, has: [{ of: 'секира' }, { of: 'шар' }], effects: []
} as unknown as Sheet);

const sidesSeen: number[] = [];

const hit = (actionId: string, die: number, sys: System = system) => {
  const out = exchange({ system: sys, compendium, die: sides => { sidesSeen.push(sides); return die; }, sheets: [sheet('бьёт'), sheet('получает')], actionId, fromId: 'бьёт', toId: 'получает' });
  return { sheet: out.sheets.find(s => s.id === 'получает')!, report: out.reports[0]!.report };
};

group('вызов передаёт вызванному его входы', () => {
  test('один эффект «Урон костями» обслуживает и меч, и заклинание', () => {
    const мечом = hit('секира:0', 4);
    eq(мечом.sheet.values.хп, 40 - 4 * 2, 'две кости по записи оружия');

    const шаром = hit('шар:0', 4);
    eq(шаром.sheet.values.хп, 40 - 4 * 8, 'восемь костей, заданных в самом вызове');
  });

  test('кость приезжает с листа отправителя, а не берётся у цели', () => {
    sidesSeen.length = 0;
    const { report } = hit('секира:0', 6);
    eq(JSON.stringify(sidesSeen), '[12,12]', 'грани берутся из записи оружия');
    const число = report.trace.find((t: Record<string, unknown>) => Array.isArray(t.rolls) && t.fixed !== undefined) as Record<string, unknown>;
    ok(число, JSON.stringify(report.trace));
    eq(JSON.stringify(число.rolls), '[6,6]', 'кость 1d12 из записи, брошенная дважды');
    eq(число.total, 12);
  });

  test('незаполненная вход вызванного — внятная ошибка, а не тихий ноль', () => {
    const дырявый = {
      ...system,
      effects: {
        ...system.effects,
        шар: { label: 'Огненный шар', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }], steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'emit', event: 'урон_костями', args: { лист: { expr: '@цель' } } }] },
      },
    } as unknown as System;
    const беда = throws(() => hit('шар:0', 5, дырявый));
    ok(String(беда.message).includes('«кость»'), String(беда.message));
  });
});
