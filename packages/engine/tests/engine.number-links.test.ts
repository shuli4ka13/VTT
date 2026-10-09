import { group, test, eq, deepEq, throws } from './harness.ts';
import { calc } from '../src/engine/calc.ts';
import { compile, printFormula } from '../src/formula/index.ts';
import { forgetFields, fieldLinkOf, fieldOf, rowWords } from '../src/model/sheet-columns.ts';
import { referencesOf } from '../src/model/references.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet } from '../src/model/types.ts';

const система = (): System => ({
  id: 'ч', name: 'ч',
  constants: {},
  effects: {},
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'уровень', label: 'Уровень', kind: 'number', from: 'уровни', default: 1 },
      { key: 'заклинатель', label: 'Уровень заклинателя', kind: 'number', from: 'ячейки', default: 0 },
      { key: 'класс', label: 'Класс', kind: 'choice', from: 'классы' },
      { key: 'мастерство', label: 'Бонус мастерства', expr: { expr: '@уровень.мастерство' } },
      { key: 'ступень', label: 'Ступень', expr: { expr: '@уровень.ступень.урон' } },
      { key: 'ярость', label: 'Урон ярости', expr: { expr: 'или(@класс.ярость, 0) * @уровень.ярость' } },
      { key: 'первые', label: 'Ячейки 1-го круга', expr: { expr: '@заклинатель.["круг_1"]' } },
    ] },
    уровни: {
      label: 'Уровень персонажа', key: 'number',
      columns: [
        { key: 'мастерство', label: 'Бонус мастерства', kind: 'number' },
        { key: 'ярость', label: 'Урон ярости', kind: 'number' },
        { key: 'ступень', label: 'Ступень', kind: 'number', from: 'ступени' },
      ],
      rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(value => ({
        value, cells: { мастерство: value < 5 ? 2 : value < 9 ? 3 : 4, ярость: value < 9 ? 2 : 3, ступень: value },
      })),
    },
    ступени: {
      label: 'Ступени', key: 'range',
      columns: [{ key: 'урон', label: 'Урон', kind: 'number' }],
      rows: [{ from: 1, to: 4, cells: { урон: 1 } }, { from: 5, to: 10, cells: { урон: 2 } }],
    },
    классы: {
      label: 'Классы', key: 'word',
      columns: [{ key: 'ярость', label: 'Впадает в ярость', kind: 'number' }],
      rows: [{ value: 'варвар', cells: { ярость: 1 } }, { value: 'воин' }],
    },
    ячейки: {
      label: 'Ячейки заклинаний', key: 'number',
      columns: [{ key: 'круг_1', label: '1-й круг', kind: 'number' }, { key: 'круг_2', label: '2-й круг', kind: 'number' }],
      rows: [
        { value: 0, cells: { круг_1: 0, круг_2: 0 } },
        { value: 1, cells: { круг_1: 2, круг_2: 0 } },
        { value: 3, cells: { круг_1: 4, круг_2: 2 } },
      ],
    },
    круги: {
      label: 'Ячейки по кругам', key: 'word', owner: 'sheet',
      columns: [
        { key: 'circle', label: 'Колонка', kind: 'column', from: 'ячейки' },
        { key: 'max', label: 'Всего', kind: 'number', expr: { expr: '@заклинатель.[@строка.circle]' } },
      ],
      rows: [{ value: 'круг_1', label: '1-й круг', cells: { circle: 'круг_1' } }, { value: 'круг_2', label: '2-й круг', cells: { circle: 'круг_2' } }],
    },
  },
} as unknown as System);

const лист = (values: Record<string, unknown>): Sheet =>
  ({ id: 'я', systemId: 'ч', name: 'я', values, has: [], effects: [] }) as unknown as Sheet;

