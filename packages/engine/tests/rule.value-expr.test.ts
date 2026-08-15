import { group, test, eq, throws } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

// «Чем поле станет» — обычное математическое выражение.
//
// Мешало ровно одно: кость бросает ОТПРАВИТЕЛЬ (при упаковке), а формулу
// считает лист ПОЛУЧАТЕЛЯ, и брошенного числа у формулы не было — отсюда
// и разделение на «направление» и «величину». Теперь результат шага виден
// формуле под своим именем, и «ХП − (кость + мод)» пишется как есть.

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'выражения',
  fields: [
    { tag: 'хп', label: 'Текущие ХП', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'максхп', label: 'Максимум ХП', value: { kind: 'stored', type: 'number', default: 30 } },
    { tag: 'сила', label: 'Мод Силы', value: { kind: 'stored', type: 'number', default: 3 } },
  ],
  effects: {},
};

const sheet = { id: 'цель', values: { хп: 20, максхп: 30, сила: 3 }, effects: [] };

const run = (expr: string, ...dice: number[]) => {
  const rule: any = {
    steps: [
      { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr, of: 'target' } },
    ],
  };
  const ctx = () => ({
    system: sys, sheet, params: {}, item: null,
    die: queue(...dice), pass: newPass(sys, sheet, { compendium: { items: [] } }),
  });
  return resolveRule(packRule(rule, ctx()), ctx());
};

group('новое значение поля — выражение', () => {
  test('поле минус брошенная кость: имя шага работает как имя поля', () => {
    eq(run('#хп - #урон', 5).sheet.values.хп, 15, '20 − 5');
  });

  test('вычесть сумму: скобки считаются, а не подразумеваются', () => {
    eq(run('#хп - (#урон + #сила)', 5).sheet.values.хп, 12, '20 − (5 + 3)');
  });

  test('знаки внутри выражения работают как в математике, а не «направлением»', () => {
    eq(run('#хп - #урон + #сила', 5).sheet.values.хп, 18, '20 − 5 + 3 — ровно как написано');
  });

  test('поле в выражении не обязательно: «станет 0»', () => {
    eq(run('0', 5).sheet.values.хп, 0);
  });

  test('и «станет максимумом» — лечение до полного', () => {
    eq(run('#максхп', 5).sheet.values.хп, 30);
  });

  test('делить тоже можно: половина от максимума', () => {
    eq(run('#максхп / 2', 5).sheet.values.хп, 15);
  });

  test('поле важнее шага: одноимённое поле не подменяется результатом', () => {
    const collide: any = {
      ...sys,
      fields: [...sys.fields, { tag: 'урон', label: 'Урон в листе', value: { kind: 'stored', type: 'number', default: 100 } }],
    };
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '#урон', of: 'target' } },
      ],
    };
    const sh = { ...sheet, values: { ...sheet.values, урон: 100 } };
    const ctx = () => ({
      system: collide, sheet: sh, params: {}, item: null,
      die: queue(5), pass: newPass(collide, sh, { compendium: { items: [] } }),
    });
    const r = resolveRule(packRule(rule, ctx()), ctx());
    eq(r.sheet.values.хп, 100, 'считалось поле, а не шаг: переименование шага не меняет смысл формул');
  });

  test('имя, которого нет ни у поля, ни у шага, — внятная ошибка', () => {
    throws(() => run('#нетакого', 5), 'нетакого');
  });
});
