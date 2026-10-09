import { group, test, eq, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'ветвление',
  tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'спас' }] } },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Хиты', kind: 'number', default: 20, min: 0 },
    { key: 'уровень', label: 'Уровень', kind: 'number', default: 3 },
  ] }, исход: { label: 'Исход', key: 'range', columns: [{ key: 'value', label: 'исход', kind: 'text' }], rows: [
    { from: -100, to: 9, cells: { value: 'провал' } }, { from: 10, to: 14, cells: { value: 'частичный' } },
    { from: 15, to: 100, cells: { value: 'полный' } },
  ] } },
  effects: {},
};

const sender = { id: 'маг', systemId: 'ветвление', name: 'маг', values: { хп: 20, уровень: 6 }, has: [{ of: 'e' }], effects: [] };
const target = { id: 'цель', systemId: 'ветвление', name: 'цель', values: { хп: 20, уровень: 3 }, has: [], effects: [] };
const book: any = { records: [{ id: 'e', table: 'приём', label: 'E', bindings: [{ label: 'E', effect: 'e', args: {} }] }] };

const play = (steps: any[], ...dice: number[]) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { e: { label: 'E', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }], steps: [{ type: 'each', of: 'цели' }, ...steps] } },
  };
  const out = exchange({ system: full, compendium: book, die: queue(...dice), sheets: [sender, target] as any, actionId: 'e:0', fromId: 'маг', toId: 'цель' });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find(s => s.id === 'цель')!, stopped: report.stopped, trace: report.trace as any[] };
};

const save = { id: 'спас_бросок', type: 'roll', die: 'к20', bonus: { expr: '0' }, tags: ['спас'], by: { expr: '@цель' }, against: { expr: '@действующий' } };
const saveCheck = { id: 'спас', type: 'check', value: { expr: '@спас_бросок' }, versus: { expr: '12' } };

group('ветвление по исходу: блоки «Если» / «Иначе»', () => {
  const halfOnSave = [
    save, saveCheck,
    { type: 'branch', if: { expr: 'не(@спас.success)' } },
    { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '8' } },
    { type: 'orElse' },
    { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '4' } },
    { type: 'end' },
  ];

  test('провалил спасбросок — полный урон, шаг «половина» пропущен', () => {
    const r = play(halfOnSave, 5);
    eq(r.sheet.values.хп, 12);
    eq(r.stopped, null, 'проверка без «Стоп» не обрывает цепочку');
    deepEq(r.trace.map(t => Boolean(t.skipped)), [false, false, false, true]);
  });

  test('спасся — половина урона, шаг «полный» пропущен', () => {
    const r = play(halfOnSave, 18);
    eq(r.sheet.values.хп, 16);
    deepEq(r.trace.map(t => Boolean(t.skipped)), [false, false, true, false]);
  });

  test('страж по степени успеха: «is» сравнивает с ярлыком таблицы', () => {
    const graded = [
      save,
      { ...saveCheck, degrees: { table: 'исход', of: 'total' } },
      { type: 'branch', if: { expr: '@спас.degree == "полный"' } },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '10' } },
      { type: 'orElse', if: { expr: '@спас.degree == "частичный"' } },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '3' } },
      { type: 'end' },
    ];
    eq(play(graded, 17).sheet.values.хп, 10, 'полный успех');
    eq(play(graded, 11).sheet.values.хп, 17, 'частичный');
    eq(play(graded, 2).sheet.values.хп, 20, 'провал — ни один шаг не сработал');
  });

  test('страж-формула действующего считается его листом (шестой уровень), а не цели (третий)', () => {
    const steps = [
      { type: 'branch', if: { expr: '@действующий.уровень >= 5' } },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '5' } },
      { type: 'end' },
    ];
    eq(play(steps).sheet.values.хп, 15);
  });

  test('страж-формула цели считается её листом', () => {
    const steps = [
      { type: 'branch', if: { expr: '@цель.уровень >= 5' } },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '5' } },
      { type: 'end' },
    ];
    eq(play(steps).sheet.values.хп, 20, 'у цели третий уровень — шаг пропущен');
  });

  test('страж, дающий не да/нет, — внятная ошибка', () => {
    const steps = [
      { id: 'n', type: 'roll', fixed: { expr: '3' } },
      { type: 'branch', if: { expr: '@n' } },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '5' } },
      { type: 'end' },
    ];
    throws(() => play(steps), 'да/нет');
  });

  test('шаг без стража работает как раньше — совместимость с мирами до ветвления', () => {
    eq(play([{ type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1' } }]).sheet.values.хп, 19);
  });
});
