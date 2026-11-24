import { group, test, eq, ok } from './harness.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { Journal } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const ASK = { id: 'решение', type: 'ask', question: 'Кто победил?', yes: 'Бьющий', no: 'Защитник' };
const hit = (amount: number) => ({ type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: String(amount) } });
const byAnswer = [{ type: 'branch', if: { expr: '@решение' } }, hit(5), { type: 'orElse' }, hit(1), { type: 'end' }];

const world = (strike: Record<string, unknown>, effects: Record<string, unknown> = {}): System => ({
  id: 'к', name: 'к',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'ки', label: 'Ки', kind: 'number', default: 3 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: {},
  effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], ...strike }, ...effects },
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string): Sheet => ({ id, systemId: 'к', name: id, values: {}, has: [{ of: 'приём' }], effects: [] } as unknown as Sheet);
const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп ?? 20;
const noDie = () => { throw new Error('кость не ждали'); };

const play = (system: System, journal: Journal = emptyJournal(), toIds = ['б'], mode?: 'trial') =>
  act({ system, compendium: book, clock: null, sheets: [sheet('а'), sheet('б'), sheet('в')], die: noDie, journal, ...(mode ? { mode } : {}) },
    { actionId: 'приём:0', fromId: 'а', toIds });

const answered = (system: System, answers: string[], toIds = ['б']) => {
  let out = play(system, emptyJournal(), toIds);
  const asked: string[] = [];
  for (const answer of answers) {
    if (out.kind !== 'paused') throw new Error('вопроса не было');
    asked.push(`${out.question.sheetId}: ${out.question.label}`);
    out = play(system, { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: [answer] } }, toIds);
  }
  return { out, asked };
};

