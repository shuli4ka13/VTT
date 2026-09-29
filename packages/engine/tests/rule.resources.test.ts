import { group, test, eq, deepEq, throws } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { fireMoments } from '../src/events/moments.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'r', name: 'r',
  fields: [
    { tag: 'уровень', label: 'Уровень', value: { kind: 'stored', type: 'number', default: 5 } },
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 40, min: 0 } },
    { tag: 'ячейки_1', label: 'Ячейки 1-го круга', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
    { tag: 'ячейки_2', label: 'Ячейки 2-го круга', value: { kind: 'stored', type: 'number', default: 0, min: 0 } },
    { tag: 'ячейки_1_всего', label: 'Всего ячеек 1-го круга', value: { kind: 'stored', type: 'number', default: 4 } },
  ],
  effects: {
    ячейка: {
      label: 'Ячейка заклинания',
      params: [{ key: 'круг', label: 'Круг', kind: 'number', role: 'amount' }],
      steps: [
        { id: 'есть_1', type: 'compare', value: { expr: '@получатель.ячейки_1' }, versus: { expr: '1' }, breakIf: 'less', when: { expr: '@event.amount == 1' } },
        { type: 'apply', target: { tag: 'ячейки_1' }, direction: 'subtract', value: { expr: '1' }, when: { expr: '@event.amount == 1' } },
        { id: 'есть_2', type: 'compare', value: { expr: '@получатель.ячейки_2' }, versus: { expr: '1' }, breakIf: 'less', when: { expr: '@event.amount == 2' } },
        { type: 'apply', target: { tag: 'ячейки_2' }, direction: 'subtract', value: { expr: '1' }, when: { expr: '@event.amount == 2' } },
      ],
    },
    стрела: {
      label: 'Волшебная стрела', activation: 'manual',
      params: [{ key: 'круг', label: 'Каким кругом', kind: 'number', ask: { by: 'actor', min: 1, max: 2 } }],
      self: [{ type: 'emit', event: 'ячейка', args: { круг: { param: 'круг' } }, strict: true }],
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d4' }, count: { expr: '2 + #круг' }, bonus: { expr: '2 + #круг' } },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    скрытая: {
      label: 'Скрытая атака', activation: 'manual',
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d6' }, count: { expr: 'округлить вверх(#уровень / 2)' } },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    сон: {
      label: 'Долгий отдых: ячейки', activation: 'passive',
      on: [{ on: 'moment:long-rest', steps: [{ type: 'apply', target: { tag: 'ячейки_1' }, direction: 'set', value: { expr: '@получатель.ячейки_1_всего' } }] }],
    },
  },
  grants: ['сон'],
  records: {
    чары: { kind: 'action', label: 'Чары', props: [], bindings: [{ label: 'Сотворить', effect: 'стрела', args: {} }] },
    приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Ударить', effect: 'скрытая', args: {} }] },
  },
} as unknown as System;
const book = { records: [{ id: 'стрела', rk: 'чары', label: 'Волшебная стрела', props: {} }, { id: 'скрытая', rk: 'приём', label: 'Скрытая атака', props: {} }] } as unknown as Compendium;
const sheet = (id: string, values: Record<string, number> = {}): Sheet => ({
  id, systemId: 'r', name: id, values, has: [{ of: 'стрела' }, { of: 'скрытая' }], effects: []
} as unknown as Sheet);
const cast = (slot: number, sheets = [sheet('маг'), sheet('цель')]) => exchange({
  system, compendium: book, die: () => 3, sheets, actionId: 'стрела:0', fromId: 'маг', toId: 'цель', inputs: { круг: slot },
});

