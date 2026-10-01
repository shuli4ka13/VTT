import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';

const sys: any = {
  id: 'слово-силы',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Текущие ХП', kind: 'number', default: 1, min: 0 },
    { key: 'хп_макс', label: 'Максимум ХП', kind: 'number', default: 1 },
  ] }, приём: { shape: 'book', use: 'action', label: 'Приём' } },
  effects: {},
};

const spell: any = {
  params: [{ key: 'порог', label: 'Порог', kind: 'number' }],
  steps: [
    { type: 'compare', value: { expr: '@порог' }, versus: { expr: '@получатель.хп' }, breakIf: 'less' },
    { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '0' } },
  ],
};

const book: any = { records: [{ id: 'слово', table: 'приём', label: 'Слово', bindings: [{ label: 'Слово', effect: 'слово', args: {} }] }] };
const full: any = { ...sys, effects: { слово: { label: 'Слово', activation: 'manual', ...spell } } };

const cast = (порог: string, хп: number, хп_макс: number) => {
  const маг = { id: 'маг', systemId: 'слово-силы', name: 'маг', values: { хп: 15, хп_макс: 20 }, has: [{ of: 'слово' }], effects: [] };
  const жертва = { id: 'жертва', systemId: 'слово-силы', name: 'жертва', values: { хп, хп_макс }, has: [], effects: [] };
  const withArg = { records: [{ ...book.records[0], bindings: [{ label: 'Слово', effect: 'слово', args: { порог } }] }] };
  const out = exchange({ system: full, compendium: withArg as any, die: () => 1, sheets: [маг, жертва] as any, actionId: 'слово:0', fromId: 'маг', toId: 'жертва' });
  return { sheet: out.sheets.find(s => s.id === 'жертва')!, stopped: out.reports[0]!.report.stopped as any };
};

group('формула из записи листом цели', () => {
  test('«Слово смерти»: 90 хитов из порога 100 — жертва умирает', () => {
    eq(cast('100', 90, 300).sheet.values.хп, 0);
  });

  test('120 хитов — слишком здорова, слово молчит', () => {
    const out = cast('100', 120, 300);
    eq(out.sheet.values.хп, 120, 'хиты не тронуты');
    eq(out.stopped.reason, 'compare-short', 'в журнале видно, ПОЧЕМУ не сработало');
  });

  test('«Слово отчаяния»: порог — половина максимума САМОЙ жертвы', () => {
    eq(cast('@получатель.хп_макс / 2', 40, 100).sheet.values.хп, 0, '40 ≤ 50: считался ЕЁ максимум, не магов');
  });

  test('та же запись, жертва здоровее половины — жива', () => {
    eq(cast('@получатель.хп_макс / 2', 60, 100).sheet.values.хп, 60);
  });
});
