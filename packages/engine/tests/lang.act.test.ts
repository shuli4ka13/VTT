import { group, test, eq, ok } from './harness.ts';
import { act } from './core-switch.ts';
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

  test('удар по себе: ответ «другой стороне» достаётся самому действующему', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [hit('1')] },
      шипы: { label: 'Шипы', activation: 'passive', on: [{ on: 'affected', of: 'удар', to: 'other', steps: [hit('2')] }] },
    });
    const out = play(system, [sheet('а', ['шипы'])], 'а', 'а', []);
    eq(hp(out, 'а'), 17, 'удар 1 и шипы 2 — оба по себе');
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

group('новое ядро: «для каждой цели»', () => {
  const twoTargets = (steps: unknown[]) => {
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps } });
    return act({ system, compendium: book, clock: null, sheets: [sheet('а'), sheet('б'), sheet('в')], die: queue(2, 5, 9), journal: emptyJournal() },
      { actionId: 'приём:0', fromId: 'а', toIds: ['б', 'в'] });
  };

  test('шаг до разделителя — один раз у действующего, после — у каждой цели свой бросок', () => {
    const out = twoTargets([
      { id: 'общая', type: 'amount', source: 'item', fixed: { expr: "кинуть('1d6')" } },
      { type: 'each' },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: "@общая + кинуть('1d10')" } },
    ]);
    eq(hp(out, 'б'), 20 - 2 - 5, 'общая кость 2, своя 5');
    eq(hp(out, 'в'), 20 - 2 - 9, 'общая кость та же 2, своя 9');
  });

  test('без разделителя бросок действующего — один на всех, как раньше', () => {
    const out = twoTargets([
      { id: 'урон', type: 'amount', source: 'item', fixed: { expr: "кинуть('1d6')" } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
    ]);
    eq(hp(out, 'б'), 18);
    eq(hp(out, 'в'), 18);
  });
});

group('новое ядро: урон бросается, только когда до него дошло', () => {
  const steps = [
    { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '@получатель.хп - 10' } },
    { id: 'урон', type: 'amount', source: 'item', fixed: { expr: "кинуть('1d6')" } },
    { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
  ];
  const system = { ...world({ удар: { label: 'Удар', activation: 'manual', steps } }), constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } } } as unknown as System;
  const go = (sheets: Sheet[], toIds: string[], dice: number[]) =>
    act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal: emptyJournal() }, { actionId: 'приём:0', fromId: 'а', toIds });

  test('промах — кость урона не брошена', () => {
    const out = go([sheet('а'), sheet('б')], ['б'], [5]);
    eq(hp(out, 'б'), 20);
    ok(out.kind === 'done' && out.fresh.length === 1, 'брошена одна кость — проверка');
  });

  test('первая цель увернулась, вторая задета — урон брошен однажды, на всех один', () => {
    const near = { ...sheet('в'), values: { хп: 12 } } as Sheet;
    const third = { ...sheet('г'), values: { хп: 12 } } as Sheet;
    const out = go([sheet('а'), sheet('б'), near, third], ['б', 'в', 'г'], [5, 4]);
    eq(hp(out, 'б'), 20, '5 против 10 — промах');
    eq(hp(out, 'в'), 8, '5 против 2 — попадание, урон 4');
    eq(hp(out, 'г'), 8, 'та же кость урона');
  });
});

group('новое ядро: броски действующего не делят кости', () => {
  test('величина и проверка, брошенные заранее, берут разные кости', () => {
    const steps = [
      { id: 'урон', type: 'amount', source: 'item', fixed: { expr: "кинуть('1d6')" } },
      { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '10' } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
    ];
    const system = { ...world({ удар: { label: 'Удар', activation: 'manual', steps } }), constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } } } as unknown as System;
    const out = play(system, [sheet('а'), sheet('б')], 'а', 'б', [2, 15]);
    eq(hp(out, 'б'), 18, 'урон 2, проверка 15 — попала');
    ok(out.kind === 'done' && out.fresh.length === 2, 'две свежие кости');
  });

  test('ложное «когда» у броска после проверки — кость не брошена', () => {
    const steps = [
      { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '10' } },
      { id: 'урон', type: 'amount', source: 'item', fixed: { expr: "кинуть('1d6')" }, when: { expr: '@бросок.natural >= 20' } },
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '1' } },
    ];
    const system = { ...world({ удар: { label: 'Удар', activation: 'manual', steps } }), constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } } } as unknown as System;
    const out = play(system, [sheet('а'), sheet('б')], 'а', 'б', [15]);
    eq(hp(out, 'б'), 19);
    ok(out.kind === 'done' && out.fresh.length === 1, 'брошена только проверка');
  });
});

group('новое ядро: разделитель в линте', () => {
  test('два «Для каждой цели» в одной цепочке — ошибка', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const system = world({ удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'each' }, hit('1'), { type: 'each' }] } });
    const found = errorsOf(lintSystem(system, book)).map(p => p.text);
    ok(found.some(text => text.includes('может быть только один')), found.join('; '));
  });
});
