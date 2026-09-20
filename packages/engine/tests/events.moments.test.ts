import { group, test, eq, ok, throws } from './harness.ts';
import { fireMoments, momentOf, MOMENTS } from '../src/events/moments.ts';
import type { System, Sheet, Effect } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'яд', label: 'Отравлен', value: { kind: 'stored', type: 'boolean', default: false } },
  ],
  effects: {
    отравление: {
      label: 'Отравление', activation: 'triggered',
      trigger: { on: 'moment:turn-start' },
      steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 3 } }],
    },
    передышка: {
      label: 'Передышка', activation: 'triggered',
      trigger: { on: 'moment:turn-end' },
      steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'add', value: { const: 1 } }],
    },
    кнопка: { label: 'Кнопка', activation: 'manual', steps: [] },
  },
} as unknown as System;

const sheet = (worn: string[], values: Record<string, unknown> = {}): Sheet => ({
  id: 'а', systemId: 'x', kind: 'pc', name: 'Арвен',
  values: { хиты: 20, яд: false, ...values },
  equipped: [], actions: [], effects: worn.map(effectId => ({ effectId })),
} as unknown as Sheet);

const world = { system, compendium: { items: [], actions: [] }, die: () => 3 };

group('шина моментов', () => {
  test('момент разбирается по имени, чужое слово — не момент', () => {
    eq(momentOf('moment:turn-start'), 'turn-start');
    eq(momentOf('moment:нет-такого'), null);
    eq(momentOf('event:damage'), null);
    eq(momentOf(undefined), null);
    ok(Object.keys(MOMENTS).length >= 8);
  });

  test('яд в начале хода списывает хиты у того, на ком висит', () => {
    const sheets = [sheet(['отравление']), { ...sheet([]), id: 'б', name: 'Мирра' }];
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }], sheets, world as never);
    eq(out.sheets.find(s => s.id === 'а')!.values.хиты, 17);
    eq(out.sheets.find(s => s.id === 'б')!.values.хиты, 20, 'на другом листе ничего не сработало');
    eq(out.reports.length, 1);
    eq(out.reports[0]!.report.kind, 'moment');
  });

  test('чужой момент не будит слушателя другого момента', () => {
    const out = fireMoments([{ moment: 'turn-end', sheetId: 'а' }], [sheet(['отравление'])], world as never);
    eq(out.sheets[0]!.values.хиты, 20);
    eq(out.reports.length, 0);
  });

  test('на одном листе срабатывают все подходящие, по очереди', () => {
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }],
      [sheet(['отравление', 'отравление'])], world as never);
    eq(out.sheets[0]!.values.хиты, 14);
    eq(out.reports.length, 2);
  });

  test('условие на срабатывании проверяется', () => {
    const picky = structuredClone(system) as System;
    (picky.effects.отравление as Effect).trigger = {
      on: 'moment:turn-start', condition: { expr: '#яд' },
    } as never;
    const ctx = { ...world, system: picky };
    eq(fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['отравление'])], ctx as never)
      .sheets[0]!.values.хиты, 20, 'яда нет — молчит');
    eq(fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['отравление'], { яд: true })], ctx as never)
      .sheets[0]!.values.хиты, 17, 'яд есть — сработало');
  });

  test('бесконечный каскад обрывается внятной ошибкой', () => {
    const many = Array.from({ length: 40 }, () => 'отравление');
    throws(() => fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(many)], world as never),
      'без остановки');
  });

  test('активируемый эффект моментом не будится', () => {
    const manual = structuredClone(system) as System;
    (manual.effects.кнопка as Effect).trigger = { on: 'moment:turn-start' } as never;
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['кнопка'])],
      { ...world, system: manual } as never);
    eq(out.reports.length, 0);
  });
});