group('счёт костей числом и названное игроком в формулах', () => {
  test('образец чист для линта: имена входов в формулах — не поля', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
  });

  test('«круг» из вопроса входит и в число костей, и в прибавку', () => {
    const out = cast(1);
    const trace = out.reports.at(-1)!.report.trace[0] as { rolls: number[]; bonus: number; times: number };
    eq(trace.rolls.length, 3, 'две кости плюс круг');
    eq(trace.times, 3);
    eq(trace.bonus, 3);
    eq(out.sheets.find(s => s.id === 'цель')!.values.хиты, 40 - 9 - 3);
  });

  test('кости по формуле от уровня: скрытая атака пятого уровня — три кости', () => {
    const out = exchange({
      system, compendium: book, die: () => 6, sheets: [sheet('плут'), sheet('цель')],
      actionId: 'скрытая:0', fromId: 'плут', toId: 'цель',
    });
    eq((out.reports[0]!.report.trace[0] as { rolls: number[] }).rolls.length, 3);
  });

  test('ноль раз — костей нет вовсе, а шаг не падает', () => {
    const none = { ...system, effects: { ...system.effects, скрытая: { ...system.effects.скрытая, steps: [
      { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d6' }, count: { expr: '0' }, bonus: { expr: '2' } },
      { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
    ] } } } as unknown as System;
    const out = exchange({
      system: none, compendium: book, die: () => { throw new Error('кость не должна кидаться'); },
      sheets: [sheet('плут'), sheet('цель')], actionId: 'скрытая:0', fromId: 'плут', toId: 'цель',
    });
    eq(out.sheets.find(s => s.id === 'цель')!.values.хиты, 38);
  });
});

group('плата ресурсом: общий эффект оборвался — действие не состоялось', () => {
  test('ячейка есть — тратится одна, заклинание проходит', () => {
    const out = cast(1);
    eq(out.sheets.find(s => s.id === 'маг')!.values.ячейки_1, 0);
  });

  test('ячейки нет — отказ словами, с именем поля и остатком', () => {
    throws(() => cast(2), 'не хватает «Ячейки 2-го круга»');
    throws(() => cast(1, [sheet('маг', { ячейки_1: 0 }), sheet('цель')]), 'сейчас 0');
  });
});

group('отдых — момент, как начало хода', () => {
  test('долгий отдых возвращает ячейки по формуле листа', () => {
    const tired = sheet('маг', { ячейки_1: 0 });
    const out = fireMoments([{ moment: 'long-rest', sheetId: 'маг' }], [tired], { system, compendium: book, die: () => 1 });
    eq(out.sheets[0]!.values.ячейки_1, 4);
    eq(fireMoments([{ moment: 'short-rest', sheetId: 'маг' }], [tired], { system, compendium: book, die: () => 1 }).reports.length, 0);
  });
});

group('бросок несёт несколько меток, одна приходит входом', () => {
  const sys = {
    id: 'm', name: 'm',
    fields: [
      { tag: 'лов', label: 'Ловкость', value: { kind: 'stored', type: 'number', default: 2 } },
      { tag: 'спас_лов', label: 'Спасбросок Ловкости', value: { kind: 'formula', expr: '@лов' } },
      { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    ],
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: {
      rolls: { label: 'Броски', key: 'word', rows: [{ value: 'спас' }] },
      черты: {
        label: 'Характеристики', key: 'word',
        columns: [{ key: 'спас', label: 'Спасбросок', kind: 'expr' }],
        rows: [{ value: 'лов', cells: { спас: '@спас_лов' } }],
      },
    },
    roll_edits: { помеха: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] } },
    effects: {
      опутан: { label: 'Опутан', activation: 'passive', modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['спас', 'лов'], edit: 'помеха' }] },
      шар: {
        label: 'Шар', activation: 'manual',
        params: [{ key: 'чем', label: 'Чем спасаются', kind: 'choice', from: 'черты' }],
        steps: [{
          id: 'спас', type: 'threshold', side: 'target',
          roll: { die: { constant: 'к20' }, bonus: { expr: '@получатель.чем.спас' }, tags: ['спас', { param: 'чем' }] },
          versus: { expr: '12' }, continueOn: 'always',
        }],
      },
    },
    records: { чары: { kind: 'action', label: 'Чары', props: [], bindings: [{ label: 'Шар', effect: 'шар', args: { чем: 'лов' } }] } },
  } as unknown as System;
  const spells = { records: [{ id: 'шар', rk: 'чары', label: 'Шар', props: {} }] } as unknown as Compendium;
  const who = (id: string, worn: string[] = []): Sheet => ({
    id, systemId: 'm', name: id, values: {}, has: [{ of: 'шар' }], effects: worn.map(effectId => ({ effectId })),
  } as unknown as Sheet);

  const cast = (worn: string[], values: Record<string, number> = {}) => {
    const rolls = [15, 4];
    const target = { ...who('цель', worn), values };
    const out = exchange({
      system: sys, compendium: spells, die: () => rolls.shift() ?? 1,
      sheets: [{ ...who('маг'), values: { лов: 9 } }, target], actionId: 'шар:0', fromId: 'маг', toId: 'цель',
    });
    return out.reports[0]!.report.trace[0] as { rolls: number[]; kept: number; bonus: number; tags: string[] };
  };

  test('помеха на «спасбросок + лов» ловит спасбросок, где характеристику назвал вход', () => {
    const trace = cast(['опутан']);
    deepEq(trace.tags, ['спас', 'лов']);
    deepEq(trace.rolls, [15, 4]);
    eq(trace.kept, 4);
  });

  test('прибавка — колонка выбранной строки, посчитанная листом получателя', () => {
    eq(cast([], { лов: 5 }).bonus, 5, 'Ловкость цели, а не мага');
  });
});

