import { group, test, eq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'стороны',
  fields: [
    { tag: 'хп', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'сила', label: 'Мод Силы', value: { kind: 'stored', type: 'number', default: 0 } },
  ],
  effects: {},
};

const атакующий = { id: 'атакующий', values: { хп: 30, сила: 5 }, effects: [] };
const цель = { id: 'цель', values: { хп: 20, сила: 1 }, effects: [] };

const hit = (rule: any) => {
  const packed = packRule(rule, {
    system: sys, sheet: атакующий, params: {}, item: null,
    die: queue(4), pass: newPass(sys, атакующий, { compendium: { records: [] } }),
  } as any);
  return resolveRule(packed, {
    system: sys, sheet: цель, params: {}, item: null,
    die: queue(), pass: newPass(sys, цель, { compendium: { records: [] } }),
  } as any);
};

group('чей лист считает слагаемое', () => {
  test('прибавка ВНУТРИ числа считается отправителем — его Силой', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' }, bonus: { expr: '#сила' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, '20 − (4 + Сила АТАКУЮЩЕГО 5)');
  });

  test('та же прибавка В ВЫРАЖЕНИИ считается целью — её Силой', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '@получатель.хп - (#урон + @получатель.сила)' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 15, '20 − (4 + Сила ЦЕЛИ 1) — другое число, и молча');
  });

  test('имя с хозяином «отправитель» берёт его Силу', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set',
          value: { expr: '@получатель.хп - (#урон + @отправитель.сила)' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, '20 − (4 + Сила АТАКУЮЩЕГО 5): та же формула, другая сторона');
  });

  test('в одном выражении живут оба листа', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set',

          value: { expr: '@получатель.хп - #урон - @отправитель.сила + @отправитель.сила' } },
      ],
    };

    eq(hit(rule).sheet.values.хп, 16, '20 − 4 − 5 + 5: оба вхождения имени считает отправитель');
  });

  test('число уезжает в конверте посчитанным: у получателя оно уже готово', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' }, bonus: { expr: '#сила' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '@получатель.хп - #урон' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, 'выражение цели берёт ГОТОВОЕ число отправителя');
  });
});
