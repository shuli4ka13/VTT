import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from './play.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'криты',
  tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'проверка' }] } },
  constants: {
    пул: { label: 'Пул', kind: 'die', dice: [{ count: 3, sides: 6 }], read: 'best' },
  },
  effects: {},
};

const sheet = { id: 'герой', values: {}, effects: [] };

const rule: any = {
  steps: [
    {
      id: 'roll', type: 'threshold',
      roll: { die: { constant: 'пул' }, bonus: { expr: '0' }, tags: ['проверка'] },
      versus: { expr: '4' },
    },
    { id: 'крит', type: 'compare', value: { expr: '@roll.atMax' }, versus: { expr: '2' }, breakIf: 'less' },
  ],
};

const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number, base: any = { records: [] }) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', ...rule } },
  };
  const book: any = { ...base, records: [...base.records, { id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'отправитель-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const PROBE_KEYS = ['rolled', 'atMax', 'atMin'];
const probed = (sys: any, rule: any, stepId: string, sender: any, die: () => number) => {
  const columns = PROBE_KEYS.map(key => ({ key: `зонд_${key}`, label: key, kind: 'number', default: -1 }));
  const withProbe: any = { ...sys, tables: { ...sys.tables, лист: { shape: 'single', columns: [...(sys.tables.лист?.columns ?? []), ...columns] } } };
  const at = rule.steps.findIndex((step: any) => step.id === stepId) + 1;
  const writes = PROBE_KEYS.map(key => ({ type: 'apply', target: { tag: `зонд_${key}` }, direction: 'set', targetModifiers: false, value: { expr: `@${stepId}.${key}` } }));
  const steps = [...rule.steps.slice(0, at), ...writes, ...rule.steps.slice(at)];
  const target = { id: 'цель-теста', values: {}, effects: [] };
  const out = runRule(withProbe, { ...rule, steps }, sender, target, die);
  const roll = out.trace.find(t => t.step === stepId);
  return {
    stopped: out.stopped,
    results: { [stepId]: {
      rolled: out.sheet.values.зонд_rolled, atMax: out.sheet.values.зонд_atMax, atMin: out.sheet.values.зонд_atMin,
      dice: { rolls: roll?.rolls },
    } } as any,
  };
};

const run = (...dice: number[]) => probed(sys, rule, 'roll', sheet, queue(...dice));

group('криты и глитчи собираются автором', () => {
  test('счёт по натуральному броску виден в результате шага', () => {
    const r = run(6, 6, 3);
    eq(r.results.roll.rolled, 3, 'кинуто три кости');
    eq(r.results.roll.atMax, 2, 'две шестёрки');
    eq(r.results.roll.atMin, 0);
  });

  test('две шестёрки — цепочка идёт дальше (крит Blades)', () => {
    const r = run(6, 6, 3);
    eq(r.stopped, null, 'сравнение пропустило: на максимуме две');
  });

  test('одна шестёрка — цепочка обрывается: крита нет', () => {
    const r = run(6, 2, 3);
    eq(r.results.roll.atMax, 1);
    eq(Boolean(r.stopped), true, 'до крита не дошло');
  });

  test('единицы считаются отдельно — из них собирается глитч', () => {
    const r = run(1, 1, 5);
    eq(r.results.roll.atMin, 2);
    eq(r.results.roll.rolled, 3, 'половину пула сравнивать уже есть с чем');
  });

  test('счёт снят с НАТУРАЛЬНОГО броска, до правок результата', () => {

    const explosive: any = {
      ...sys,
      roll_edits: { взрыв: { label: 'Взрыв', ops: [{ op: 'explode' }] } },
      effects: {
        всегда: {
          label: 'Взрывные кости', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['проверка'], edit: 'взрыв' }],
        },
      },
    };
    const hot = { ...sheet, effects: [{ effectId: 'всегда' }] };
    const r = probed(explosive, rule, 'roll', hot, queue(6, 2, 3, 4));
    eq(r.results.roll.atMax, 1, 'шестёрка была одна, хоть и выросла до десяти');
    deepEq(r.results.roll.dice.rolls, [10, 2, 3], 'в журнале — уже выросшая');
  });
});
