import { group, test, eq, ok, deepEq } from './harness.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal, QUIET } from '../src/core/external.ts';
import { perform } from '../src/core/perform.ts';
import { fight } from './play.ts';
import type { Clock } from '../src/engine/clock.ts';
import type { Journal, Question, TableRules } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const shield = (confirm: Record<string, unknown>, bonus = 5) => ({
  label: 'Щит', activation: 'passive', duration: { kind: 'permanent' },
  on: [{ on: 'before:удар', if: { expr: '@цель == @holder' }, confirm, steps: [{ type: 'apply', target: { expr: '@holder.кд' }, direction: 'add', value: { expr: String(bonus) } }] }],
});

const system = (effects: Record<string, unknown>): System => ({
  id: 'в', name: 'в',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'кд', label: 'Класс брони', kind: 'number', default: 12 }] },
    броски: { label: 'Броски', key: 'word', columns: [{ key: 'uspeh', label: 'Успех', kind: 'text' }, { key: 'proval', label: 'Провал', kind: 'text' }], rows: [{ value: 'атака', label: 'атака', cells: { uspeh: 'попадание', proval: 'промах' } }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' }, tags: ['атака'] },
        { id: 'проверка', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' } },
        { type: 'branch', if: { expr: '@проверка.success' } },
        { type: 'apply', target: { expr: '@цель.хп' }, value: { expr: '5' } },
        { type: 'end' },
      ],
    },
    ...effects,
  },
}) as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet => ({ id, systemId: 'в', name: id === 'а' ? 'Орк' : 'Мирра', values: { хп: 20, кд: 12 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;

interface Played { questions: Question[]; sheets: Sheet[]; pausedLog: string[] }

function play(effects: Record<string, unknown>, die: number, answer: (question: Question) => string[], table?: TableRules): Played {
  let journal: Journal = emptyJournal();
  const questions: Question[] = [];
  const pausedLog: string[] = [];
  for (let round = 0; round < 8; round++) {
    const out = act({ system: system(effects), compendium: book, clock: null, sheets: [sheet('а'), sheet('б', ['щит'])], die: () => die, journal, ...(table ? { table } : {}) }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    if (out.kind === 'done') return { questions, sheets: out.sheets, pausedLog };
    questions.push(out.question);
    pausedLog.push(...out.log);
    journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: answer(out.question) } };
  }
  throw new Error('вопросы без конца');
}

const yes = (question: Question): string[] => question.offers.map(offer => offer.id);
const hp = (played: Played): unknown => played.sheets.find(one => one.id === 'б')!.values.хп;

group('вопрос реакции — данные', () => {
  test('по умолчанию вопрос не несёт ни броска, ни порога — ни в предпросмотре, ни в журнале до ответа', () => {
    const played = play({ щит: shield({}) }, 14, yes);
    eq(played.questions.length, 1);
    deepEq(played.questions[0]!.preview, []);
    eq(played.questions[0]!.text, undefined);
    ok(!played.pausedLog.join(' · ').includes('14'), played.pausedLog.join(' · '));
    eq(hp(played), 20);
  });

  test('слова вопроса берутся из подписки, когда вариант один', () => {
    eq(play({ щит: shield({ question: 'По тебе попали. Щит?' }) }, 14, yes).questions[0]!.text, 'По тебе попали. Щит?');
  });

  test('«что показать»: кто действует и чем — одной строкой, бросок и порог — строками разбора', () => {
    deepEq(play({ щит: shield({ show: ['actor', 'action'] }) }, 14, yes).questions[0]!.preview, ['Орк — Удар']);
    const full = play({ щит: shield({ show: ['roll', 'versus'] }) }, 14, yes).questions[0]!.preview;
    eq(full.length, 2);
    ok(full[0]!.includes('[14]') && full[1]!.includes('12'), full.join(' | '));
    eq(play({ щит: shield({ show: ['roll'] }) }, 14, yes).questions[0]!.preview.length, 1);
  });

  test('настройка стола «показывать бросок» добавляет бросок вопросу, который сам его не показывает', () => {
    const preview = play({ щит: shield({}) }, 14, yes, { reactionRolls: true }).questions[0]!.preview;
    eq(preview.length, 1);
    ok(preview[0]!.includes('[14]'), preview[0]);
  });

  test('кому вопрос: ведущему, действующему или цели — отвечает названный', () => {
    eq(play({ щит: shield({}) }, 14, yes).questions[0]!.sheetId, 'б');
    eq(play({ щит: shield({ to: 'actor' }) }, 14, yes).questions[0]!.sheetId, 'а');
    eq(play({ щит: shield({ to: 'gm' }) }, 14, yes).questions[0]!.sheetId, 'desk');
    eq(hp(play({ щит: shield({ to: 'gm' }) }, 14, yes)), 20);
  });

  test('настройка стола «только когда меняет исход»: бесполезная реакция не предлагается, полезная — предлагается', () => {
    const useful: TableRules = { reactionUseful: true };
    eq(play({ щит: shield({}) }, 14, yes, useful).questions.length, 1);
    eq(play({ щит: shield({}) }, 19, yes, useful).questions.length, 0);
    eq(play({ щит: shield({}) }, 5, yes, useful).questions.length, 0);
    eq(play({ щит: shield({}) }, 19, yes).questions.length, 1);
    eq(hp(play({ щит: shield({}) }, 19, yes, useful)), 15);
  });

  test('обе вместе: полезная реакция с вопросом ведущему — один вопрос, реакция сработала', () => {
    const played = play({ щит: shield({ to: 'gm', show: ['roll'] }) }, 14, yes, { reactionUseful: true });
    eq(played.questions.length, 1);
    eq(played.questions[0]!.sheetId, 'desk');
    eq(hp(played), 20);
  });
});

group('ответ «не спрашивать до конца хода»', () => {
  const battle = fight('а', 'б');
  const once = (sheets: Sheet[], clock: Clock | null, answer: string[] | null) => {
    let journal: Journal = emptyJournal();
    const questions: Question[] = [];
    for (let round = 0; round < 8; round++) {
      const out = act({ system: system({ щит: shield({}) }), compendium: book, clock, sheets, die: () => 14, journal }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
      if (out.kind === 'done') return { questions, sheets: out.sheets, log: out.log };
      questions.push(out.question);
      journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: answer ?? [] } };
    }
    throw new Error('вопросы без конца');
  };
  const start = () => [sheet('а'), sheet('б', ['щит'])];

  test('вне боя ответ не предлагается, в бою — предлагается', () => {
    ok(!once(start(), null, null).questions[0]!.mute);
    eq(once(start(), battle, null).questions[0]!.mute, true);
  });

  test('ответ запоминается на листе: реакция не сработала, второй раз за ход не спрашивают, в журнале сказано почему', () => {
    const first = once(start(), battle, [QUIET]);
    eq(first.questions.length, 1);
    deepEq(first.sheets.find(one => one.id === 'б')!.quiet, ['щит']);
    eq(first.sheets.find(one => one.id === 'б')!.values.хп, 15);
    ok(first.log.join(' · ').includes('до конца хода не спрашивать — Щит'), first.log.join(' · '));
    eq(once(first.sheets, battle, null).questions.length, 0);
  });

  test('конец хода снимает запомненное — снова спрашивают', () => {
    const first = once(start(), battle, [QUIET]);
    const turned = perform({ system: system({ щит: shield({}) }), compendium: book, clock: battle, sheets: first.sheets, die: () => 1 }, { op: 'turn', turn: 'next' });
    if (turned.kind !== 'done') throw new Error('ход не сменился');
    eq(turned.sheets.find(one => one.id === 'б')!.quiet, undefined);
    eq(once(turned.sheets, turned.clock, null).questions.length, 1);
  });
});

