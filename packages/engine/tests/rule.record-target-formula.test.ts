import { group, test, eq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

const sys: any = {
  id: 'слово-силы',
  fields: [
    { tag: 'хп', label: 'Текущие ХП', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
    { tag: 'хп_макс', label: 'Максимум ХП', value: { kind: 'stored', type: 'number', default: 1 } },
  ],
  effects: {},
};

const spell: any = {
  params: [{ key: 'порог', label: 'Порог', kind: 'number' }],
  steps: [
    { type: 'compare', value: { param: 'порог' }, versus: { expr: '@получатель.хп' }, breakIf: 'less' },
    { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { const: 0 } },
  ],
};

const маг = { id: 'маг', values: { хп: 15, хп_макс: 20 }, effects: [] };

const cast = (порог: string, хп: number, хп_макс: number) => {
  const жертва = { id: 'жертва', values: { хп, хп_макс }, effects: [] };
  const packed = packRule(spell, {
    system: sys, sheet: маг, params: { порог }, item: null,
    die: () => 1, pass: newPass(sys, маг, { compendium: { items: [] } }),
  } as any);
  return resolveRule(packed, {
    system: sys, sheet: жертва, params: {}, item: null,
    die: () => 1, pass: newPass(sys, жертва, { compendium: { items: [] } }),
  } as any);
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

  test('конверт не несёт ни одного числа жертвы — сторона цели уезжает текстом', () => {
    const packed = packRule(spell, {
      system: sys, sheet: маг, params: { порог: '@получатель.хп_макс / 2' }, item: null,
      die: () => 1, pass: newPass(sys, маг, { compendium: { items: [] } }),
    } as any);
    const text = JSON.stringify(packed);
    eq(text.includes('"expr":"@получатель.хп_макс / 2"'), true, 'формула в конверте — текстом');
    eq(text.includes('10'), false, 'посчитанного магом порога в конверте нет');
  });
});
