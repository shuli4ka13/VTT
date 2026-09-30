import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { resolveRoll } from '../src/engine/modifiers.ts';

const sys: any = {
  id: 'рода-с-модификаторами',
  tables: { лист: { shape: 'single', columns: [
    { key: 'скрытность', label: 'Скрытность', kind: 'number', default: 3, roll: { label: 'Проверка: Скрытность', tags: ['скрытность'] } },
    { key: 'кд', label: 'Класс брони', kind: 'number', default: 10 },
  ] } , тяжёлый: {
      shape: 'book', use: 'item', label: 'Тяжёлый доспех',
      columns: [], bindings: [],

      modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['скрытность'], edit: 'помеха' }],
    }, лёгкий: { shape: 'book', use: 'item', label: 'Лёгкий доспех', columns: [], bindings: [] }, кольцо: {
      shape: 'book', use: 'item', label: 'Кольцо', columns: [], bindings: [],
      modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '1' }, stacking: 'sum' }],
    } },
  roll_edits: { помеха: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] } },
  
  effects: {},
};

const compendium: any = {
  records: [{ id: 'кольчуга', table: 'тяжёлый', label: 'Кольчуга' }, { id: 'латы', table: 'тяжёлый', label: 'Латы' }, { id: 'кожа', table: 'лёгкий', label: 'Кожаный доспех' }, { id: 'кольцо1', table: 'кольцо', label: 'Кольцо защиты' }, { id: 'кольцо2', table: 'кольцо', label: 'Кольцо стража' }],
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
        ? { ...i, modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '6' }, stacking: 'sum' }] }
        : i))],
    };
    const sheet = hero(['кольчуга']);
    const p = newPass(sys, sheet, { compendium: book });
    eq(calc(sys, sheet, 'кд', p), 16, 'своя база доспеха у вещи');
    deepEq(resolveRoll(sys, sheet, ['скрытность'], p).edits.map(e => e.label), ['Помеха'],
      'и родовая помеха на месте');
  });
});
