import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { perform } from '../src/core/perform.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { namesAt } from '../src/model/names-at.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };

const build = (steps: unknown[], rule: Record<string, unknown> = {}) => ({
  id: 'им', name: 'им',
  constants: { к100: { label: 'к100', kind: 'die', dice: [{ count: 1, sides: 100 }] } },
  rolls: {
    проверка: {
      label: 'Проверка', die: 'к100', number: 'under',
      success: { expr: '@выпало <= 5 или (@выпало <= 95 и @выпало <= @порог)' },
      margin: { expr: 'округлить вниз(@порог / 10) - округлить вниз(@выпало / 10)' },
      degrees: [{ label: 'твёрдый успех', if: { expr: '@успех и @степени >= 2' } }],
      fields: [{ table: 'лист', column: 'навык' }],
      ...rule,
    },
  },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'навык', label: 'Навык', kind: 'number', default: 40 },
      { key: 'хп', label: 'Хиты', kind: 'number', default: 10 },
      { key: 'сложность', label: 'Сложность', kind: 'number', default: 0 },
    ] },
    rolls: { label: 'Броски', key: 'word', rows: [{ value: 'проверка' }, { value: 'атака' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём' },
  },
  effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps } },
} as unknown as System);

const OPPOSED = [
  { id: 'удар', type: 'roll', field: { expr: '@действующий.навык' }, shift: { expr: '@действующий.сложность' }, tags: ['атака'] },
  EACH,
  { id: 'защита', type: 'roll', field: { expr: '@цель.навык' } },
  { id: 'попал', type: 'check', value: { expr: '@удар.margin' }, versus: { expr: '@защита.margin' }, successWhen: 'over' },
  { type: 'branch', if: { expr: 'не @попал.success' } }, { type: 'stop' }, { type: 'end' },
  { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1 + @удар.margin - @защита.margin' } },
];

const withDifficulty = (steps: unknown[]) => build(steps);

const book = { records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;
const sheet = (id: string, навык: number, сложность = 0): Sheet => ({ id, systemId: 'им', name: id, values: { навык, сложность }, has: [{ of: 'удар' }], effects: [] } as unknown as Sheet);
const queue = (...values: number[]) => () => values.shift() ?? 1;

type Traced = { success?: boolean; margin?: number; degree?: string; threshold?: number; tags?: string[]; by?: string };

const fight = (system: System, mine: number, theirs: number, dice: number[], сложность = 0) => {
  const out = exchange({
    system, compendium: book, die: queue(...dice), sheets: [sheet('боец', mine, сложность), sheet('враг', theirs)],
    actionId: 'удар:0', fromId: 'боец', toId: 'враг',
  } as never);
  const trace = (id: string) => out.reports.flatMap(entry => entry.report.trace).find(t => t.step === id) as unknown as Traced;
  return { hp: (out.sheets.find(s => s.id === 'враг')!.values as Record<string, number>).хп, trace };
};

group('бросок поля в эффекте: кость, успех и степени — из «Бросков»', () => {
  test('встречная по степеням: 47 на 23 (+2) против 35 на 41 (−1) — попал, урон 1 + 3', () => {
    const out = fight(withDifficulty(OPPOSED), 47, 35, [23, 41]);
    eq(out.trace('удар').margin, 2);
    eq(out.trace('удар').success, true);
    eq(out.trace('удар').degree, 'твёрдый успех');
    eq(out.trace('удар').by, 'боец');
    eq(out.trace('защита').margin, -1);
    eq(out.trace('защита').success, false);
    eq(out.hp, 6);
  });

  test('метки броска выводятся сами и дополняются словами шага', () => {
    const tags = fight(withDifficulty(OPPOSED), 47, 35, [23, 41]).trace('удар').tags ?? [];
    ok(tags.includes('проверка') && tags.includes('атака'), `метки: ${tags.join(', ')}`);
  });

  test('поправка к числу сдвигает порог: 47 + 20 = 67, на 70 — провал, степени −1', () => {
    const out = fight(withDifficulty(OPPOSED), 47, 35, [70, 99], 20);
    eq(out.trace('удар').threshold, 67);
    eq(out.trace('удар').margin, -1);
    eq(out.trace('удар').success, false);
  });

  test('«успех, если» правилом броска: 03 при навыке 2 — успех', () => {
    const out = fight(withDifficulty(OPPOSED), 2, 35, [3, 99]);
    eq(out.trace('удар').success, true);
  });

  test('без правил успеха и степеней — по смыслу числа: порог минус выпало', () => {
    const plain = withDifficulty(OPPOSED);
    const roll = (plain.rolls as Record<string, Record<string, unknown>>).проверка!;
    delete roll.success; delete roll.margin; delete roll.degrees;
    const out = fight(plain, 47, 35, [23, 41]);
    eq(out.trace('удар').margin, 24);
    eq(out.trace('защита').margin, -6);
  });

  test('вход эффекта «порог» не подменяет порог броска', () => {
    const system = withDifficulty(OPPOSED);
    (system.effects.удар as { params: unknown[] }).params.push({ key: 'порог', kind: 'number', default: 0 });
    eq(fight(system, 47, 35, [23, 41]).trace('удар').margin, 2);
  });

  test('система без ошибок; кость или бросающий рядом с полем — ошибки шага', () => {
    deepEq(errorsOf(lintSystem(withDifficulty(OPPOSED))).map(p => p.text), []);
    const doubled = withDifficulty([{ id: 'б', type: 'roll', field: { expr: '@действующий.навык' }, die: 'к100' }]);
    ok(errorsOf(lintSystem(doubled)).some(p => p.text.includes('кость из «Правил → Броски»')), 'кость рядом с полем');
    const thrower = withDifficulty([{ id: 'б', type: 'roll', field: { expr: '@действующий.навык' }, by: { expr: '@действующий' } }]);
    ok(errorsOf(lintSystem(thrower)).some(p => p.text.includes('бросает тот, чьё поле')), 'бросающий рядом с полем');
  });

  test('щелчок по полю — тот же бросок: журнал пишет степени', () => {
    const system = withDifficulty(OPPOSED);
    const out = perform({ system, compendium: book, clock: null, sheets: [sheet('боец', 47)], die: queue(23) } as never,
      { op: 'roll', sheetId: 'боец', tag: 'навык' } as never);
    if (out.kind !== 'done') throw new Error('бросок спросил');
    const log = out.log.join('\n');
    ok(log.includes('не больше 47: успех · степеней: 2 · твёрдый успех'), log);
  });
});

group('кость системы в формуле', () => {
  const system = build([EACH, { id: 'урон', type: 'roll', fixed: { expr: 'кинуть(@к100) + 1' } },
    { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@урон' } }]);

  test('«кинуть» читает кость по имени, проверка системы её принимает', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
    eq(fight(system, 40, 40, [7]).hp, 2);
  });
});

group('проверка системы: бросок', () => {
  const texts = (system: System) => errorsOf(lintSystem(system, book)).map(p => p.text);
  const one = (step: Record<string, unknown>, rule: Record<string, unknown> = {}) => build([step], rule);

  test('поле, которого нет в «Бросках»', () => {
    deepEq(texts(one({ id: 'б', type: 'roll', field: { expr: '@действующий.хп' } })), ['по полю «Хиты» не бросают — добавьте его в «Правила → Броски»']);
    deepEq(texts(one({ id: 'б', type: 'roll', field: { expr: '@действующий.навык' } })), []);
  });

  test('прибавка к итогу у броска с порогом и поправка у «граней»', () => {
    ok(texts(one({ id: 'б', type: 'roll', field: { expr: '@действующий.навык' }, bonus: { expr: '1' } }))[0]!.includes('прибавку к итогу не прибавить'));
    ok(texts(one({ id: 'б', type: 'roll', field: { expr: '@действующий.навык' }, shift: { expr: '1' } }, { number: 'sides', success: undefined, margin: undefined, degrees: undefined }))[0]!.includes('грани кости'));
  });

  test('кость в формуле без «кинуть» и поле со своим броском у строки', () => {
    ok(texts(one({ id: 'ч', type: 'roll', fixed: { expr: '@к100 + 1' } }))[0]!.includes('стоит в формуле как число'));
    const own = one({ id: 'б', type: 'roll', field: { expr: '@действующий.умения.бег.итог' } });
    (own.tables as Record<string, unknown>).умения = { label: 'Умения', owner: 'sheet', key: 'word',
      columns: [{ key: 'итог', label: 'Итог', kind: 'number' }], rows: [{ value: 'бег', label: 'Бег', view: { итог: { roll: { die: 'к100' } } } }] };
    deepEq(texts(own), []);
  });

  test('кость с настройками в «кинуть» и кость с формулой в одном шаге', () => {
    const minus = one({ id: 'ч', type: 'roll', fixed: { expr: 'кинуть(@к100) + 1' } });
    (minus.constants!.к100 as { dice: { minus?: boolean }[] }).dice[0]!.minus = true;
    ok(texts(minus)[0]!.includes('в формуле не бросить'));
    deepEq(texts(one({ id: 'ч', type: 'roll', die: 'к100', fixed: { expr: '1' } })), ['кость и формула в одном шаге — формулу перенесите в прибавку']);
  });
});

group('кость из частей и кость со счётом по формуле', () => {
  const halves = () => {
    const system = build([
      { id: 'бросок', type: 'roll', die: 'двойная', by: { expr: '@действующий' } },
      { id: 'число', type: 'roll', fixed: { expr: '1' } },
    ]);
    (system.constants as Record<string, unknown>).двойная = { label: 'Двойная', kind: 'die', dice: [{ sides: 12, name: 'надежда', label: 'Надежда' }, { sides: 12, name: 'страх' }] };
    return system;
  };

  test('части кости предлагаются итогами броска — своим словом', () => {
    const roll = namesAt(halves(), 'удар', { part: 'steps', index: 1 }).find(one => one.name === 'бросок')!;
    deepEq((roll.children ?? []).filter(child => child.path.startsWith('.parts.')).map(child => [child.path, child.label]),
      [['.parts.надежда', 'что выпало на кости «Надежда»'], ['.parts.страх', 'что выпало на кости «страх»']]);
  });

  test('кость считает кости по имени, которого у эффекта и на листе нет', () => {
    const pool = (count: string, step: Record<string, unknown>) => {
      const system = build([step]);
      (system.constants as Record<string, unknown>).набор = { label: 'Набор', kind: 'die', dice: [{ count: { expr: count }, sides: 6 }] };
      return errorsOf(lintSystem(system, book)).map(p => p.text);
    };
    const mine = { id: 'б', type: 'roll', die: 'набор', by: { expr: '@действующий' } };
    ok(pool('большее из(1, @рейтинг)', mine)[0]!.includes('берёт число костей из «рейтинг»'));
    deepEq(pool('большее из(1, @навык)', mine), []);
    deepEq(pool('большее из(1, @цели)', mine), []);
  });
});