group('общий держатель: взялся за новое — старое спало', () => {
  const sys = {
    id: 'c', name: 'c',
    fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
    effects: {
      концентрация: { label: 'Концентрация', activation: 'passive', on: [{ on: 'moment:scene-end', steps: [] }] },
      благословлён: { label: 'Благословлён', activation: 'passive', modifiers: [] },
      ускорен: { label: 'Ускорен', activation: 'passive', modifiers: [] },
      благословение: { label: 'Благословение', activation: 'manual', bond: 'концентрация', steps: [{ type: 'status', mode: 'apply', effect: { const: 'благословлён' } }] },
      ускорение: { label: 'Ускорение', activation: 'manual', bond: 'концентрация', steps: [{ type: 'status', mode: 'apply', effect: { const: 'ускорен' } }] },
    },
    records: {
      а: { kind: 'action', label: 'А', props: [], bindings: [{ label: 'Благословение', effect: 'благословение', args: {} }] },
      б: { kind: 'action', label: 'Б', props: [], bindings: [{ label: 'Ускорение', effect: 'ускорение', args: {} }] },
    },
  } as unknown as System;
  const spells = { records: [{ id: 'а', rk: 'а', label: 'Благословение', props: {} }, { id: 'б', rk: 'б', label: 'Ускорение', props: {} }] } as unknown as Compendium;
  const who = (id: string): Sheet => ({ id, systemId: 'c', name: id, values: {}, has: [{ of: 'а' }, { of: 'б' }], effects: [] } as unknown as Sheet);
  const worn = (sheets: Sheet[], id: string) => sheets.find(s => s.id === id)!.effects.map(e => e.effectId);

  test('держатель один на оба заклинания, второе снимает первое', () => {
    const first = exchange({ system: sys, compendium: spells, die: () => 1, sheets: [who('жрец'), who('друг')], actionId: 'а:0', fromId: 'жрец', toId: 'друг' });
    deepEq(worn(first.sheets, 'жрец'), ['концентрация']);
    deepEq(worn(first.sheets, 'друг'), ['благословлён']);
    const second = exchange({ system: sys, compendium: spells, die: () => 1, sheets: first.sheets, actionId: 'б:0', fromId: 'жрец', toId: 'друг' });
    deepEq(worn(second.sheets, 'друг'), ['ускорен'], 'благословение спало, ускорение легло');
    deepEq(worn(second.sheets, 'жрец'), ['концентрация']);
  });
});

group('запись выдаёт эффект владельцу', () => {
  const sys = {
    id: 'g', name: 'g',
    fields: [{ tag: 'кд', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
    effects: { стойка: { label: 'Оборонительная стойка', activation: 'passive', modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '1' }, stacking: 'sum' }] } },
    records: { черта: { kind: 'action', label: 'Черта', props: [], bindings: [] } },
  } as unknown as System;
  const feats = { records: [{ id: 'оборона', rk: 'черта', label: 'Боевой стиль: оборона', props: {}, grants: ['стойка'] }] } as unknown as Compendium;

  test('выучил черту — эффект действует, хотя на листе его нет; разучил — перестал', async () => {
    const { calc, newPass } = await import('../src/engine/calc.ts');
    const knows = { id: 'в', systemId: 'g', name: 'в', values: {}, has: [{ of: 'оборона' }], effects: [] } as unknown as Sheet;
    eq(calc(sys, knows, 'кд', newPass(sys, knows, { compendium: feats })), 11);
    const forgot = { ...knows, has: [] } as Sheet;
    eq(calc(sys, forgot, 'кд', newPass(sys, forgot, { compendium: feats })), 10);
    deepEq(knows.effects, [], 'в данные листа ничего не записано');
  });
});