group('числовое поле — строка таблицы с ключом-числом', () => {
  test('«@уровень.мастерство» читает колонку строки, где ключ = уровню', () => {
    const s = система();
    deepEq([1, 4, 5, 8, 9, 10].map(уровень => calc(s, лист({ уровень }), 'мастерство')), [2, 2, 3, 3, 4, 4]);
  });

  test('ссылка идёт дальше в таблицу-промежуток: уровень → ступень → урон', () => {
    const s = система();
    deepEq([1, 4, 5, 10].map(уровень => calc(s, лист({ уровень }), 'ступень')), [1, 1, 2, 2]);
  });

  test('уровня нет в таблице — внятный отказ', () => {
    throws(() => calc(система(), лист({ уровень: 42 }), 'мастерство'), 'не знает');
  });

  test('урон ярости без динамической таблицы: множитель класса × колонка уровня; без класса — ноль', () => {
    const s = система();
    deepEq([1, 9].map(уровень => calc(s, лист({ уровень, класс: 'варвар' }), 'ярость')), [2, 3]);
    eq(calc(s, лист({ уровень: 9, класс: 'воин' }), 'ярость'), 0);
    eq(calc(s, лист({ уровень: 9 }), 'ярость'), 0);
  });

  test('поле знает свою таблицу; выбор и число без таблицы — как раньше', () => {
    const s = система();
    eq(fieldLinkOf(s, fieldOf(s, 'уровень')), 'уровни');
    eq(fieldLinkOf(s, fieldOf(s, 'класс')), 'классы');
    eq(fieldLinkOf(s, fieldOf(s, 'мастерство')), undefined);
  });

  test('таблица ссылки видна в «где используется»', () => {
    const refs = referencesOf(система());
    eq(refs.some(r => r.kind === 'table' && r.key === 'уровни' && r.from.field === 'уровень'), true);
  });

  test('линт системы без ошибок', () => {
    deepEq(errorsOf(lintSystem(система())).map(p => p.text), []);
  });
});

group('колонка по значению: «@поле.[значение]»', () => {
  test('разбор и печать', () => {
    const ast = compile('@заклинатель.[@строка.circle] + 1').ast;
    eq(printFormula(ast), '@заклинатель.[@строка.circle] + 1');
    eq(printFormula(compile('@a.["x"].b').ast), '@a.["x"].b');
    deepEq([...compile('@a.[@b] * @c').deps], ['a', 'b', 'c']);
  });

  test('ошибки разбора названы словами', () => {
    throws(() => compile('@a.'), 'после точки');
    throws(() => compile('@a.[]'), 'впишите');
    throws(() => compile('@a.[@b'), 'не закрыта');
  });

  test('значение в скобках называет колонку', () => {
    const resolve = (name: string) => ({ 'a.круг_2': 7, k: 'круг_2', 'a.x.y': 3 } as Record<string, unknown>)[name] as never;
    eq(compile('@a.[@k]').evaluate(resolve), 7);
    eq(compile('@a.["x"].y').evaluate(resolve), 3);
    eq(compile('@a.[@пусто]').evaluate(resolve), null);
  });

  test('на листе: литерал и строка таблицы', () => {
    const s = система();
    eq(calc(s, лист({ заклинатель: 3 }), 'первые'), 4);
    deepEq(['круг_1', 'круг_2'].map(c => calc(s, лист({ заклинатель: 3 }), `круги.${c}.max`)), [4, 2]);
    deepEq(['круг_1', 'круг_2'].map(c => calc(s, лист({ заклинатель: 1 }), `круги.${c}.max`)), [2, 0]);
  });

  test('подпись формулы строки — фишками', () => {
    const s = система();
    forgetFields(s);
    const row = s.tables!['круги']!.rows![0]!;
    eq(rowWords(s, 'круги', row, '@заклинатель.[@строка.circle]'), 'Уровень заклинателя · 1-й круг');
    eq(rowWords(s, 'круги', row, '@заклинатель.[@строка.max] + 1'), 'Уровень заклинателя · колонка по значению + 1');
  });
});
