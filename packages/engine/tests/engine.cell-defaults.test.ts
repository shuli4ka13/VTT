import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: {
      shape: 'single',
      columns: [
        { key: 'magic', label: 'Магия', kind: 'number' },
        { key: 'итог', label: 'Итог', kind: 'number' },
        { key: 'режим', label: 'Режим', kind: 'choice', from: 'режимы' },
      ],
    },
    режимы: {
      label: 'Режимы',
      columns: [
        { key: 'flag', label: 'Флаг', kind: 'boolean', default: false },
        { key: 'bonus', label: 'Прибавка', kind: 'number', default: 0 },
        { key: 'вдвое', label: 'Вдвое', kind: 'number', expr: { expr: '@сила * 2' } },
      ],
      rows: [{ value: 'а', cells: { flag: true, bonus: 2 } }, { value: 'б', cells: {} }],
    },
    виды: {
      label: 'Виды',
      columns: [{ key: 'режим', label: 'Режим', kind: 'choice', from: 'режимы' }],
      rows: [{ value: 'x', cells: { режим: 'а' } }, { value: 'y', cells: {} }],
    },
    маги: {
      label: 'Маги',
      columns: [{ key: 'c', label: 'Магия входа', kind: 'number', expr: { expr: '@лист.magic' } }],
      rows: [{ value: 'один', cells: {} }],
    },
    оружие: {
      shape: 'book', use: 'item', label: 'Оружие',
      columns: [{ key: 'режим', label: 'Режим', kind: 'choice', from: 'режимы' }],
      bindings: [{ label: 'Удар', effect: 'удар', args: { действующий: { expr: '@действующий' } } }],
    },
    кнопки: {
      shape: 'book', use: 'action', label: 'Кнопки', columns: [],
      bindings: [
        { label: 'Флаг', effect: 'флаг', args: { выбор: { expr: '"б"' } } },
        { label: 'Путь', effect: 'путь', args: { вид: { expr: '"y"' } } },
        { label: 'Чужая магия', effect: 'чужая', args: {} },
        { label: 'Клетка через поле', effect: 'поле', args: { сила: { expr: '3' } } },
      ],
    },
  },
  effects: {
    флаг: {
      label: 'Флаг', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'выбор', kind: 'choice', from: 'режимы' }],
      steps: [{ type: 'apply', target: { expr: '@действующий.итог' }, direction: 'add', value: { expr: 'если(@выбор.flag, 10, 1) + @выбор.bonus' } }],
    },
    путь: {
      label: 'Путь', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'вид', kind: 'choice', from: 'виды' }],
      steps: [{ type: 'apply', target: { expr: '@действующий.итог' }, direction: 'add', value: { expr: 'если(@вид.режим.flag, 10, 1) + @вид.режим.bonus' } }],
    },
    чужая: {
      label: 'Чужая', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'emit', effect: 'магия входа', args: { лист: { expr: '@цель' }, маг: { expr: '"один"' } } }],
    },
    'магия входа': {
      label: 'Магия входа', activation: 'manual',
      params: [{ key: 'лист', kind: 'sheet' }, { key: 'маг', kind: 'choice', from: 'маги' }],
      steps: [{ type: 'apply', target: { expr: '@лист.итог' }, direction: 'add', value: { expr: '@маг.c' } }],
    },
    поле: {
      label: 'Поле', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'сила', kind: 'number' }],
      steps: [{ type: 'apply', target: { expr: '@действующий.итог' }, direction: 'add', value: { expr: '@действующий.режим.вдвое' } }],
    },
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }],
      steps: [{ type: 'apply', target: { expr: '@действующий.итог' }, direction: 'add', value: { expr: '@вещь.режим.bonus + если(@вещь.режим.flag, 10, 0)' } }],
    },
  },
} as unknown as System;

const compendium = {
  records: [
    { id: 'кнопки', table: 'кнопки', label: 'Кнопки', cells: {} },
    { id: 'меч', table: 'оружие', label: 'Меч', cells: { режим: 'а' } },
    { id: 'палка', table: 'оружие', label: 'Палка', cells: {} },
  ],
} as unknown as Compendium;

const sheet = (id: string, values: Record<string, unknown> = {}, has: object[] = [{ of: 'кнопки' }]): Sheet => ({
  id, systemId: 'x', name: id, values: { итог: 0, ...values }, has, effects: [],
} as unknown as Sheet);

const total = (sheets: Sheet[], id: string): unknown => sheets.find(s => s.id === id)!.values.итог;
const play = (sheets: Sheet[], actionId: string, toIds: string[] = []): Sheet[] =>
  exchange({ system, compendium, die: () => 1, sheets, actionId, fromId: sheets[0]!.id, toIds }).sheets;

group('пустая клетка справочника — умолчание колонки', () => {
  test('пустая клетка да/нет и число берут умолчание колонки', () => {
    eq(total(play([sheet('я')], 'кнопки:0'), 'я'), 1);
  });

  test('пустой выбор в пути — умолчание конечной колонки', () => {
    eq(total(play([sheet('я')], 'кнопки:1'), 'я'), 1);
  });
});

group('имена эффекта в клетке сильнее одноимённых таблиц', () => {
  test('клетка «@лист.magic» из функции со входом «лист» читает лист входа', () => {
    eq(total(play([sheet('маг', { magic: 1 }), sheet('цель', { magic: 5 })], 'кнопки:2', ['цель']), 'цель'), 5);
  });

  test('клетка через поле-выбор листа видит входы эффекта', () => {
    eq(total(play([sheet('я', { режим: 'б' })], 'кнопки:3'), 'я'), 6);
  });
});

group('вещь: путь через её колонку-выбор', () => {
  test('«@вещь.режим.колонка» читает строку справочника', () => {
    eq(total(play([sheet('я', {}, [{ of: 'меч' }])], 'меч:0'), 'я'), 12);
  });

  test('пустой выбор у вещи — умолчания конечных колонок', () => {
    eq(total(play([sheet('я', {}, [{ of: 'палка' }])], 'палка:0'), 'я'), 0);
  });

  test('проверка системы не ругает путь через колонку вещи', () => {
    eq(errorsOf(lintSystem(system, compendium)).map(p => p.text).join('\n'), '');
  });
});
