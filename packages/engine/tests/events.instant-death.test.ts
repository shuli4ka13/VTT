import { group, test, eq, deepEq } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';

// Мгновенная смерть 5e — базовое правило: если урон пробил бы НИЖЕ нуля
// на величину, не меньшую максимума хитов, — смерть, а не 0 хитов.
//
// В модели это РЕАКЦИЯ НА СЕБЯ (trigger.to: 'self'): жертва слушает удар,
// читает его перебор (результат шага «урон» по имени), сравнивает со СВОИМ
// максимумом и вешает на себя состояние. Отправитель об этом правиле не
// знает вовсе — оно лежит в правилах комнаты жертвы, как в книге правил.

const sys: any = {
  id: 'мгновенная-смерть',
  fields: [
    { tag: 'хп', label: 'Текущие ХП', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
    { tag: 'хп_макс', label: 'Максимум ХП', value: { kind: 'stored', type: 'number', default: 1 } },
  ],
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'величина', label: 'Урон', kind: 'number' }],
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d1' }, bonus: { param: 'величина' } },
        { id: 'рана', type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { ref: 'урон' } },
      ],
    },
    мгновенная_смерть: {
      label: 'Мгновенная смерть', activation: 'triggered',
      trigger: { on: 'удар', to: 'self' },
      steps: [
        // Перебор события — по имени его шага; максимум — мой собственный.
        { type: 'compare', value: { ref: 'рана.overkill' }, versus: { expr: '#хп_макс', of: 'target' }, breakIf: 'less' },
        { type: 'status', mode: 'apply', effect: { const: 'мёртв' } },
      ],
    },
    мёртв: { label: 'Мёртв', activation: 'passive' },
  },
  room_rules: ['мгновенная_смерть'],
};

const compendium: any = {
  items: [],
  actions: [{ id: 'strike', rk: 'приём', label: 'Удар', effect: 'удар', args: { величина: 0 } }],
};

const hit = (величина: number, хп: number, хп_макс: number) => {
  const бьющий = { id: 'бьющий', values: { хп: 30, хп_макс: 30 }, effects: [] };
  const жертва = { id: 'жертва', values: { хп, хп_макс }, effects: [] };
  const book = { ...compendium, actions: [{ ...compendium.actions[0], args: { величина } }] };
  const env = send('strike:0', {
    system: sys, sheet: бьющий, compendium: book, die: () => 1, toId: 'жертва',
  } as any);
  return receive(env, { system: sys, sheet: жертва, compendium: book, die: () => 1 } as any);
};

const dead = (out: any) => (out.sheet.effects ?? []).some((e: any) => e.effectId === 'мёртв');

group('мгновенная смерть — реакция на себя', () => {
  test('перебор меньше максимума: без сознания, но жив (0 хитов)', () => {
    // 6 хитов, максимум 12, урон 1+9=10: перебор 4 < 12.
    const out = hit(9, 6, 12);
    eq(out.sheet.values.хп, 0);
    eq(dead(out), false);
  });

  test('перебор с максимум: смерть на месте', () => {
    // 6 хитов, максимум 12, урон 1+19=20: перебор 14 ≥ 12.
    const out = hit(19, 6, 12);
    eq(out.sheet.values.хп, 0);
    eq(dead(out), true, 'состояние «Мёртв» повешено самой жертвой');
  });

  test('реакция видна в отчёте события — журнал расскажет, что убило', () => {
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
    // Реакция не спрятана: журнал говорит «проверилось — не прошло»,
    // тем же словом, что любой оборвавшийся конвейер.
    eq((out.report.reactions ?? [])[0]?.stopped?.reason, 'compare-short');
  });

});
