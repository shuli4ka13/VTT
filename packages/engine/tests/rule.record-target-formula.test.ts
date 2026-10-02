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

const WHO = [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }];
const EACH = { type: 'each', of: 'цели', as: 'цель' };
const kill = { type: 'apply', target: { expr: '@цель.хп' }, direction: 'set', value: { expr: '0' } };

const spell: any = {
  params: [...WHO, { key: 'порог', label: 'Порог', kind: 'number' }],
  steps: [
    EACH,
    { type: 'check', value: { expr: '@порог' }, versus: { expr: '@цель.хп' } },
    kill,
  ],
};

const despair: any = {
  params: WHO,
  steps: [
    EACH,
    { type: 'check', value: { expr: '@цель.хп_макс / 2' }, versus: { expr: '@цель.хп' } },
    kill,
  ],
};

const book: any = { records: [{ id: 'слово', table: 'приём', label: 'Слово', bindings: [{ label: 'Слово', effect: 'слово', args: {} }] }] };
const full: any = { ...sys, effects: { слово: { label: 'Слово', activation: 'manual', ...spell }, отчаяние: { label: 'Отчаяние', activation: 'manual', ...despair } } };

const cast = (порог: string | null, хп: number, хп_макс: number) => {
  const маг = { id: 'маг', systemId: 'слово-силы', name: 'маг', values: { хп: 15, хп_макс: 20 }, has: [{ of: 'слово' }, { of: 'отчаяние' }], effects: [] };
  const жертва = { id: 'жертва', systemId: 'слово-силы', name: 'жертва', values: { хп, хп_макс }, has: [], effects: [] };
  const despairRecord = { id: 'отчаяние', table: 'приём', label: 'Отчаяние', bindings: [{ label: 'Отчаяние', effect: 'отчаяние', args: {} }] };
  const wordRecord = { ...book.records[0], bindings: [{ label: 'Слово', effect: 'слово', args: { порог: порог ?? '0' } }] };
  const withArg = { records: [wordRecord, despairRecord] };
  const out = exchange({ system: full, compendium: withArg as any, die: () => 1, sheets: [маг, жертва] as any, actionId: `${порог === null ? 'отчаяние' : 'слово'}:0`, fromId: 'маг', toId: 'жертва' });
  return { sheet: out.sheets.find(s => s.id === 'жертва')!, stopped: out.reports[0]!.report.stopped as any };
};

group('формула из записи листом цели', () => {
  test('«Слово смерти»: 90 хитов из порога 100 — жертва умирает', () => {
    eq(cast('100', 90, 300).sheet.values.хп, 0);
  });

  test('120 хитов — слишком здорова, слово молчит', () => {
    const out = cast('100', 120, 300);
    eq(out.sheet.values.хп, 120, 'хиты не тронуты');
    eq(out.stopped.reason, 'check-miss', 'в журнале видно, ПОЧЕМУ не сработало');
  });

  test('«Слово отчаяния»: порог — половина максимума САМОЙ жертвы', () => {
    eq(cast(null, 40, 100).sheet.values.хп, 0, '40 ≤ 50: считался ЕЁ максимум, не магов');
  });

  test('то же слово, жертва здоровее половины — жива', () => {
    eq(cast(null, 60, 100).sheet.values.хп, 60);
  });
});
