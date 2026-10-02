import { group, test, eq, ok } from './harness.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { Journal } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const hit = (amount: string, field = '@цель.хп') => ({ type: 'apply', target: { expr: field }, direction: 'subtract', value: { expr: amount } });

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true };
const EACH = { type: 'each', of: 'цели', as: 'цель' };
const D20 = { constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } } };

const button = (steps: unknown[]) => ({ label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps });
const strike = (steps: unknown[]) => button([EACH, ...steps]);
const mine = { on: 'after:удар', if: { expr: '@цель == @носитель' } };

const world = (effects: Record<string, unknown>, extra: Record<string, unknown> = {}): System => ({
  id: 'ядро', name: 'Ядро',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    уколоть: { label: 'Уколоть', params: [{ key: 'раненый', kind: 'sheet' }], steps: [hit('кинуть(\'1d6\')', '@раненый.хп')] },
    ...effects,
  },
  ...extra,
} as unknown as System);

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet =>
  ({ id, systemId: 'ядро', name: id, values: { хп: 20 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as Sheet);

const play = (system: System, sheets: Sheet[], from: string, to: string, dice: number[], journal: Journal = emptyJournal()) =>
  act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal }, { actionId: 'приём:0', fromId: from, toIds: [to] });

const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп;

group('новое ядро: ключи костей у повторов', () => {
  test('один и тот же вызов дважды в теле — две независимые кости', () => {
    const call = { type: 'emit', effect: 'уколоть', args: { раненый: { expr: '@цель' } } };
    const system = world({ удар: strike([call, call]) });
    const out = play(system, [sheet('а'), sheet('б')], 'а', 'б', [2, 5]);
    eq(out.kind, 'done');
    eq(hp(out, 'б'), 13, '20 − 2 − 5: кости разные');
  });

  test('эффект, наложенный дважды, срабатывает дважды — у каждого своя кость', () => {
    const system = world({
      удар: strike([hit('1')]),
      шипы: { label: 'Шипы', activation: 'passive', reapply: 'stack', on: [{ ...mine, steps: [hit('кинуть(\'1d6\')', '@действующий.хп')] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', ['шипы', 'шипы'])], 'а', 'б', [3, 4]);
    eq(hp(out, 'а'), 13, '20 − 3 − 4');
  });

  test('удар по себе: действующий и цель — один лист, подписка носителя бьёт его второй раз', () => {
    const system = world({
      удар: strike([hit('1')]),
      шипы: { label: 'Шипы', activation: 'passive', on: [{ ...mine, steps: [hit('2', '@действующий.хп')] }] },
    });
    const out = play(system, [sheet('а', ['шипы'])], 'а', 'а', []);
    eq(hp(out, 'а'), 17, 'удар 1 и шипы 2 — оба по себе');
  });
});

group('новое ядро: пауза и повтор', () => {
  const system = world({
    удар: strike([hit('кинуть(\'1d6\')')]),
    ответ: { label: 'Ответ', activation: 'passive', on: [{ ...mine, confirm: true, steps: [hit('кинуть(\'1d4\')', '@действующий.хп')] }] },
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
  const twoTargets = (steps: unknown[], toIds = ['б', 'в']) => {
    const system = world({ удар: button(steps) });
    return act({ system, compendium: book, clock: null, sheets: [sheet('а'), sheet('б'), sheet('в')], die: queue(2, 5, 9), journal: emptyJournal() },
      { actionId: 'приём:0', fromId: 'а', toIds });
  };

  test('шаг до разделителя — один раз у действующего, после — у каждой цели свой бросок', () => {
    const out = twoTargets([
      { id: 'общая', type: 'roll', fixed: { expr: "кинуть('1d6')" } },
      EACH,
      hit("@общая + кинуть('1d10')"),
    ]);
    eq(hp(out, 'б'), 20 - 2 - 5, 'общая кость 2, своя 5');
    eq(hp(out, 'в'), 20 - 2 - 9, 'общая кость та же 2, своя 9');
  });

  test('общий расчёт до разделителя ленивый: при нуле целей кость не брошена', () => {
    const out = twoTargets([
      { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d6')" } },
      EACH,
      hit('@урон'),
    ], []);
    eq(out.kind, 'done');
    ok(out.kind === 'done' && out.fresh.length === 0, 'ни одной свежей кости');
  });
});

group('новое ядро: урон бросается, только когда до него дошло', () => {
  const steps = [
    { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d6')" } },
    EACH,
    { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
    { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.хп - 10' } },
    hit('@урон'),
  ];
  const system = world({ удар: button(steps) }, D20);
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
    const out = go([sheet('а'), sheet('б'), near, third], ['б', 'в', 'г'], [5, 5, 4, 5]);
    eq(hp(out, 'б'), 20, '5 против 10 — промах');
    eq(hp(out, 'в'), 8, '5 против 2 — попадание, урон 4');
    eq(hp(out, 'г'), 8, 'та же кость урона');
  });
});

group('новое ядро: броски действующего не делят кости', () => {
  test('величина и проверка, брошенные заранее, берут разные кости', () => {
    const steps = [
      { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d6')" } },
      { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
      { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } },
      EACH,
      hit('@урон'),
    ];
    const system = world({ удар: button(steps) }, D20);
    const out = play(system, [sheet('а'), sheet('б')], 'а', 'б', [15, 2]);
    eq(hp(out, 'б'), 18, 'проверка 15 — попала, урон 2');
    ok(out.kind === 'done' && out.fresh.length === 2, 'две свежие кости');
  });

  test('ложное «когда» у броска после проверки — кость не брошена', () => {
    const steps = [
      { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
      { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } },
      { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d6')" }, if: { expr: '@бросок.natural >= 20' } },
      EACH,
      hit('1'),
    ];
    const system = world({ удар: button(steps) }, D20);
    const out = play(system, [sheet('а'), sheet('б')], 'а', 'б', [15]);
    eq(hp(out, 'б'), 19);
    ok(out.kind === 'done' && out.fresh.length === 1, 'брошена только проверка');
  });
});

group('новое ядро: разделитель в линте', () => {
  test('два «Для каждой цели» в одной цепочке — ошибка', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const system = world({ удар: button([EACH, hit('1'), EACH]) });
    const found = errorsOf(lintSystem(system, book)).map(p => p.text);
    ok(found.some(text => text.includes('может быть только один')), found.join('; '));
  });
});
