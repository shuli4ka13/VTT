import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import { availableActions } from '../src/events/actions.ts';
import { NOBODY } from '../src/engine/owners.ts';
import type { Question } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const pay = [
  { type: 'branch', if: { expr: '@действующий.ячейки < 1' } },
  { type: 'stop', note: { expr: '"нет ячейки"' } },
  { type: 'end' },
  { type: 'apply', target: { expr: '@действующий.ячейки' }, value: { expr: '1' } },
];
const save = (extra: Record<string, unknown> = {}) => ({ id: 'с', type: 'emit', effect: 'спас', args: { кто: { expr: '@цель' }, сложность: { expr: '13' } }, ...extra });
const hurt = (amount: string) => ({ type: 'emit', effect: 'урон', args: { кому: { expr: '@цель' }, сколько: { expr: amount } } });
const button = (id: string, label: string) => ({ label, effect: id, args: {} });

const system = {
  id: 'н', name: 'н',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] }, к6: { label: 'к6', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'кд', label: 'КД', kind: 'number', default: 12 },
      { key: 'ячейки', label: 'Ячейки', kind: 'number', default: 1, min: 0 }, { key: 'щит', label: 'Под щитом', kind: 'number', default: 0 },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [
      button('удар', 'Удар'), button('шар', 'Шар'), button('пиявка', 'Пиявка'), button('яд', 'Яд'), button('лечение', 'Лечение'), button('залп', 'Залп'),
    ] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'а', type: 'roll', die: 'к20', bonus: { expr: '3' }, by: { expr: '@действующий' } },
        { id: 'п', type: 'check', value: { expr: '@а' }, versus: { expr: '@цель.кд' }, succeedOn: { expr: '20' }, failOn: { expr: '1' } },
        { type: 'branch', if: { expr: '@п.success' } },
        { id: 'у', type: 'roll', die: 'к6', by: { expr: '@действующий' } },
        { type: 'apply', target: { expr: '@цель.хп' }, value: { expr: '@у.total' } },
        { type: 'end' },
      ],
      returns: [{ key: 'попал', label: 'попал', no: 'промах', kind: 'boolean', expr: { expr: '@п.success' } }],
    },
    спас: {
      label: 'Спасбросок', activation: 'manual',
      params: [{ key: 'кто', label: 'Кто спасается', kind: 'sheet', role: 'target' }, { key: 'сложность', label: 'Сложность', kind: 'number' }],
      steps: [
        { id: 'б', type: 'roll', die: 'к20', by: { expr: '@кто' } },
        { id: 'п', type: 'check', value: { expr: '@б' }, versus: { expr: '@сложность' }, degrees: [
          { label: 'провал на 5 и больше', if: { expr: 'not @success and @margin <= -5' } },
          { label: 'не спасся', if: { expr: 'not @success' } },
          { label: 'спасся', if: { expr: '@success' } },
        ] },
      ],
      returns: [
        { key: 'прошёл', label: 'спасся', no: 'не спасся', kind: 'boolean', expr: { expr: '@п.success' } },
        { key: 'ступень', label: 'ступень', kind: 'text', expr: { expr: '@п.degree' } },
      ],
    },
    урон: {
      label: 'Урон', activation: 'manual',
      params: [{ key: 'кому', label: 'Кому', kind: 'sheet', role: 'target' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ id: 'по', type: 'apply', target: { expr: '@кому.хп' }, value: { expr: '@сколько' } }],
    },
    шар: {
      label: 'Шар', activation: 'manual', params: [ACTOR, TARGETS], cost: pay,
      steps: [
        { id: 'у', type: 'roll', die: 'к6', times: { expr: '2' }, by: { expr: '@действующий' } },
        { type: 'each', of: 'цели' },
        save(),
        { type: 'branch', if: { expr: 'not @с.прошёл' } },
        hurt('@у.total'),
        { type: 'orElse' },
        hurt('floor(@у.total / 2)'),
        { type: 'end' },
      ],
    },
    пиявка: {
      label: 'Пиявка', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        { type: 'each', of: 'цели' },
        save(),
        { type: 'branch', if: { expr: 'not @с.прошёл' } },
        hurt('6'),
        { type: 'apply', target: { expr: '@действующий.хп' }, direction: 'add', value: { expr: '3' } },
        { type: 'end' },
      ],
    },
    яд: {
      label: 'Яд', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        { type: 'each', of: 'цели' },
        save(),
        { type: 'branch', if: { expr: '@с.ступень == "провал на 5 и больше"' } },
        hurt('10'),
        { type: 'orElse', if: { expr: 'not @с.прошёл' } },
        hurt('5'),
        { type: 'end' },
      ],
    },
    лечение: {
      label: 'Лечение', activation: 'manual', params: [ACTOR],
      steps: [{ type: 'apply', target: { expr: '@действующий.хп' }, direction: 'add', value: { expr: '5' } }],
    },
    залп: {
      label: 'Залп', activation: 'manual', params: [ACTOR, { ...TARGETS, count: { expr: '3' }, repeat: true }],
      steps: [{ type: 'each', of: 'цели' }, { id: 'к', type: 'roll', die: 'к6', by: { expr: '@действующий' } }, hurt('@к.total')],
    },
    добавка: {
      label: 'Добавка', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'after:удар', if: { expr: '@действующий == @holder and @попал' }, steps: [hurt('2')] }],
    },
    ответ: {
      label: 'Ответ', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'after:удар', if: { expr: '@цель == @holder and @попал' }, confirm: {}, manual: true, steps: [{ type: 'emit', effect: 'урон', args: { кому: { expr: '@действующий' }, сколько: { expr: '4' } } }] }],
    },
    сторож: {
      label: 'Сторож', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'after:урон', if: { expr: '@кому == @holder' }, steps: [{ type: 'apply', target: { expr: '@holder.щит' }, direction: 'set', value: { expr: '9' } }] }],
    },
    щит: {
      label: 'Щит', activation: 'passive', duration: { kind: 'permanent' },
      on: [{
        on: 'before:удар', if: { expr: '@цель == @holder and @попал and @holder.щит == 0' }, confirm: {}, manual: true,
        cost: [
          { type: 'branch', if: { expr: '@holder.ячейки < 1' } },
          { type: 'stop', note: { expr: '"нет ячейки"' } },
          { type: 'end' },
          { type: 'apply', target: { expr: '@holder.ячейки' }, value: { expr: '1' } },
        ],
        steps: [{ type: 'apply', target: { expr: '@holder.щит' }, direction: 'set', value: { expr: '1' } }],
      }],
    },
  },
} as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Приём', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, values: Record<string, number> = {}, effects: string[] = []): Sheet =>
  ({ id, systemId: 'н', name: id, values: { хп: 20, кд: 12, ячейки: 1, щит: 0, ...values }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;

const ACTIONS = ['удар', 'шар', 'пиявка', 'яд', 'лечение', 'залп'];
const idOf = (effect: string): string => `приём:${ACTIONS.indexOf(effect)}`;
const value = (played: { sheets: Sheet[] }, id: string, key: string): unknown => played.sheets.find(one => one.id === id)!.values[key];
const told = (played: { log: string[] }): string => played.log.join(' | ');

group('действие без цели: «никто» вместо листа', () => {
  const blind = (effect: string, die: () => number, answer?: (question: Question) => string[], sheets: Sheet[] = [sheet('а'), sheet('б')]) =>
    exchange({ system, compendium: book, die, sheets, actionId: idOf(effect), fromId: 'а', toIds: [NOBODY], ...(answer ? { answer } : {}) });

  test('удар: бросок, вопрос «Попал?» словами итога эффекта, после «попал» — урон «лёг бы», листы целы', () => {
    const played = blind('удар', queue(10, 4), question => [question.offers.find(offer => offer.label === 'попал')!.id]);
    eq(played.questions.length, 1);
    eq(played.questions[0]!.label, 'Приём · Удар: 13. Попал?');
    eq(played.questions[0]!.sheetId, 'а');
    eq(played.questions[0]!.offers.map(offer => offer.label).join('/'), 'попал/промах');
    eq(value(played, 'б', 'хп'), 20);
    ok(told(played).includes('без цели'), told(played));
    ok(told(played).includes('на цель легло бы: Хиты −4'), told(played));
    ok(!JSON.stringify(played.sheets).includes(NOBODY), 'служебный лист не хранится');
  });

  test('ответ «промах» — урон не бросается', () => {
    const played = blind('удар', queue(10), question => [question.offers.find(offer => offer.label === 'промах')!.id]);
    ok(!told(played).includes('легло бы'), told(played));
  });

  test('натуральные 20 и 1 решают исход без вопроса', () => {
    const crit = blind('удар', queue(20, 5), () => { throw new Error('вопроса быть не должно'); });
    ok(told(crit).includes('на цель легло бы: Хиты −5'), told(crit));
    const miss = blind('удар', queue(1), () => { throw new Error('вопроса быть не должно'); });
    ok(!told(miss).includes('легло бы'), told(miss));
  });

  test('подписка действующего «после: удар» получает ответ и бьёт «никого»', () => {
    const played = blind('удар', queue(10, 4), question => [question.offers[0]!.id], [sheet('а', {}, ['добавка']), sheet('б')]);
    ok(told(played).includes('Урон 2'), told(played));
  });

  test('спасбросок цели: вопроса нет, плата списана, урон обоих исходов в журнале', () => {
    const played = blind('шар', queue(3, 4), () => { throw new Error('вопроса быть не должно'); });
    eq(value(played, 'а', 'ячейки'), 0);
    const line = told(played);
    ok(line.includes('на цель легло бы: Спасбросок · Сложность 13'), line);
    ok(line.includes('провал на 5 и больше / не спасся: Урон 7'), line);
    ok(line.includes(' спасся: Урон 3'), line);
  });

  test('ветка «провал на 5 и больше» — три исхода', () => {
    const line = told(blind('яд', queue()));
    ok(line.includes('провал на 5 и больше: Урон 10'), line);
    ok(line.includes('не спасся: Урон 5'), line);
    ok(line.includes(' спасся: —'), line);
  });

  test('исход цели меняет свой лист — вопрос действующему, какой исход', () => {
    const asked: Question[] = [];
    const played = blind('пиявка', queue(), question => { asked.push(question); return [question.offers.find(offer => offer.label === 'не спасся')!.id]; });
    eq(asked.length, 1);
    eq(asked[0]!.offers.map(offer => offer.label).join('/'), 'провал на 5 и больше/не спасся/спасся');
    eq(value(played, 'а', 'хп'), 23);
    const spared = blind('пиявка', queue(), question => [question.offers.find(offer => offer.label === 'спасся')!.id]);
    eq(value(spared, 'а', 'хп'), 20);
  });

  test('число «никого» — «сколько» параметра', () => {
    const played = blind('залп', queue(1, 2, 3));
    eq(played.reports.filter(one => one.toId === NOBODY).length, 3);
  });

  test('действие на себя и действие по листу — как раньше', () => {
    eq(value(blind('лечение', queue()), 'а', 'хп'), 25);
    const hit = exchange({ system, compendium: book, die: queue(15, 4), sheets: [sheet('а'), sheet('б')], actionId: idOf('удар'), fromId: 'а', toIds: ['б'] });
    eq(value(hit, 'б', 'хп'), 16);
    const burnt = exchange({ system, compendium: book, die: queue(3, 4, 5), sheets: [sheet('а'), sheet('б')], actionId: idOf('шар'), fromId: 'а', toIds: ['б'] });
    eq(value(burnt, 'б', 'хп'), 13);
  });
});

group('мягкий отказ: не хватило платы — вопрос', () => {
  const broke = () => [sheet('а', { ячейки: 0 }), sheet('б')];
  const cast = (extra: Record<string, unknown> = {}) => exchange({ system, compendium: book, die: queue(3, 4, 5), sheets: broke(), actionId: idOf('шар'), fromId: 'а', toIds: ['б'], ...extra });

  test('по умолчанию спрашивают стол; «да» — действие идёт, недостающее не списано', () => {
    const asked: Question[] = [];
    const played = cast({ answer: (question: Question) => { asked.push(question); return [question.offers[0]!.id]; } });
    eq(asked.length, 1);
    eq(asked[0]!.window, 'cost');
    eq(asked[0]!.sheetId, 'desk');
    ok(asked[0]!.text!.includes('нет ячейки'), asked[0]!.text);
    eq(value(played, 'а', 'ячейки'), 0);
    eq(value(played, 'б', 'хп'), 13);
    ok(told(played).includes('разрешил ведущий'), told(played));
  });

  test('«нет» — действие не состоялось, листы как были, ход закрыт', () => {
    const played = cast({ answer: (question: Question) => [question.offers[1]!.id] });
    eq(value(played, 'б', 'хп'), 20);
    ok(told(played).includes('ведущий не разрешил'), told(played));
  });

  test('«на доверии» спрашивают действующего; «строго» — отказ словами', () => {
    const asked: Question[] = [];
    cast({ table: { payment: 'trust' }, answer: (question: Question) => { asked.push(question); return [question.offers[0]!.id]; } });
    eq(asked[0]!.sheetId, 'а');
    let refused = '';
    try { cast({ table: { payment: 'strict' }, answer: () => { throw new Error('вопроса быть не должно'); } }); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('нет ячейки'), refused);
  });

  test('ведущий проводит «без платы» — без вопроса, с пометкой', () => {
    const played = cast({ table: { payment: 'strict' }, waive: true, answer: () => { throw new Error('вопроса быть не должно'); } });
    eq(value(played, 'б', 'хп'), 13);
    ok(told(played).includes('без платы'), told(played));
  });
});

group('висящий эффект кнопкой', () => {
  const holder = (values: Record<string, number> = {}) => [sheet('а', values, ['щит']), sheet('б')];
  const press = (sheets: Sheet[], extra: Record<string, unknown> = {}) => exchange({ system, compendium: book, die: queue(), sheets, actionId: '!щит', fromId: 'а', toIds: [], ...extra });

  test('у носителя есть кнопка; без события условие о событии не проверяется, плата списана, шаги идут', () => {
    ok(availableActions(holder()[0]!, { system, compendium: book }).some(action => action.id === '!щит' && action.label === 'Щит'));
    ok(!availableActions(sheet('в'), { system, compendium: book }).some(action => action.id === '!щит'));
    const played = press(holder());
    eq(value(played, 'а', 'щит'), 1);
    eq(value(played, 'а', 'ячейки'), 0);
  });

  test('известная часть условия проверяется: щит уже висит — отказ', () => {
    let refused = '';
    try { press(holder({ щит: 1 })); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('условие сейчас не выполняется'), refused);
  });

  test('нет ячейки — мягкий отказ: вопрос, после «да» щит без платы', () => {
    const asked: Question[] = [];
    const played = press(holder({ ячейки: 0 }), { answer: (question: Question) => { asked.push(question); return [question.offers[0]!.id]; } });
    eq(asked[0]!.window, 'cost');
    eq(value(played, 'а', 'щит'), 1);
    eq(value(played, 'а', 'ячейки'), 0);
  });

  test('шаги кнопки бьют невыясненного обидчика: урон «лёг бы», чужие правила «по мне попали» на него не срабатывают', () => {
    const played = exchange({ system, compendium: book, die: queue(), sheets: [sheet('а', {}, ['ответ', 'сторож']), sheet('б', {}, ['сторож'])], actionId: '!ответ', fromId: 'а', toIds: [] });
    ok(told(played).includes('на цель легло бы: Урон 4'), told(played));
    eq(value(played, 'а', 'щит'), 0);
    eq(value(played, 'б', 'щит'), 0);
  });

  test('сам на свой удар без цели Щит не предлагается: «никто» — не носитель', () => {
    const played = exchange({ system, compendium: book, die: queue(20, 5), sheets: holder(), actionId: idOf('удар'), fromId: 'а', toIds: [NOBODY], answer: () => { throw new Error('вопроса быть не должно'); } });
    eq(value(played, 'а', 'щит'), 0);
  });
});
