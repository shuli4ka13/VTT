import { group, test, eq, throws } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

const sys: any = {
  id: 'границы',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Хиты', kind: 'number', default: 10, min: 0, max: '#макс' },
    { key: 'макс', label: 'Максимум', kind: 'number', default: 20 },
    { key: 'жар', label: 'Температура', kind: 'number' },
    { key: 'имя', label: 'Имя', kind: 'text', default: 'Мирра' },
    { key: 'кривое', label: 'Кривая граница', kind: 'number', max: '#имя' },
  ] } },
  effects: {},
};

const hit = (steps: any[], values: Record<string, number>) => {
  const sheet = { id: 'цель', values, effects: [] };
  const ctx = () => ({
    system: sys, sheet, params: {}, item: null,
    die: () => 1, pass: newPass(sys, sheet, { compendium: { records: [] } }),
  });
  return resolveRule(packRule({ steps } as any, ctx() as any), ctx() as any);
};

const minus = (n: number) => [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: `${JSON.stringify(n)}` } }];

group('границы поля', () => {
  test('внутри границ — арифметика как есть', () => {
    eq(hit(minus(4), { хп: 10, макс: 20 }).sheet.values.хп, 6);
  });

  test('min держит: эффект о нуле не знает, поле — знает', () => {
    eq(hit(minus(15), { хп: 10, макс: 20 }).sheet.values.хп, 0);
  });

  test('max — формула, посчитанная листом ЦЕЛИ: у каждого свой максимум', () => {
    const heal = [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '50' } }];
    eq(hit(heal, { хп: 10, макс: 20 }).sheet.values.хп, 20);
    eq(hit(heal, { хп: 10, макс: 31 }).sheet.values.хп, 31, 'та же система, другой лист — другой потолок');
  });

  test('«присвоить» зажимается так же: границы сильнее направления', () => {
    const set = [{ type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '-7' } }];
    eq(hit(set, { хп: 10, макс: 20 }).sheet.values.хп, 0);
  });

  test('поле без границ живёт как раньше — хоть в минус', () => {
    const chill = [{ type: 'apply', target: { tag: 'жар' }, direction: 'subtract', value: { expr: '5' } }];
    eq(hit(chill, { хп: 10, макс: 20, жар: 2 }).sheet.values.жар, -3);
  });

  test('граница, дающая не число, — внятная ошибка, а не тихий пропуск', () => {
    const warp = [{ type: 'apply', target: { tag: 'кривое' }, direction: 'add', value: { expr: '1' } }];
    throws(() => hit(warp, { хп: 10, макс: 20, кривое: 0 } as any), 'не число');
  });
});
