import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from './play.ts';

const sys: any = {
  id: 'мгновенная-смерть',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Текущие ХП', kind: 'number', default: 1, min: 0 },
    { key: 'хп_макс', label: 'Максимум ХП', kind: 'number', default: 1 },
  ] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }, { key: 'величина', label: 'Урон', kind: 'number' }],
      steps: [
        { type: 'each', of: 'цели', as: 'цель' },
        { id: 'урон', type: 'roll', die: { const: '1d1' }, bonus: { expr: '@величина' } },
        { id: 'рана', type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    мгновенная_смерть: {
      label: 'Мгновенная смерть', activation: 'passive',
      on: [{ on: 'after:удар', if: { expr: '@цель == @носитель' }, steps: [
        { type: 'check', value: { expr: '@рана.overkill' }, versus: { expr: '@носитель.хп_макс' }, successWhen: 'atLeast', continueOn: 'success' },
        { type: 'status', mode: 'apply', effect: { const: 'мёртв' }, to: { expr: '@носитель' } },
      ] }],
    },
    мёртв: { label: 'Мёртв', activation: 'passive' },
  },
  grants: ['мгновенная_смерть'],
};

const compendium: any = {
  records: [{ id: 'strike', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: { величина: 0 } }] }],
};

const hit = (величина: number, хп: number, хп_макс: number) => {
  const бьющий = { id: 'бьющий', values: { хп: 30, хп_макс: 30 }, effects: [] };
  const жертва = { id: 'жертва', values: { хп, хп_макс }, effects: [] };
  const first = compendium.records[0];
  const book = { ...compendium, records: [{ ...first, bindings: [{ ...first.bindings[0], args: { величина } }] }] };
  const out = exchange({ system: sys, compendium: book, die: () => 1, sheets: [бьющий, жертва] as any, actionId: 'strike:0', fromId: 'бьющий', toId: 'жертва' });
  return { ...out, sheet: out.sheets.find(s => s.id === 'жертва')!, report: out.reports[0]!.report } as any;
};

const dead = (out: any) => (out.sheet.effects ?? []).some((e: any) => e.effectId === 'мёртв');

group('мгновенная смерть — реакция на себя', () => {
  test('перебор меньше максимума: без сознания, но жив (0 хитов)', () => {

    const out = hit(9, 6, 12);
    eq(out.sheet.values.хп, 0);
    eq(dead(out), false);
  });

  test('перебор с максимум: смерть на месте', () => {

    const out = hit(19, 6, 12);
    eq(out.sheet.values.хп, 0);
    eq(dead(out), true, 'состояние «Мёртв» повешено самой жертвой');
  });

  test('реакция видна в отчёте вызова — журнал расскажет, что убило', () => {
    const out = hit(19, 6, 12);
    const reaction = (out.report.reactions ?? [])[0];
    eq(reaction?.label, 'Мгновенная смерть');
    deepEq(reaction?.effects, ['мёртв']);
  });

  test('реакция — не ответка: обратного конверта не рождается', () => {
    const out = hit(19, 6, 12);
    eq(out.reports.length, 1, 'реакция на себя новых отчётов-ответок не рождает');
  });

  test('без перебора реакция обрывается на сравнении — и это видно', () => {
    const out = hit(2, 6, 12);
    eq(out.sheet.values.хп, 3, '6 − (1+2)');
    eq(dead(out), false);

    eq((out.report.reactions ?? [])[0]?.stopped?.reason, 'check-miss');
  });

});
