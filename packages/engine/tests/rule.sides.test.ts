import { group, test, eq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

// ЧЬИМ листом считается слагаемое — не деталь, а смысл.
//
// «Урон = кость + Мод Силы» — это Сила АТАКУЮЩЕГО. Если то же слагаемое
// переехать в выражение «ХП цели станет …», оно посчитается по листу ЦЕЛИ,
// то есть по Силе жертвы. Число получится другое, и молча.
//
// Отсюда и ответ на вопрос «почему кость и прибавка — одно число»: это
// то, что ОТПРАВИТЕЛЬ посчитал у себя и положил в конверт. Выражение же
// считает получатель.

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

const богатырь = { id: 'богатырь', values: { хп: 30, сила: 5 }, effects: [] };
const хиляк = { id: 'хиляк', values: { хп: 20, сила: 1 }, effects: [] };

const hit = (rule: any) => {
  const packed = packRule(rule, {
    system: sys, sheet: богатырь, params: {}, item: null,
    die: queue(4), pass: newPass(sys, богатырь, { compendium: { items: [] } }),
  } as any);
  return resolveRule(packed, {
    system: sys, sheet: хиляк, params: {}, item: null,
    die: queue(), pass: newPass(sys, хиляк, { compendium: { items: [] } }),
  } as any);
};

group('чей лист считает слагаемое', () => {
  test('прибавка ВНУТРИ числа считается отправителем — его Силой', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' }, bonus: { expr: '#сила' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { ref: 'урон' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, '20 − (4 + Сила БОГАТЫРЯ 5)');
  });

  test('та же прибавка В ВЫРАЖЕНИИ считается целью — её Силой', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '#хп - (#урон + #сила)', of: 'target' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 15, '20 − (4 + Сила ХИЛЯКА 1) — другое число, и молча');
  });

  test('число уезжает в конверте посчитанным: у получателя оно уже готово', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' }, bonus: { expr: '#сила' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '#хп - #урон', of: 'target' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, 'выражение цели берёт ГОТОВОЕ число отправителя');
  });
});