group('шаг «Спросить»', () => {
  test('в теле по цели: без ответа — пауза с вопросом ведущему, листы не тронуты', () => {
    const out = play(world({ steps: [EACH, ASK, ...byAnswer] }));
    eq(out.kind, 'paused');
    if (out.kind !== 'paused') return;
    eq(out.question.sheetId, 'desk');
    eq(out.question.window, 'step');
    eq(out.question.label, 'Кто победил?');
    eq(out.question.offers.map(o => o.label).join('/'), 'Бьющий/Защитник');
    eq(out.question.one, true);
    eq(hp(out, 'б'), 20);
  });

  test('ответ «да» и ответ «нет» ведут по своим веткам', () => {
    const system = world({ steps: [EACH, ASK, ...byAnswer] });
    const yes = answered(system, ['yes']).out;
    eq(yes.kind, 'done');
    eq(hp(yes, 'б'), 15);
    const no = answered(system, ['no']).out;
    eq(no.kind, 'done');
    eq(hp(no, 'б'), 19);
  });

  test('две цели — два вопроса, у каждой свой ответ', () => {
    const system = world({ steps: [EACH, ASK, ...byAnswer] });
    const { out, asked } = answered(system, ['yes', 'no'], ['б', 'в']);
    eq(out.kind, 'done');
    eq(asked.length, 2);
    eq(hp(out, 'б'), 15);
    eq(hp(out, 'в'), 19);
  });

  test('до «Для каждого из»: один вопрос на действие', () => {
    const system = world({ steps: [ASK, EACH, ...byAnswer] });
    const { out, asked } = answered(system, ['yes'], ['б', 'в']);
    eq(out.kind, 'done');
    eq(asked.length, 1);
    eq(hp(out, 'б'), 15);
    eq(hp(out, 'в'), 15);
  });

  test('в вызываемом эффекте: вопрос задаётся, итог вызова несёт ответ', () => {
    const system = world(
      { steps: [EACH, { id: 'спор', type: 'emit', effect: 'ничья', args: {} }, { type: 'branch', if: { expr: '@спор.победил' } }, hit(5), { type: 'end' }] },
      { ничья: { label: 'Ничья', activation: 'manual', params: [], steps: [ASK], returns: [{ key: 'победил', label: 'победил', kind: 'bool', expr: { expr: '@решение' } }] } },
    );
    eq(play(system).kind, 'paused');
    const { out } = answered(system, ['yes']);
    eq(out.kind, 'done');
    eq(hp(out, 'б'), 15);
  });

  test('в плате: «нет» — действие не состоялось', () => {
    const system = world({
      cost: [{ ...ASK, question: 'Разрешить?', yes: 'да', no: 'нет' }, { type: 'branch', if: { expr: 'not(@решение)' } }, { type: 'stop', refusal: 'hard' }, { type: 'end' }],
      steps: [EACH, hit(5)],
    });
    eq(play(system).kind, 'paused');
    eq(hp(answered(system, ['yes']).out, 'б'), 15);
    let refused = '';
    try { answered(system, ['no']); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('не состоялось'), refused);
  });

  test('спросить игрока: вопрос адресован листу цели', () => {
    const out = play(world({ steps: [EACH, { ...ASK, to: { expr: '@цель' } }, ...byAnswer] }));
    eq(out.kind, 'paused');
    if (out.kind === 'paused') eq(out.question.sheetId, 'б');
  });

  test('проба: вопроса нет, без ответа считается «нет»', () => {
    const out = play(world({ steps: [EACH, ASK, ...byAnswer] }), emptyJournal(), ['б'], 'trial');
    eq(out.kind, 'done');
    eq(hp(out, 'б'), 19);
  });

  test('два ответа сразу и пустой ответ — отказ', () => {
    const system = world({ steps: [EACH, ASK, ...byAnswer] });
    const first = play(system);
    if (first.kind !== 'paused') throw new Error('вопроса не было');
    const withAnswer = (chosen: string[]) => () => play(system, { ...first.journal, answers: { [first.question.key]: chosen } });
    let both = '';
    try { withAnswer(['yes', 'no'])(); } catch (err) { both = (err as Error).message; }
    ok(both.includes('один ответ'), both);
    let none = '';
    try { withAnswer([])(); } catch (err) { none = (err as Error).message; }
    ok(none.includes('один ответ'), none);
  });

  test('журнал называет вопрос и ответ', () => {
    const { out } = answered(world({ steps: [EACH, ASK, ...byAnswer] }), ['yes']);
    ok(out.log.join('\n').includes('«Кто победил?»: Бьющий'), out.log.join('\n'));
  });

  test('«Проблемы»: шаг без вопроса — ошибка; с вопросом — чисто', () => {
    const texts = (steps: unknown[]) => lintSystem(world({ steps })).filter(one => one.level === 'error').map(one => one.text);
    eq(texts([EACH, ASK, ...byAnswer]).length, 0);
    ok(texts([EACH, { id: 'решение', type: 'ask' }, ...byAnswer]).length > 0);
  });

  test('«Проблемы»: вопрос из пробелов, шаг в плате подписки и в подписке «бросок окончен» — ошибки; в плате кнопки — чисто', () => {
    const errors = (system: System) => lintSystem(system).filter(one => one.level === 'error').map(one => one.text);
    const warns = (system: System) => lintSystem(system).filter(one => one.level === 'warn').map(one => one.text);
    ok(errors(world({ steps: [EACH, { ...ASK, question: '  ' }, ...byAnswer] })).some(text => text.includes('не вписан вопрос')));
    const paid = world({ cost: [ASK, { type: 'branch', if: { expr: 'not(@решение)' } }, { type: 'stop' }, { type: 'end' }], steps: [EACH, hit(5)] });
    eq(errors(paid).length, 0);
    ok(!warns(paid).some(text => text.includes('не плата')));
    const hung = (handler: Record<string, unknown>) => world({ steps: [EACH, hit(5)] }, { щит: { label: 'Щит', activation: 'passive', on: [handler] } });
    ok(errors(hung({ on: 'after:удар', if: { expr: '@цель == @holder' }, cost: [ASK], steps: [] })).some(text => text.includes('в плате подписки')));
    ok(errors(hung({ on: 'rolled', if: { expr: '@roller == @holder' }, steps: [ASK] })).some(text => text.includes('не спрашивает')));
  });

  test('«Проблемы»: у шага лишнее поле или значение не того вида — ошибка', () => {
    const errors = (steps: unknown[]) => lintSystem(world({ steps })).filter(one => one.level === 'error').map(one => one.text);
    ok(errors([EACH, { ...ASK, options: ['а', 'б'] }, ...byAnswer]).some(text => text.includes('нет поля «options»')));
    ok(errors([EACH, { ...ASK, to: 'цель' }, ...byAnswer]).some(text => text.includes('не того вида')));
    ok(errors([EACH, { ...ASK, question: 5 }, ...byAnswer]).some(text => text.includes('не того вида')));
  });
});