group('наложенное помнит число, штрафная кость, порог из поля, платная реакция', () => {
  const sys = {
    id: 'k', name: 'k',
    fields: [
      { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 30 } },
      { tag: 'кд', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } },
      { tag: 'крит_от', label: 'Крит от', value: { kind: 'stored', type: 'number', default: 19 } },
      { tag: 'заряды', label: 'Заряды', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
    ],
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] } },
    roll_edits: { порча: { label: 'Порча', ops: [{ op: 'bonusDie', sides: 4, minus: true }] } },
    effects: {
      горит: {
        label: 'Горит', activation: 'passive',
        on: [{ on: 'moment:turn-start', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@worn.carry' } }] }],
      },
      поджечь: { label: 'Поджечь', activation: 'manual', steps: [{ type: 'status', mode: 'apply', effect: { const: 'горит' }, carry: { expr: '4' } }] },
      порченый: { label: 'Порченый', activation: 'passive', modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['атака'], edit: 'порча' }] },
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [
          { id: 'hit', type: 'threshold', roll: { die: { constant: 'к20' }, tags: ['атака'] }, versus: { expr: '@получатель.кд' } },
          { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '1d6' }, double: { expr: '@hit.natural >= @крит_от' } },
          { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@dmg' } },
        ],
      },
      парирование: {
        label: 'Парирование', activation: 'passive',
        on: [{ on: '*', phase: 'before', confirm: true, self: [
          { type: 'compare', value: { expr: '@заряды' }, versus: { expr: '1' }, breakIf: 'less' },
          { type: 'apply', target: { tag: 'заряды' }, direction: 'subtract', value: { expr: '1' } },
        ], steps: [] }],
      },
    },
    records: {
      а: { kind: 'action', label: 'А', props: [], bindings: [{ label: 'Поджечь', effect: 'поджечь', args: {} }] },
      б: { kind: 'action', label: 'Б', props: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    },
  } as unknown as System;
  const acts = { records: [{ id: 'а', rk: 'а', label: 'Поджечь', props: {} }, { id: 'б', rk: 'б', label: 'Удар', props: {} }] } as unknown as Compendium;
  const who = (id: string, worn: string[] = [], values: Record<string, number> = {}): Sheet => ({
    id, systemId: 'k', name: id, values, has: [{ of: 'а' }, { of: 'б' }], effects: worn.map(effectId => ({ effectId })),
  } as unknown as Sheet);

  test('состояние запомнило четвёрку и в начале хода снимает именно её', () => {
    const lit = exchange({ system: sys, compendium: acts, die: () => 1, sheets: [who('маг'), who('цель')], actionId: 'а:0', fromId: 'маг', toId: 'цель' });
    deepEq(lit.sheets.find(s => s.id === 'цель')!.effects, [{ effectId: 'горит', carry: 4 }]);
    const burnt = fireMoments([{ moment: 'turn-start', sheetId: 'цель' }], lit.sheets, { system: sys, compendium: acts, die: () => 1 });
    eq(burnt.sheets.find(s => s.id === 'цель')!.values.хиты, 26);
  });

  test('штрафная кость вычитается из броска', () => {
    const rolls = [12, 3, 1];
    const out = exchange({ system: sys, compendium: acts, die: () => rolls.shift() ?? 1, sheets: [who('порченый', ['порченый']), who('цель')], actionId: 'б:0', fromId: 'порченый', toId: 'цель' });
    const hit = out.reports[0]!.report.trace[0] as { rolls: number[]; total: number };
    deepEq(hit.rolls, [12, -3]);
    eq(hit.total, 9);
  });

  test('порог крита берётся с листа бьющего: девятнадцать уже удваивает кости', () => {
    const at19 = [19, 2, 2];
    const crit = exchange({ system: sys, compendium: acts, die: () => at19.shift() ?? 1, sheets: [who('воин'), who('цель')], actionId: 'б:0', fromId: 'воин', toId: 'цель' });
    eq((crit.reports[0]!.report.trace[1] as { rolls: number[] }).rolls.length, 2);
    const at18 = [18, 2];
    const plain = exchange({ system: sys, compendium: acts, die: () => at18.shift() ?? 1, sheets: [who('воин'), who('цель')], actionId: 'б:0', fromId: 'воин', toId: 'цель' });
    eq((plain.reports[0]!.report.trace[1] as { rolls: number[] }).rolls.length, 1);
  });

  test('реакция платит своей дорожкой: нет заряда — отказ словами, есть — списан', async () => {
    const { send, react } = await import('../src/events/envelope.ts');
    const env = send('б:0', { system: sys, compendium: acts, die: () => 10, sheet: who('воин') });
    const ctx = (sheet: Sheet) => ({ system: sys, compendium: acts, die: () => 1, sheet });
    const paid = react(['парирование'], env, 'target', ctx(who('цель', ['парирование'])));
    eq(paid.sheet.values.заряды, 0);
    throws(() => react(['парирование'], env, 'target', ctx(who('цель', ['парирование'], { заряды: 0 }))), 'не хватает «Заряды»');
  });
});
