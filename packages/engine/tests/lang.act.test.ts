import { group, test, eq, ok } from './harness.ts';
import { act } from '../src/lang/act.ts';
import { emptyJournal } from '../src/lang/journal.ts';
import type { Journal } from '../src/lang/journal.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const hit = (amount: string) => ({ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: amount } });

const world = (effects: Record<string, unknown>): System => ({
  id: 'ядро', name: 'Ядро',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    уколоть: { label: 'Уколоть', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [hit('кинуть(\'1d6\')')] },
    ...effects,
  },
} as unknown as System);

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet =>
  ({ id, systemId: 'ядро', name: id, values: { хп: 20 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as Sheet);

const play = (system: System, sheets: Sheet[], from: string, to: string, dice: number[], journal: Journal = emptyJournal()) =>
  act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal }, { actionId: 'приём:0', fromId: from, toIds: [to] });

const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп;

group('новое ядро: ключи костей у повторов', () => {
  test('один и тот же вызов дважды в теле — две независимые кости', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'emit', event: 'уколоть' }, { type: 'emit', event: 'уколоть' }] },
    });
    const out = play(system, [sheet('а'), sheet('б')], 'а', 'б', [2, 5]);
    eq(out.kind, 'done');
    eq(hp(out, 'б'), 13, '20 − 2 − 5: кости разные');
  });

  test('эффект, наложенный дважды, срабатывает дважды — у каждого своя кость', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      шипы: { label: 'Шипы', activation: 'passive', reapply: 'stack', on: [{ on: 'affected', of: 'удар', to: 'other', steps: [hit('кинуть(\'1d6\')')] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', ['шипы', 'шипы'])], 'а', 'б', [3, 4]);
    eq(hp(out, 'а'), 13, '20 − 3 − 4');
  });

  test('удар по себе: шипы не колют хозяина в ответ', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      шипы: { label: 'Шипы', activation: 'passive', on: [{ on: 'affected', of: 'удар', to: 'other', steps: [hit('2')] }] },
    });
    const out = play(system, [sheet('а', ['шипы'])], 'а', 'а', []);
    eq(hp(out, 'а'), 19);
  });
});

group('новое ядро: пауза и повтор', () => {
  const system = world({
    удар: { label: 'Удар', activation: 'manual', steps: [hit('кинуть(\'1d6\')')] },
    ответ: { label: 'Ответ', activation: 'passive', on: [{ on: 'affected', of: 'удар', to: 'other', confirm: true, steps: [hit('кинуть(\'1d4\')')] }] },
  });
  const sheets = [sheet('а'), sheet('б', ['ответ'])];

  test('на вопросе действие останавливается; повтор с ответом доходит до того же места и берёт те же кости', () => {
    const first = play(system, sheets, 'а', 'б', [5]);
    eq(first.kind, 'paused');
    if (first.kind !== 'paused') return;
    eq(first.question.sheetId, 'б');
    eq(hp(first, 'б'), 15, 'удар уже виден на паузе');
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['ответ'] } };
    const second = play(system, sheets, 'а', 'б', [3], journal);
    eq(second.kind, 'done');
    eq(hp(second, 'б'), 15, 'кость удара взята из журнала, а не брошена заново');
    eq(hp(second, 'а'), 17, 'ответ бросил свою кость');
    ok(second.kind === 'done' && second.fresh.length === 1, 'свежая только кость ответа');
  });
});
