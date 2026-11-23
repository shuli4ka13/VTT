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
  id: 'срез-5e',
  tables: { лист: { shape: 'single', columns: [

    { key: 'скрытность', label: 'Скрытность', kind: 'number', default: 3, roll: { label: 'Проверка: Скрытность', tags: ['скрытность'] } },
  ] }, skills: { label: 'Навыки', key: 'word', rows: [{ value: 'скрытность' }] } },
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  roll_edits: {
    помеха: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] },
  },
  effects: {
    sneak: {
      label: 'Красться', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'скрыт', type: 'roll', die: 'lead', bonus: { expr: '@действующий.скрытность' }, tags: ['скрытность'], by: { expr: '@действующий' } },
        { id: 'бросок', type: 'check', value: { expr: '@скрыт' }, versus: { expr: '15' } },
        { type: 'branch', if: { expr: 'not @бросок.success' } }, { type: 'stop' }, { type: 'end' },
      ],
    },
  },
};

const compendium: any = {
  records: [{
    id: 'кольчуга', table: 'доспех', label: 'Кольчуга',
    modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['скрытность'], if: { expr: '@бросающий == @носитель' }, edit: 'помеха' }],
  }],
};

const hero: any = (equipped: string[]) => ({ id: 'вор', values: { скрытность: 3 }, has: [...equipped.map(of => ({ of }))], effects: [] });

const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number, base: any = { records: [] }) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', ...rule } },
  };
  const book: any = { ...base, records: [...base.records, { id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'действующий-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const sneakIn = (world: any, equipped: string[], ...dice: number[]) => {
  const sheet = hero(equipped);
  const out = runRule(world, world.effects.sneak, sheet, { id: 'цель-теста', values: {}, effects: [] }, queue(...dice), compendium);
  const t = out.trace.find(line => line.step === 'бросок')!;
  return { trace: out.trace, results: { бросок: { total: t.total, success: t.success } } as any };
};
const sneak = (equipped: string[], ...dice: number[]) => sneakIn(sys, equipped, ...dice);

group('тяжёлый доспех мешает красться', () => {
  test('без доспеха — одна кость', () => {
    const r = sneak([], 14);
    deepEq(r.trace[0].rolls, [14]);
    eq(r.results.бросок.total, 17, '14 плюс Скрытность 3');
    eq(r.results.бросок.success, true);
  });

  test('в кольчуге — две кости, берётся худшая', () => {
    const r = sneak(['кольчуга'], 14, 4);
    deepEq(r.trace[0].rolls, [14, 4], 'помеха приехала от самой вещи');
    eq(r.trace[0].kept, 4);
    eq(r.results.бросок.total, 7);
    eq(r.results.бросок.success, false, 'красться в кольчуге и правда тяжело');
  });

  test('снял кольчугу — помеха ушла сама, ничего не снимая с персонажа', () => {
    deepEq(sneak([], 14, 4).trace[0].rolls, [14]);
  });

  test('журнал называет правку именем автора', () => {
    deepEq(sneak(['кольчуга'], 14, 4).trace[0].edits, ['Помеха']);
  });

  test('на другие броски помеха не распространяется', () => {

    const other: any = {
      ...sys,
      effects: {
        sneak: {
          ...sys.effects.sneak,
          steps: sys.effects.sneak.steps.map((step: any) => (step.id === 'скрыт' ? { ...step, tags: [], bonus: { expr: '3' } } : step)),
        },
      },
    };
    const r = sneakIn(other, ['кольчуга'], 14, 4);
    deepEq(r.trace[0].rolls, [14], 'это уже не проверка Скрытности');
  });
});
