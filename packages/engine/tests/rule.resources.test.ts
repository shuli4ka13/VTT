import { group, test, eq, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
import { fireMoments } from './kit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true };
const EACH = { type: 'each', of: 'цели', as: 'цель' };
const OWN = { expr: '@бросающий == @носитель' };

const system = {
  id: 'r', name: 'r',
  tables: { лист: { shape: 'single', columns: [
    { key: 'уровень', label: 'Уровень', kind: 'number', default: 5 },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 40, min: 0 },
    { key: 'ячейки_1', label: 'Ячейки 1-го круга', kind: 'number', default: 1, min: 0 },
    { key: 'ячейки_2', label: 'Ячейки 2-го круга', kind: 'number', min: 0 },
    { key: 'ячейки_1_всего', label: 'Всего ячеек 1-го круга', kind: 'number', default: 4 },
  ] } , чары: { shape: 'book', use: 'action', label: 'Чары', columns: [], bindings: [{ label: 'Сотворить', effect: 'стрела', args: {} }] }, приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Ударить', effect: 'скрытая', args: {} }] } },
  effects: {
    ячейка: {
      label: 'Ячейка заклинания',
      params: [{ key: 'лист', label: 'Чья ячейка', kind: 'sheet' }, { key: 'круг', label: 'Круг', kind: 'number', role: 'amount' }],
      steps: [
        { id: 'есть_1', type: 'check', value: { expr: '@лист.ячейки_1' }, versus: { expr: '1' }, note: 'не хватает ячейки 1-го круга', if: { expr: '@круг == 1' } },
        { type: 'apply', target: { expr: '@лист.ячейки_1' }, direction: 'subtract', value: { expr: '1' }, if: { expr: '@круг == 1' } },
        { id: 'есть_2', type: 'check', value: { expr: '@лист.ячейки_2' }, versus: { expr: '1' }, note: 'не хватает ячейки 2-го круга', if: { expr: '@круг == 2' } },
        { type: 'apply', target: { expr: '@лист.ячейки_2' }, direction: 'subtract', value: { expr: '1' }, if: { expr: '@круг == 2' } },
      ],
    },
    стрела: {
      label: 'Волшебная стрела', activation: 'manual',
      params: [ACTOR, TARGETS, { key: 'круг', label: 'Каким кругом', kind: 'number', min: 1, max: 2, ask: { by: 'actor' } }],
      cost: [{ type: 'emit', event: 'ячейка', args: { лист: { expr: '@действующий' }, круг: { expr: '@круг' } } }],
      steps: [
        EACH,
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d4', 2 + @круг)" }, bonus: { expr: '2 + @круг' } },
        { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    скрытая: {
      label: 'Скрытая атака', activation: 'manual',
      params: [ACTOR, TARGETS],
      steps: [
        EACH,
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d6', округлить вверх(@действующий.уровень / 2))" } },
        { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    сон: {
      label: 'Долгий отдых: ячейки', activation: 'passive',
      on: [{ on: 'moment:long-rest', steps: [{ type: 'apply', target: { expr: '@носитель.ячейки_1' }, direction: 'set', value: { expr: '@носитель.ячейки_1_всего' } }] }],
    },
  },
  grants: ['сон'],
  
} as unknown as System;
const book = { records: [{ id: 'стрела', table: 'чары', label: 'Волшебная стрела', cells: {} }, { id: 'скрытая', table: 'приём', label: 'Скрытая атака', cells: {} }] } as unknown as Compendium;
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
    const trace = out.reports.at(-1)!.report.trace[0] as { rolls: number[]; bonus: number };
    eq(trace.rolls.length, 3, 'две кости плюс круг');
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
      EACH,
      { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d6', 0)" }, bonus: { expr: '2' } },
      { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } },
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

  test('ячейки нет — отказ словами автора: какого круга не хватает', () => {
    throws(() => cast(2), 'не хватает ячейки 2-го круга');
    throws(() => cast(1, [sheet('маг', { ячейки_1: 0 }), sheet('цель')]), 'не хватает ячейки 1-го круга');
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
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: { лист: { shape: 'single', columns: [
      { key: 'лов', label: 'Ловкость', kind: 'number', default: 2 },
      { key: 'спас_лов', label: 'Спасбросок Ловкости', expr: '@лов' },
      { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    ] },
      rolls: { label: 'Броски', key: 'word', rows: [{ value: 'спас' }] },
      черты: {
        label: 'Характеристики', key: 'word',
        columns: [{ key: 'спас', label: 'Спасбросок', kind: 'number' }],
        rows: [{ value: 'лов', cells: { спас: { expr: '@спас_лов' } } }],
      },
     чары: { shape: 'book', use: 'action', label: 'Чары', columns: [], bindings: [{ label: 'Шар', effect: 'шар', args: { чем: 'лов' } }] } },
    roll_edits: { помеха: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] } },
    effects: {
      опутан: { label: 'Опутан', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['спас', 'лов'], if: OWN, edit: 'помеха' }] },
      шар: {
        label: 'Шар', activation: 'manual',
        params: [ACTOR, TARGETS, { key: 'чем', label: 'Чем спасаются', kind: 'choice', from: 'черты' }],
        steps: [
          EACH,
          { id: 'спас_бросок', type: 'roll', die: { constant: 'к20' }, bonus: { expr: '@цель.чем.спас' }, tags: ['спас', { expr: '@чем' }], by: { expr: '@цель' }, against: { expr: '@действующий' } },
          { id: 'спас', type: 'check', value: { expr: '@спас_бросок' }, versus: { expr: '12' }, continueOn: 'always' },
        ],
      },
    },
    
  } as unknown as System;
  const spells = { records: [{ id: 'шар', table: 'чары', label: 'Шар', cells: {} }] } as unknown as Compendium;
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

  test('прибавка — колонка выбранной строки, посчитанная листом цели', () => {
    eq(cast([], { лов: 5 }).bonus, 5, 'Ловкость цели, а не мага');
  });
});

group('общий держатель: взялся за новое — старое спало', () => {
  const sys = {
    id: 'c', name: 'c',
    tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } , а: { shape: 'book', use: 'action', label: 'А', columns: [], bindings: [{ label: 'Благословение', effect: 'благословение', args: {} }] }, б: { shape: 'book', use: 'action', label: 'Б', columns: [], bindings: [{ label: 'Ускорение', effect: 'ускорение', args: {} }] } },
    effects: {
      концентрация: { label: 'Концентрация', activation: 'passive', on: [{ on: 'moment:scene-end', steps: [] }] },
      благословлён: { label: 'Благословлён', activation: 'passive', modifiers: [] },
      ускорен: { label: 'Ускорен', activation: 'passive', modifiers: [] },
      благословение: { label: 'Благословение', activation: 'manual', bond: { effect: 'концентрация', by: 'действующий' }, params: [ACTOR, TARGETS], steps: [EACH, { type: 'status', mode: 'apply', effect: { const: 'благословлён' }, to: { expr: '@цель' } }] },
      ускорение: { label: 'Ускорение', activation: 'manual', bond: { effect: 'концентрация', by: 'действующий' }, params: [ACTOR, TARGETS], steps: [EACH, { type: 'status', mode: 'apply', effect: { const: 'ускорен' }, to: { expr: '@цель' } }] },
    },
    
  } as unknown as System;
  const spells = { records: [{ id: 'а', table: 'а', label: 'Благословение', cells: {} }, { id: 'б', table: 'б', label: 'Ускорение', cells: {} }] } as unknown as Compendium;
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
    tables: { лист: { shape: 'single', columns: [{ key: 'кд', label: 'Класс брони', kind: 'number', default: 10 }] } , черта: { shape: 'book', use: 'action', label: 'Черта', columns: [], bindings: [] } },
    effects: { стойка: { label: 'Оборонительная стойка', activation: 'passive', modifiers: [{ kind: 'value', target: 'кд', op: 'add', value: { expr: '1' }, stacking: 'sum' }] } },
    
  } as unknown as System;
  const feats = { records: [{ id: 'оборона', table: 'черта', label: 'Боевой стиль: оборона', cells: {}, grants: ['стойка'] }] } as unknown as Compendium;

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
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: { лист: { shape: 'single', columns: [
      { key: 'хиты', label: 'Хиты', kind: 'number', default: 30 },
      { key: 'кд', label: 'Класс брони', kind: 'number', default: 10 },
      { key: 'крит_от', label: 'Крит от', kind: 'number', default: 19 },
      { key: 'заряды', label: 'Заряды', kind: 'number', default: 1, min: 0 },
    ] }, rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] } , а: { shape: 'book', use: 'action', label: 'А', columns: [], bindings: [{ label: 'Поджечь', effect: 'поджечь', args: {} }] }, б: { shape: 'book', use: 'action', label: 'Б', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
    roll_edits: { порча: { label: 'Порча', ops: [{ op: 'bonusDie', sides: 4, minus: true }] } },
    effects: {
      горит: {
        label: 'Горит', activation: 'passive', params: [{ key: 'сила', label: 'Сила', kind: 'number', optional: true }],
        on: [{ on: 'moment:turn-start', steps: [{ type: 'apply', target: { expr: '@носитель.хиты' }, direction: 'subtract', value: { expr: '@сила' } }] }],
      },
      поджечь: { label: 'Поджечь', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, { type: 'status', mode: 'apply', effect: { const: 'горит' }, to: { expr: '@цель' }, args: { сила: { expr: '4' } } }] },
      порченый: { label: 'Порченый', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], if: OWN, edit: 'порча' }] },
      удар: {
        label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [
          EACH,
          { id: 'hit_бросок', type: 'roll', die: { constant: 'к20' }, tags: ['атака'], by: { expr: '@действующий' }, against: { expr: '@цель' } },
          { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '@цель.кд' } },
          { id: 'dmg', type: 'roll', fixed: { expr: "кинуть('1d6', если(@hit.natural >= @действующий.крит_от, 2, 1))" } },
          { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@dmg' } },
        ],
      },
      парирование: {
        label: 'Парирование', activation: 'passive',
        on: [{ on: 'before:удар', if: { expr: '@цель == @носитель' }, confirm: true, cost: [
          { type: 'check', value: { expr: '@носитель.заряды' }, versus: { expr: '1' } },
          { type: 'apply', target: { expr: '@носитель.заряды' }, direction: 'subtract', value: { expr: '1' } },
        ], steps: [] }],
      },
    },
    
  } as unknown as System;
  const acts = { records: [{ id: 'а', table: 'а', label: 'Поджечь', cells: {} }, { id: 'б', table: 'б', label: 'Удар', cells: {} }] } as unknown as Compendium;
  const who = (id: string, worn: string[] = [], values: Record<string, number> = {}): Sheet => ({
    id, systemId: 'k', name: id, values, has: [{ of: 'а' }, { of: 'б' }], effects: worn.map(effectId => ({ effectId })),
  } as unknown as Sheet);

  test('состояние запомнило четвёрку и в начале хода снимает именно её', () => {
    const lit = exchange({ system: sys, compendium: acts, die: () => 1, sheets: [who('маг'), who('цель')], actionId: 'а:0', fromId: 'маг', toId: 'цель' });
    deepEq(lit.sheets.find(s => s.id === 'цель')!.effects, [{ effectId: 'горит', args: { сила: 4 } }]);
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
    eq((crit.reports[0]!.report.trace[2] as { rolls: number[] }).rolls.length, 2);
    const at18 = [18, 2];
    const plain = exchange({ system: sys, compendium: acts, die: () => at18.shift() ?? 1, sheets: [who('воин'), who('цель')], actionId: 'б:0', fromId: 'воин', toId: 'цель' });
    eq((plain.reports[0]!.report.trace[2] as { rolls: number[] }).rolls.length, 1);
  });

  test('реакция платит своей дорожкой: нет заряда — не предложена, есть — предложена и списан', () => {
    const parry = (target: Sheet) => exchange({
      system: sys, compendium: acts, die: () => 10, sheets: [who('воин'), target], actionId: 'б:0', fromId: 'воин', toId: 'цель',
      answer: question => question.offers.map(offer => offer.id),
    });
    const paid = parry(who('цель', ['парирование']));
    eq(paid.sheets.find(s => s.id === 'цель')!.values.заряды, 0);
    deepEq(paid.questions.map(q => q.offers.map(o => o.id)), [['парирование']]);
    const refused = parry(who('цель', ['парирование'], { заряды: 0 }));
    eq(refused.sheets.find(s => s.id === 'цель')!.values.заряды, 0);
    eq(refused.questions.length, 0, 'без заряда реакцию даже не предлагают');
  });
});
