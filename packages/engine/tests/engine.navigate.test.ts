import { group, test, eq, ok, throws } from './harness.ts';
import { calc } from '../src/engine/calc.ts';
import { send, receive } from '../src/events/envelope.ts';
import type { System, Sheet } from '../src/model/types.ts';
import { withColumn } from '../src/model/sheet-columns.ts';

const система = {
  id: 'н', name: 'н',
  constants: {},
  tables: { лист: { shape: 'single', columns: [
    { key: 'сила', label: 'Сила', kind: 'number', default: 3 },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 50 },
    { key: 'класс', label: 'Класс', kind: 'choice', from: 'классы', default: 'воин' },
    { key: 'кость_хитов', label: 'Кость хитов', expr: '@класс.кость' },
    { key: 'природа_класса', label: 'Природа', expr: '@класс.урон.природа' },
  ] },
    природы: { label: 'Природа урона', key: 'word', rows: [{ value: 'физ', label: 'физический' }, { value: 'стих', label: 'стихийный' }] },
    урон: {
      label: 'Типы урона', key: 'word',
      columns: [{ key: 'природа', label: 'Природа', kind: 'choice', from: 'природы' }, { key: 'прибавка', label: 'Прибавка', kind: 'number' }],
      rows: [
        { value: 'рубящий', cells: { природа: 'физ', прибавка: { expr: '@сила' } } },
        { value: 'огонь', cells: { природа: 'стих', прибавка: { expr: '2' } } },
      ],
    },
    классы: {
      label: 'Классы', key: 'word',
      columns: [{ key: 'кость', label: 'Кость хитов', kind: 'number' }, { key: 'урон', label: 'Любимый урон', kind: 'choice', from: 'урон' }],
      rows: [{ value: 'воин', cells: { кость: 10, урон: 'рубящий' } }, { value: 'маг', cells: { кость: 6, урон: 'огонь' } }],
    },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'тип', label: 'Тип урона', kind: 'choice', from: 'урон' }],
      steps: [
        { id: 'сколько', type: 'amount', source: 'item', fixed: { expr: '5 + @тип.прибавка' } },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@сколько' } },
      ],
    },
  },
  records: {
    меч: { kind: 'action', label: 'Приём', bindings: [{ label: 'Удар', effect: 'удар', args: { тип: { const: 'рубящий' } } }] },
    факел: { kind: 'action', label: 'Приём', bindings: [{ label: 'Удар', effect: 'удар', args: { тип: { const: 'огонь' } } }] },
  },
} as unknown as System;

const лист = (класс = 'воин') => ({
  id: 'я', systemId: 'н', name: 'я', values: { класс }, has: [{ of: 'меч' }, { of: 'факел' }], effects: []
} as unknown as Sheet);

group('ссылка на таблицу читается через точку', () => {
  test('поле листа идёт в таблицу по своему значению', () => {
    eq(calc(система, лист('воин'), 'кость_хитов'), 10);
    eq(calc(система, лист('маг'), 'кость_хитов'), 6);
  });

  test('цепочка через две таблицы: класс → любимый урон → его природа', () => {
    eq(calc(система, лист('воин'), 'природа_класса'), 'физ');
    eq(calc(система, лист('маг'), 'природа_класса'), 'стих');
  });

  test('вход эффекта — тоже ссылка: прибавка берётся у своего типа урона, формула считается листом', () => {
    const книга = { records: [{ id: 'меч', rk: 'меч', label: 'Меч', props: {} }, { id: 'факел', rk: 'факел', label: 'Факел', props: {} }] } as never;
    const мир = { system: система, compendium: книга, die: () => 1 };
    const бей = (action: string) => {
      const итог = receive(send(action, { ...мир, sheet: лист() }), { ...мир, sheet: лист() });
      return (итог.report.trace.find((t: Record<string, unknown>) => t.type === 'amount') as Record<string, unknown>).total;
    };
    eq(бей('меч:0'), 5 + 3, 'рубящий: прибавка — Сила');
    eq(бей('факел:0'), 5 + 2, 'огонь: прибавка — 2');
  });

  test('опечатка в колонке называется словами и перечисляет, что есть', () => {
    const кривая = withColumn(система, { key: 'х', label: 'х', expr: '@класс.кост' });
    const беда = throws(() => calc(кривая, лист(), 'х'));
    ok(String(беда.message).includes('кост'), String(беда.message));
    ok(String(беда.message).includes('Кость хитов'), String(беда.message));
  });

  test('идти дальше обычной колонки некуда — так и сказано', () => {
    const кривая = withColumn(система, { key: 'х', label: 'х', expr: '@класс.кость.ещё' });
    const беда = throws(() => calc(кривая, лист(), 'х'));
    ok(String(беда.message).includes('не из таблицы'), String(беда.message));
  });
});
