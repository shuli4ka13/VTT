import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { resolveRoll } from '../src/engine/modifiers.ts';

const sys: any = {
  id: 'рода-с-модификаторами',
  fields: [
    { tag: 'скрытность', label: 'Скрытность', value: { kind: 'stored', type: 'number', default: 3 },
      roll: { label: 'Проверка: Скрытность', tags: ['скрытность'] } },
    { tag: 'кд', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } },
  ],
  roll_edits: { помеха: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] } },
  records: {
    тяжёлый: {
      kind: 'item', label: 'Тяжёлый доспех',
      props: [], bindings: [],

      modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['скрытность'], edit: 'помеха', condition: null }],
    },
    лёгкий: { kind: 'item', label: 'Лёгкий доспех', props: [], bindings: [] },
    кольцо: {
      kind: 'item', label: 'Кольцо', props: [], bindings: [],
      modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: 1, stacking: 'sum', condition: null }],
    },
  },
  effects: {},
};

const compendium: any = {
  records: [{ id: 'кольчуга', rk: 'тяжёлый', label: 'Кольчуга' }, { id: 'латы', rk: 'тяжёлый', label: 'Латы' }, { id: 'кожа', rk: 'лёгкий', label: 'Кожаный доспех' }, { id: 'кольцо1', rk: 'кольцо', label: 'Кольцо защиты' }, { id: 'кольцо2', rk: 'кольцо', label: 'Кольцо стража' }],
};

const hero = (equipped: string[]) => ({ id: 'вор', values: { скрытность: 3, кд: 10 }, has: [...equipped.map(of => ({ of }))], effects: [] });
const pass = (equipped: string[]) => newPass(sys, hero(equipped), { compendium });
const edits = (equipped: string[]) =>
  resolveRoll(sys, hero(equipped), ['скрытность'], pass(equipped)).edits.map(e => e.label);

group('модификаторы рода', () => {
  test('надел кольчугу — помеха от РОДА, хотя на самой вещи ничего не написано', () => {
    deepEq(edits(['кольчуга']), ['Помеха']);
  });

  test('другая вещь того же рода — та же помеха, писать второй раз не надо', () => {
    deepEq(edits(['латы']), ['Помеха']);
  });

  test('вещь другого рода помехи не даёт', () => {
    deepEq(edits(['кожа']), []);
  });

  test('снял всё — помехи нет', () => {
    deepEq(edits([]), []);
  });

  test('источник назван родом: игроку видно, откуда прилетело', () => {
    const roll = resolveRoll(sys, hero(['кольчуга']), ['скрытность'], pass(['кольчуга']));
    const source = (roll.sources[0] ?? {}) as { type?: string; label?: string };
    eq(source.type, 'kind');
    eq(source.label, 'Тяжёлый доспех');
  });

  test('строчка на роде значит то же, что строчка на вещи: два кольца дают вдвое', () => {

    eq(calc(sys, hero(['кольцо1']), 'кд', pass(['кольцо1'])), 11);
    eq(calc(sys, hero(['кольцо1', 'кольцо2']), 'кд', pass(['кольцо1', 'кольцо2'])), 12);
  });

  test('вещь может добавить своё поверх родового', () => {
    const book = {
      ...compendium,
      records: [...(compendium.records.map((i: any) => i.id === 'кольчуга'
        ? { ...i, modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: 6, stacking: 'sum', condition: null }] }
        : i))],
    };
    const sheet = hero(['кольчуга']);
    const p = newPass(sys, sheet, { compendium: book });
    eq(calc(sys, sheet, 'кд', p), 16, 'своя база доспеха у вещи');
    deepEq(resolveRoll(sys, sheet, ['скрытность'], p).edits.map(e => e.label), ['Помеха'],
      'и родовая помеха на месте');
  });
});
