import { group, test, eq, deepEq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

// «Тяжёлый доспех мешает красться» из D&D 5e, собранное так, как это
// делается в конструкторе кликами: помеха висит НА САМОЙ ВЕЩИ, а не
// правилом мира с флажком. В книге правил она так и записана — отдельной
// пометкой в строке доспеха, а не следствием его категории.
//
// Ни правила комнаты, ни поля-флажка, ни условия здесь нет: надел кольчугу —
// помеха есть, снял — нет.

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'срез-5e',
  fields: [
    // Тумблер «по этому полю бросают» на «Листе» — он и заводит мишень
    // «Проверка: Скрытность», на которую целится помеха.
    {
      tag: 'скрытность', label: 'Скрытность',
      value: { kind: 'stored', type: 'number', default: 3 },
      roll: { label: 'Проверка: Скрытность' },
    },
  ],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  roll_edits: {
    помеха: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] },
  },
  effects: {
    sneak: {
      label: 'Красться', activation: 'manual', params: [],
      steps: [{
        id: 'бросок', type: 'threshold',
        roll: { die: { constant: 'lead' }, bonus: { expr: '#скрытность' }, check: 'check:скрытность' },
        versus: { const: 15 },
      }],
    },
  },
};

const compendium: any = {
  items: [{
    id: 'кольчуга', rk: 'доспех', label: 'Кольчуга',
    modifiers: [{ kind: 'roll', target: 'check:скрытность', edit: 'помеха', condition: null }],
  }],
  actions: [],
};

const hero = (equipped: string[]) => ({ id: 'вор', values: { скрытность: 3 }, equipped, effects: [] });

const sneak = (equipped: string[], ...dice: number[]) => {
  const sheet = hero(equipped);
  const ctx = () => ({
    system: sys, sheet, params: {}, item: null,
    die: queue(...dice), pass: newPass(sys, sheet, { compendium }),
  });
  return resolveRule(packRule(sys.effects.sneak, ctx()), ctx());
};

group('тяжёлый доспех мешает красться', () => {
  test('без доспеха — одна кость', () => {
    const r = sneak([], 14);
    deepEq(r.trace[0].rolls, [14]);
    eq(r.results.бросок.total, 17, '14 плюс Скрытность 3');
    eq(r.results.бросок.success, true);
  });

  test('в кольчуге — две кости, берётся худшая', () => {
    const r = sneak(['кольчуга'], 14, 4);
    deepEq(r.trace[0].rolls, [14, 4], 'помеха приехала от самой вещи');
    eq(r.trace[0].kept, 4);
    eq(r.results.бросок.total, 7);
    eq(r.results.бросок.success, false, 'красться в кольчуге и правда тяжело');
  });

  test('снял кольчугу — помеха ушла сама, ничего не снимая с персонажа', () => {
    deepEq(sneak([], 14, 4).trace[0].rolls, [14]);
  });

  test('журнал называет правку именем автора', () => {
    deepEq(sneak(['кольчуга'], 14, 4).trace[0].edits, ['Помеха']);
  });

  test('на другие броски помеха не распространяется', () => {
    // Та же кольчуга, но проверка объявлена другой мишенью — «Любой бросок»
    // сюда не подмешан, потому что вещь целится в конкретную.
    const other: any = {
      ...sys,
      effects: {
        sneak: {
          ...sys.effects.sneak,
          steps: [{ ...sys.effects.sneak.steps[0], roll: { ...sys.effects.sneak.steps[0].roll, check: null } }],
        },
      },
    };
    const sheet = hero(['кольчуга']);
    const ctx = () => ({
      system: other, sheet, params: {}, item: null,
      die: queue(14, 4), pass: newPass(other, sheet, { compendium }),
    });
    const r = resolveRule(packRule(other.effects.sneak, ctx()), ctx());
    deepEq(r.trace[0].rolls, [14], 'это уже не проверка Скрытности');
  });
});
