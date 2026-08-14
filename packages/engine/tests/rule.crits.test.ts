import { group, test, eq, deepEq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

// Криты и глитчи собирает АВТОР, а не движок: слов «крит» и «провал» в
// движке нет. Есть счёт по натурально выпавшему — кинуто, на максимуме,
// на единице, — и обычное сравнение поверх него.
//
//   5e:        «натуральная 20» — на максимуме не меньше 1
//   Blades:    «две шестёрки»  — на максимуме не меньше 2
//   Shadowrun: глитч            — единиц не меньше N

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'криты',
  fields: [],
  rolls: [{ tag: 'проверка', label: 'Проверка' }],
  constants: {
    пул: { label: 'Пул', kind: 'die', dice: [{ count: 3, sides: 6 }], read: 'best' },
  },
  effects: {},
};

const sheet = { id: 'герой', values: {}, effects: [] };

// Порог бросает пул, а следом сравнение решает, крит ли это: «костей
// на максимуме» против двух. Оба шага уже существовали — новое только то,
// что счёт стало ВИДНО.
const rule: any = {
  steps: [
    {
      id: 'roll', type: 'threshold',
      roll: { die: { constant: 'пул' }, bonus: { const: 0 }, check: 'проверка' },
      versus: { const: 4 },
    },
    { id: 'крит', type: 'compare', value: { ref: 'roll.atMax' }, versus: { const: 2 }, breakIf: 'less' },
  ],
};

const run = (...dice: number[]) => {
  const ctx = () => ({
    system: sys, sheet, params: {}, item: null,
    die: queue(...dice), pass: newPass(sys, sheet, { compendium: { items: [] } }),
  });
  return resolveRule(packRule(rule, ctx()), ctx());
};

group('криты и глитчи собираются автором', () => {
  test('счёт по натуральному броску виден в результате шага', () => {
    const r = run(6, 6, 3);
    eq(r.results.roll.rolled, 3, 'кинуто три кости');
    eq(r.results.roll.atMax, 2, 'две шестёрки');
    eq(r.results.roll.atMin, 0);
  });

  test('две шестёрки — цепочка идёт дальше (крит Blades)', () => {
    const r = run(6, 6, 3);
    eq(r.stopped, null, 'сравнение пропустило: на максимуме две');
  });

  test('одна шестёрка — цепочка обрывается: крита нет', () => {
    const r = run(6, 2, 3);
    eq(r.results.roll.atMax, 1);
    eq(Boolean(r.stopped), true, 'до крита не дошло');
  });

  test('единицы считаются отдельно — из них собирается глитч', () => {
    const r = run(1, 1, 5);
    eq(r.results.roll.atMin, 2);
    eq(r.results.roll.rolled, 3, 'половину пула сравнивать уже есть с чем');
  });

  test('счёт снят с НАТУРАЛЬНОГО броска, до правок результата', () => {
    // Взрыв уносит значение за грани, и «выпал максимум» после него
    // не прочесть — потому tally и снимается раньше.
    const explosive: any = {
      ...sys,
      roll_edits: { взрыв: { label: 'Взрыв', ops: [{ op: 'explode' }] } },
      effects: {
        всегда: {
          label: 'Взрывные кости', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'roll', target: 'проверка', edit: 'взрыв', condition: null }],
        },
      },
    };
    const hot = { ...sheet, effects: [{ effectId: 'всегда' }] };
    const ctx = () => ({
      system: explosive, sheet: hot, params: {}, item: null,
      die: queue(6, 2, 3, 4), pass: newPass(explosive, hot, { compendium: { items: [] } }),
    });
    const r = resolveRule(packRule(rule, ctx()), ctx());
    eq(r.results.roll.atMax, 1, 'шестёрка была одна, хоть и выросла до десяти');
    deepEq(r.results.roll.dice.rolls, [10, 2, 3], 'в журнале — уже выросшая');
  });
});
