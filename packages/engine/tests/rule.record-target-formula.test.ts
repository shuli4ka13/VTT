import { group, test, eq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

// Формула ИЗ ЗАПИСИ, посчитанная листом ЦЕЛИ, — Power Word Kill насквозь.
//
// D&D: «Слово смерти» убивает, если у жертвы не больше 100 хитов. Порог
// приносит ЗАПИСЬ (потребность вида «формула», чей лист — «цели»), само
// правило один раз живёт в эффекте: «порог против текущих хитов цели;
// порог меньше — цель слишком здорова, слово молчит; иначе хиты в 0».
//
// Зачем сторона цели: вторая запись того же эффекта приносит порогом не
// число, а «#хп_макс / 2» — «умри, если хитов не больше половины ТВОЕГО
// максимума». Отправитель посчитать это не может: у него нет листа жертвы.
// Формула едет в конверте текстом, и получатель решает её своими полями.

const sys: any = {
  id: 'слово-силы',
  fields: [
    { tag: 'хп', label: 'Текущие ХП', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
    { tag: 'хп_макс', label: 'Максимум ХП', value: { kind: 'stored', type: 'number', default: 1 } },
  ],
  effects: {},
};

// Эффект один; записи различаются только порогом.
const spell: any = {
  params: [{ key: 'порог', label: 'Порог', kind: 'expr', of: 'target' }],
  steps: [
    { type: 'compare', value: { param: 'порог' }, versus: { expr: '#хп', of: 'target' }, breakIf: 'less' },
    { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { const: 0 } },
  ],
};

// У мага свой лист с ДРУГИМ максимумом — если бы «#хп_макс / 2» считался
// его листом, порог был бы 10 и жертва на 40 хитах выжила бы.
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
    eq(cast('#хп_макс / 2', 40, 100).sheet.values.хп, 0, '40 ≤ 50: считался ЕЁ максимум, не магов');
  });

  test('та же запись, жертва здоровее половины — жива', () => {
    eq(cast('#хп_макс / 2', 60, 100).sheet.values.хп, 60);
  });

  test('конверт не несёт ни одного числа жертвы — сторона цели уезжает текстом', () => {
    const packed = packRule(spell, {
      system: sys, sheet: маг, params: { порог: '#хп_макс / 2' }, item: null,
      die: () => 1, pass: newPass(sys, маг, { compendium: { items: [] } }),
    } as any);
    const text = JSON.stringify(packed);
    eq(text.includes('"expr":"#хп_макс / 2"'), true, 'формула в конверте — текстом');
    eq(text.includes('10'), false, 'посчитанного магом порога в конверте нет');
  });
});
