import { group, test, eq, throws } from './harness.ts';
import { exchange } from './play.ts';

const sys: any = {
  id: 'границы',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Хиты', kind: 'number', default: 10, min: 0, max: { expr: '#макс' } },
    { key: 'макс', label: 'Максимум', kind: 'number', default: 20 },
    { key: 'жар', label: 'Температура', kind: 'number' },
    { key: 'имя', label: 'Имя', kind: 'text', default: 'Мирра' },
    { key: 'кривое', label: 'Кривая граница', kind: 'number', max: { expr: '#имя' } },
  ] } },
  effects: {},
};

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true };
const EACH = { type: 'each', of: 'цели', as: 'цель' };

const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number, base: any = { records: [] }) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', params: [ACTOR, TARGETS], ...rule, steps: [EACH, ...rule.steps] } },
  };
  const book: any = { ...base, records: [...base.records, { id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'отправитель-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const hit = (steps: any[], values: Record<string, number>) =>
  runRule(sys, { steps }, { id: 'кто-то', values: {}, effects: [] }, { id: 'цель', values, effects: [] }, () => 1);

const minus = (n: number) => [{ type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: `${JSON.stringify(n)}` } }];

group('границы поля', () => {
  test('внутри границ — арифметика как есть', () => {
    eq(hit(minus(4), { хп: 10, макс: 20 }).sheet.values.хп, 6);
  });

  test('min держит: эффект о нуле не знает, поле — знает', () => {
    eq(hit(minus(15), { хп: 10, макс: 20 }).sheet.values.хп, 0);
  });

  test('max — формула, посчитанная листом ЦЕЛИ: у каждого свой максимум', () => {
    const heal = [{ type: 'apply', target: { expr: '@цель.хп' }, direction: 'add', value: { expr: '50' } }];
    eq(hit(heal, { хп: 10, макс: 20 }).sheet.values.хп, 20);
    eq(hit(heal, { хп: 10, макс: 31 }).sheet.values.хп, 31, 'та же система, другой лист — другой потолок');
  });

  test('«присвоить» зажимается так же: границы сильнее направления', () => {
    const set = [{ type: 'apply', target: { expr: '@цель.хп' }, direction: 'set', value: { expr: '-7' } }];
    eq(hit(set, { хп: 10, макс: 20 }).sheet.values.хп, 0);
  });

  test('поле без границ живёт как раньше — хоть в минус', () => {
    const chill = [{ type: 'apply', target: { expr: '@цель.жар' }, direction: 'subtract', value: { expr: '5' } }];
    eq(hit(chill, { хп: 10, макс: 20, жар: 2 }).sheet.values.жар, -3);
  });

  test('граница, дающая не число, — внятная ошибка, а не тихий пропуск', () => {
    const warp = [{ type: 'apply', target: { expr: '@цель.кривое' }, direction: 'add', value: { expr: '1' } }];
    throws(() => hit(warp, { хп: 10, макс: 20, кривое: 0 } as any), 'не число');
  });
});
