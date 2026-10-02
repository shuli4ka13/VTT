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
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
      steps: [
        { type: 'each', of: 'цели', as: 'цель' },
        { id: 'бросок', type: 'roll', die: { expr: '"1к20"' }, tags: ['спас'], by: { expr: '@цель' }, against: { expr: '@действующий' } },
        { id: 'п', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.броня' } },
        { id: 'в', type: 'roll', fixed: { expr: "кинуть('8к6')" } },
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
    const trace = [{ type: 'check', step: 'п', total: 11, versus: 15, margin: -4, success: false, tags: ['спас'] }];
    ok(line({ label: 'Огненный шар', trace }).includes('— не спасся'));
    ok(!line({ label: 'Огненный шар', trace }).includes('промах'));
  });

  test('метка без своих слов говорит «успех» и «провал»', () => {
    const plain = { ...system, effects: { шаблон: { ...(system.effects as any).шаблон,
      steps: [{ id: 'п', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.броня' } }] } } } as unknown as System;
    const trace = [{ type: 'check', step: 'п', total: 3, versus: 15, margin: -12, success: false, tags: ['без_слов'] }];
    ok(describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, plain, sheets).includes('— провал'));
  });

  test('слова исхода ищутся по всем меткам броска', () => {
    const both = { ...system, effects: { шаблон: { ...(system.effects as any).шаблон,
      steps: [{ id: 'п', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.броня' } }] } } } as unknown as System;
    const trace = [{ type: 'check', step: 'п', total: 3, versus: 15, margin: -12, success: false, tags: ['без_слов', 'атака'] }];
    ok(describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, both, sheets).includes('— промах'));
  });

  test('половина при успехе видна в строке: сколько выпало и сколько осталось', () => {
    const half = { ...system, effects: { шаблон: { ...(system.effects as any).шаблон,
      steps: [
        { id: 'в', type: 'roll', fixed: { expr: "кинуть('8к6')" } },
        { id: 'ост', type: 'roll', fixed: { expr: 'округлить вниз(@в / 2)' } },
      ] } } } as unknown as System;
    const trace = [
      { type: 'roll', step: 'в', rolls: [6, 6, 6, 6, 6, 6], fixed: 36, bonus: 0, total: 36 },
      { type: 'roll', step: 'ост', rolls: [], fixed: 18, bonus: 0, total: 18 },
    ];
    const said = describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ label: 'Огненный шар', trace }) }, half, sheets);
    ok(said.includes('= 36'), said);
    ok(said.includes('= 18'), said);
  });

  test('без доли одно слагаемое не повторяется дважды', () => {
    const trace = [{ type: 'roll', step: 'в', rolls: [6, 6, 6, 6, 6, 6], fixed: 36, bonus: 0, total: 36 }];
    const said = line({ label: 'Огненный шар', trace });
    eq(said.includes('36 = 36'), false, said);
    ok(said.includes('36'));
  });
});

group('журнал называет чужие и общие поля словами', () => {
  const owned = (bonus: string, versus: string) => ({ ...withColumn(system, { key: 'эскалация', label: 'Кость эскалации', kind: 'number' }, 'desk'),
    effects: { шаблон: { label: 'Удар', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }], steps: [
      { type: 'each', of: 'цели', as: 'цель' },
      { id: 'бросок', type: 'roll', die: { expr: '"1к20"' }, tags: ['атака'], bonus: { expr: bonus }, by: { expr: '@действующий' }, against: { expr: '@цель' } },
      { id: 'п', type: 'check', value: { expr: '@бросок' }, versus: { expr: versus } },
      { id: 'в', type: 'roll', fixed: { expr: 'если(@бросок.natural >= 20, 2, 1)' } },
    ] } } }) as unknown as System;
  const trace = [
    { type: 'roll', step: 'бросок', by: 'мирра', rolls: [12], total: 25, bonus: 13, tags: ['атака'] },
    { type: 'check', step: 'п', total: 25, versus: 15, margin: 10, success: true, tags: ['атака'] },
    { type: 'roll', step: 'в', rolls: [], fixed: 1, bonus: 0, total: 1 },
  ];
  const said = (system: System) => describeEntry({ fromId: 'мирра', toId: 'орк', report: report({ trace }) }, system, sheets);

  test('поле листа, названного входом, — подпись поля без имени входа', () => {
    const text = said(owned('@действующий.хиты', '@действующий.броня'));
    ok(text.includes('+ Хиты: 13'), text);
    ok(text.includes('против Класс брони: 15'), text);
    ok(!text.includes('действующий.'), text);
  });

  test('поле стола и поле листа цели цикла — подпись, выход шага — его подпись', () => {
    const text = said(owned('@действующий.хиты + @стол.эскалация', '@цель.броня'));
    ok(text.includes('Хиты + Кость эскалации: 13'), text);
    ok(text.includes('против Класс брони: 15'), text);
    ok(!text.includes('стол.') && !text.includes('цель.') && !text.includes('бросок.natural'), text);
  });
});
