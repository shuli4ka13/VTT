import { group, test, ok, eq } from './harness.ts';
import { describeEntry } from '../src/events/describe.ts';
import type { System, Sheet } from '../src/model/types.ts';

const system = {
  id: 'т', name: 'т',
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'броня', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 15 } },
  ],
  rolls: [
    { tag: 'атака', label: 'Бросок атаки', words: { success: 'попадание', fail: 'промах' } },
    { tag: 'спас', label: 'Спасбросок', words: { success: 'спасся', fail: 'не спасся' } },
    { tag: 'без-слов', label: 'Проверка' },
  ],
  effects: {
    шаблон: {
      label: 'Заклинание: спасбросок, половина при успехе',
      steps: [
        { id: 'п', type: 'threshold', roll: { check: 'спас' }, versus: { tag: 'броня' } },
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

  test('вид броска без своих слов говорит по-старому', () => {
    const plain = { ...system, effects: { шаблон: { ...(system.effects as any).шаблон,
      steps: [{ id: 'п', type: 'threshold', roll: { check: 'без-слов' }, versus: { tag: 'броня' } }] } } } as unknown as System;
    const trace = [{ type: 'threshold', step: 'п', rolls: [3], total: 3, versus: { tag: 'броня', value: 15 }, success: false }];
    ok(describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, plain, sheets).includes('— промах'));
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
    const owned = { ...system,
      fields: [...system.fields, { tag: 'эскалация', label: 'Кость эскалации', desk: true, value: { kind: 'stored', type: 'number', default: 0 } }],
      effects: { шаблон: { label: 'Удар', steps: [
        { id: 'п', type: 'threshold', roll: { check: 'атака', bonus: { expr: '@отправитель.хиты + @стол.эскалация' } }, versus: { expr: '@получатель.броня' } },
        { id: 'в', type: 'amount', fixed: { expr: '@п.natural >= 20 ? 2 : 1' } },
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
