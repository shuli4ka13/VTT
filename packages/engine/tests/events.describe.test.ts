import { group, test, ok, eq } from './harness.ts';
import { describeEntry } from '../src/events/describe.ts';
import type { System, Sheet } from '../src/model/types.ts';
import { withColumn } from '../src/model/sheet-columns.ts';

const system = {
  id: 'т', name: 'т',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 10 },
    { key: 'броня', label: 'Класс брони', kind: 'number', default: 15 },
  ] },
    rolls: {
      label: 'Броски', key: 'word',
      columns: [{ key: 'успех', label: 'Успех', kind: 'text' }, { key: 'провал', label: 'Провал', kind: 'text' }],
      rows: [
        { value: 'атака', cells: { успех: 'попадание', провал: 'промах' } },
        { value: 'спас', cells: { успех: 'спасся', провал: 'не спасся' } },
        { value: 'без_слов' },
      ],
    },
  },
  effects: {
    шаблон: {
      label: 'Заклинание: спасбросок, половина при успехе',
      steps: [
        { id: 'п', type: 'threshold', roll: { tags: ['спас'] }, versus: { expr: '@получатель.броня' } },
        { id: 'в', type: 'amount', dice: { const: '8к6' } },
      ],
    },
  },
} as unknown as System;

const sheets = [
  { id: 'мирра', name: 'Мирра' },
  { id: 'орк', name: 'Орк' },
] as unknown as Sheet[];

const report = (over: Record<string, unknown>) => ({
  kind: 'effect', effect: 'шаблон', from: 'мирра', reply: false,
  trace: [], stopped: null, changes: [], effects: [], removed: [], spent: [], emitted: [],
  ...over,
});

const line = (over: Record<string, unknown>) =>
  describeEntry({ fromId: 'мирра', toId: 'орк', report: report(over) }, system, sheets);

group('журнал говорит словами стола, а не движка', () => {
  test('заголовок берёт имя действия, а не имя шаблона', () => {
    ok(line({ label: 'Огненный шар' }).startsWith('Мирра применяет «Огненный шар» по Орк'));
  });

  test('без имени действия остаётся имя шаблона', () => {
    ok(line({}).includes('«Заклинание: спасбросок, половина при успехе»'));
  });

  test('исход броска — слова того вида броска, которым кидали', () => {
    const trace = [{ type: 'threshold', step: 'п', rolls: [9], total: 11, bonus: 2, versus: { tag: 'броня', value: 15 }, success: false }];
    ok(line({ label: 'Огненный шар', trace }).includes('— не спасся'));
    ok(!line({ label: 'Огненный шар', trace }).includes('промах'));
  });

  test('метка без своих слов говорит «успех» и «провал»', () => {
    const plain = { ...system, effects: { шаблон: { ...(system.effects as any).шаблон,
      steps: [{ id: 'п', type: 'threshold', roll: { tags: ['без_слов'] }, versus: { expr: '@получатель.броня' } }] } } } as unknown as System;
    const trace = [{ type: 'threshold', step: 'п', rolls: [3], total: 3, versus: { tag: 'броня', value: 15 }, success: false }];
    ok(describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, plain, sheets).includes('— провал'));
  });

  test('слова исхода ищутся по всем меткам броска', () => {
    const both = { ...system, effects: { шаблон: { ...(system.effects as any).шаблон,
      steps: [{ id: 'п', type: 'threshold', roll: { tags: ['без_слов', 'атака'] }, versus: { expr: '@получатель.броня' } }] } } } as unknown as System;
    const trace = [{ type: 'threshold', step: 'п', rolls: [3], total: 3, versus: { tag: 'броня', value: 15 }, success: false }];
    ok(describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, both, sheets).includes('— промах'));
  });

  test('половина при успехе видна в строке: сколько выпало и сколько осталось', () => {
    const trace = [{ type: 'amount', step: 'в', rolls: [6, 6, 6, 6, 6, 6], flat: 0, bonus: 0, margin: 0, share: 0.5, full: 36, total: 18 }];
    ok(line({ label: 'Огненный шар', trace }).includes('= 36 → половина: 18'));
  });

  test('без доли одно слагаемое не повторяется дважды', () => {
    const trace = [{ type: 'amount', step: 'в', rolls: [6, 6, 6, 6, 6, 6], flat: 0, bonus: 0, margin: 0, total: 36 }];
    const said = line({ label: 'Огненный шар', trace });
    eq(said.includes('36 = 36'), false, said);
    ok(said.includes('36'));
  });
});

group('журнал называет чужие и общие поля словами', () => {
  test('поле отправителя, получателя и стола — подпись с хозяином, выход шага — его подпись', () => {
    const owned = { ...withColumn(system, { key: 'эскалация', label: 'Кость эскалации', kind: 'number' }, 'desk'),
      effects: { шаблон: { label: 'Удар', steps: [
        { id: 'п', type: 'threshold', roll: { tags: ['атака'], bonus: { expr: '@отправитель.хиты + @стол.эскалация' } }, versus: { expr: '@получатель.броня' } },
        { id: 'в', type: 'amount', fixed: { expr: 'если(@п.natural >= 20, 2, 1)' } },
      ] } } } as unknown as System;
    const trace = [
      { type: 'threshold', step: 'п', rolls: [12], total: 25, bonus: 13, versus: { value: 15 }, success: true },
      { type: 'amount', step: 'в', rolls: [], flat: 1, total: 1 },
    ];
    const said = describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, owned, sheets);
    ok(said.includes('Хиты отправителя + Кость эскалации на столе: 13'), said);
    ok(said.includes('против Класс брони получателя: 15'), said);
    ok(!said.includes('отправитель.') && !said.includes('стол.') && !said.includes('п.natural'), said);
  });
});
