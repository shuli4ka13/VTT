import { group, test, eq, deepEq } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';

const sys: any = {
  id: 'мгновенная-смерть',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Текущие ХП', kind: 'number', default: 1, min: 0 },
    { key: 'хп_макс', label: 'Максимум ХП', kind: 'number', default: 1 },
  ] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'величина', label: 'Урон', kind: 'number' }],
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d1' }, bonus: { expr: '@величина' } },
        { id: 'рана', type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    мгновенная_смерть: {
      label: 'Мгновенная смерть', activation: 'passive',
      on: [{ on: 'affected', of: 'удар', steps: [

        { type: 'compare', value: { expr: '@рана.overkill' }, versus: { expr: '@получатель.хп_макс' }, breakIf: 'less' },
        { type: 'status', mode: 'apply', effect: { const: 'мёртв' } },
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
  const env = send('strike:0', {
    system: sys, sheet: бьющий, compendium: book, die: () => 1, toId: 'жертва',
  } as any);
  return receive(env, { system: sys, sheet: жертва, compendium: book, die: () => 1 } as any);
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
    deepEq(out.replies, [], 'каскад не тронут: реакция на себя конверта не шлёт');
  });

  test('без перебора реакция обрывается на сравнении — и это видно', () => {
    const out = hit(2, 6, 12);
    eq(out.sheet.values.хп, 3, '6 − (1+2)');
    eq(dead(out), false);

    eq((out.report.reactions ?? [])[0]?.stopped?.reason, 'compare-short');
  });

});
