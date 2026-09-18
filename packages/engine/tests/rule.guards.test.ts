import { group, test, eq, deepEq, throws } from './harness.ts';
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
  id: 'ветвление',
  fields: [
    { tag: 'хп', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20, min: 0 } },
    { tag: 'уровень', label: 'Уровень', value: { kind: 'stored', type: 'number', default: 3 } },
  ],
  rolls: [{ tag: 'спас', label: 'Спасбросок' }],
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  tables: { исход: { label: 'Исход', ranges: [
    { from: -100, to: 9, value: 'провал' }, { from: 10, to: 14, value: 'частичный' }, { from: 15, to: 100, value: 'полный' },
  ] } },
  effects: {},
};

const sender = { id: 'маг', values: { хп: 20, уровень: 6 }, effects: [] };
const target = { id: 'цель', values: { хп: 20, уровень: 3 }, effects: [] };

const play = (steps: any[], ...dice: number[]) => {
  const packed = packRule({ params: [], steps } as any, {
    system: sys, sheet: sender, pass: newPass(sys, sender, { compendium: { items: [] } }),
    die: queue(...dice), params: {}, props: null, owner: 'тест',
  });
  return resolveRule(packed, {
    system: sys, sheet: target, pass: newPass(sys, target, { compendium: { items: [] } }),
    die: queue(...dice), owner: 'тест',
  });
};

const save = { id: 'спас', type: 'threshold', side: 'target', continueOn: 'always',
  roll: { die: { constant: 'к20' }, bonus: { const: 0 }, check: 'спас' }, versus: { const: 12 } };

group('ветвление по исходу: стражи на шагах', () => {
  const halfOnSave = [
    save,
    { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 8 },
      when: { ref: 'спас.success', not: true } },
    { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 4 },
      when: { ref: 'спас.success' } },
  ];

  test('провалил спасбросок — полный урон, шаг «половина» пропущен', () => {
    const r = play(halfOnSave, 5);
    eq(r.sheet.values.хп, 12);
    eq(r.stopped, null, '«дальше всегда» не обрывает цепочку');
    deepEq(r.trace.map(t => Boolean(t.skipped)), [false, false, true]);
  });

  test('спасся — половина урона, шаг «полный» пропущен', () => {
    const r = play(halfOnSave, 18);
    eq(r.sheet.values.хп, 16);
    deepEq(r.trace.map(t => Boolean(t.skipped)), [false, true, false]);
  });

  test('страж по степени успеха: «is» сравнивает с ярлыком таблицы', () => {
    const graded = [
      { ...save, degrees: { table: 'исход', of: 'total' } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 10 },
        when: { ref: 'спас.degree', is: 'полный' } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 3 },
        when: { ref: 'спас.degree', is: 'частичный' } },
    ];
    eq(play(graded, 17).sheet.values.хп, 10, 'полный успех');
    eq(play(graded, 11).sheet.values.хп, 17, 'частичный');
    eq(play(graded, 2).sheet.values.хп, 20, 'провал — ни один шаг не сработал');
  });

  test('страж-формула отправителя упаковывается константой: цель её не пересчитывает', () => {
    const steps = [
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 5 },
        when: { expr: '#уровень >= 5' } },
    ];
    const packed = packRule({ params: [], steps } as any, {
      system: sys, sheet: sender, pass: newPass(sys, sender, { compendium: { items: [] } }),
      die: queue(), params: {}, props: null, owner: 'тест',
    });
    deepEq(packed[0]!.when, { const: true }, 'у мага шестой уровень');
    eq(play(steps).sheet.values.хп, 15);
  });

  test('страж-формула цели считается её листом', () => {
    const steps = [
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 5 },
        when: { expr: '#уровень >= 5', of: 'target' } },
    ];
    eq(play(steps).sheet.values.хп, 20, 'у цели третий уровень — шаг пропущен');
  });

  test('страж, дающий не да/нет, — внятная ошибка', () => {
    const steps = [
      { id: 'n', type: 'amount', source: 'item', fixed: { const: 3 } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 5 }, when: { ref: 'n' } },
    ];
    throws(() => play(steps), 'да/нет');
  });

  test('шаг без стража работает как раньше — совместимость с мирами до ветвления', () => {
    eq(play([{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { const: 1 } }]).sheet.values.хп, 19);
  });
});
