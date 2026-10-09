import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from './play.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const OWN = { expr: '@бросающий == @носитель' };

const passive = (label: string, edit: string) => ({
  label, activation: 'passive', duration: { kind: 'permanent' },
  modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['проверка'], if: OWN, edit }],
});

const world = (edits: Record<string, unknown>, effects: string[]) => ({
  id: 'чужой-мир',
  tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'проверка' }] } },
  constants: { кость: { label: 'Кость черты', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  roll_edits: edits,
  effects: Object.fromEntries(effects.map(e => [e, passive(e, e)])),
});

const sheet = (effects: string[]) => ({ id: 'герой', systemId: 'чужой-мир', name: 'герой', values: {}, has: [{ of: 'проба' }], effects: effects.map(effectId => ({ effectId })) });
const victim = { id: 'цель', systemId: 'чужой-мир', name: 'цель', values: {}, has: [], effects: [] };

const rule = {
  steps: [
    { id: 'try_бросок', type: 'roll', die: 'кость', bonus: { expr: '0' }, tags: ['проверка'], by: { expr: '@действующий' } },
    { id: 'try', type: 'check', value: { expr: '@try_бросок' }, versus: { expr: '8' } },
    { type: 'branch', if: { expr: 'не(@try.success)' } }, { type: 'stop' }, { type: 'end' },
  ],
};

const bookOf = (steps: unknown[]) => ({
  records: [{ id: 'проба', table: 'действие', label: 'Проба', bindings: [{ label: 'Проба', effect: 'проба', args: {} }] }],
  steps,
});

const play = (sys: any, sh: any, steps: unknown[], die: (sides: number) => number, others: any[] = [victim], toId = 'цель') => {
  const full = {
    ...sys,
    tables: { ...sys.tables, действие: { shape: 'book', use: 'action', label: 'Действие' } },
    effects: { ...sys.effects, проба: { label: 'Проба', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, ...steps] } },
  };
  const out = exchange({
    system: full, compendium: bookOf(steps) as any, die, sheets: [sh, ...others] as any, actionId: 'проба:0', fromId: sh.id, toId,
  });
  const trace = out.reports.find(r => r.toId === toId)!.report.trace as any[];
  return { trace, out };
};

const run = (sys: any, sh: any, ...dice: number[]) => {
  const { trace } = play(sys, sh, rule.steps, queue(...dice));
  return { trace, roll: trace[0], results: { try: trace[1] } as any };
};

group('механики разных систем доезжают через эффект', () => {
  test('Savage Worlds: эффект даёт ступень кости — бросается к8 вместо к6', () => {
    const sys = world({ ступень: { label: 'Мастерство', ops: [{ op: 'dieStep', by: 1 }] } }, ['ступень']);
    const asked: number[] = [];
    const spy = (sides: number) => { asked.push(sides); return 5; };
    play(sys, sheet(['ступень']), rule.steps, spy);
    eq(asked[0], 8, 'эффект сменил величину кости, не трогая систему');
  });

  test('Blades: эффект добавляет кость в пул', () => {
    const sys = world({ помощь: { label: 'Помощь напарника', ops: [{ op: 'addDie' }] } }, ['помощь']);
    const r = run(sys, sheet(['помощь']), 2, 6);
    deepEq(r.roll.rolls, [2, 6], 'костей стало две');
    eq(r.results.try.total, 8, 'чтение мира — сумма, значит сумма обеих');
  });

  test('GURPS: эффект сдвигает порог, а не кости', () => {
    const sys = world({ фора: { label: 'Фора', ops: [{ op: 'shiftVersus', by: -3 }] } }, ['фора']);
    const без = run(world({}, []), sheet([]), 6);
    const с = run(sys, sheet(['фора']), 6);
    eq(без.results.try.success, false, '6 против 8 — не дотянул');
    eq(с.results.try.success, true, 'порог стал 5 — тот же бросок прошёл');
    deepEq(с.roll.rolls, [6], 'кости не тронуты');
  });

  test('Savage Worlds: эффект делает кость взрывной — правка РЕЗУЛЬТАТА', () => {
    const sys = world({ взрыв: { label: 'Взрывная кость', ops: [{ op: 'explode' }] } }, ['взрыв']);
    const r = run(sys, sheet(['взрыв']), 6, 6, 3);
    eq(r.results.try.total, 15, '6 + 6 + 3 — цепочка взрывов');
    eq(r.results.try.success, true);
  });

  test('две правки от РАЗНЫХ эффектов складываются в одну заявку', () => {

    const sys = world({
      ступень: { label: 'Мастерство', ops: [{ op: 'dieStep', by: 1 }] },
      помощь: { label: 'Помощь напарника', ops: [{ op: 'addDie' }] },
    }, ['ступень', 'помощь']);
    const asked: number[] = [];
    const spy = (sides: number) => { asked.push(sides); return 4; };
    const sh = sheet(['ступень', 'помощь']);
    const r = play(sys, sh, rule.steps, spy);
    deepEq(asked, [8, 8], 'две кости, обе — уже подросшие');
    deepEq(r.trace[0].edits.sort(), ['Мастерство', 'Помощь напарника'],
      'журнал называет обе правки именами автора');
  });

  test('правка на ЧУЖОЙ бросок этот бросок не трогает', () => {
    const sys = world({ помощь: { label: 'Помощь', ops: [{ op: 'addDie' }] } }, ['помощь']);
    sys.tables.rolls.rows.push({ value: 'другой' });
    sys.effects.помощь.modifiers[0].tags = ['другой'];
    const r = run(sys, sheet(['помощь']), 5);
    deepEq(r.roll.rolls, [5], 'одна кость: правка висит на другой мишени');
  });
});

group('любой бросок ловит правку, ничего для этого не объявляя', () => {
  const base = (): any => ({
    id: 'чужой-мир',
    tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спас' }] } },
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    roll_edits: {
      advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], canceledBy: 'disadvantage' },
      disadvantage: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], canceledBy: 'advantage' },
    },
    effects: {},
  });
  const withRule = (edit: string) => ({
    ...base(),
    effects: {
      всякий: {
        label: 'Проклятие невезения', activation: 'passive', duration: { kind: 'permanent' },
        modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', if: OWN, edit }],
      },
    },
  });
  const cursed = (ids: string[]) => ({ ...sheet([]), effects: ids.map(effectId => ({ effectId })) });

  const attackSteps = [
    { id: 'hit_бросок', type: 'roll', die: 'к20', bonus: { expr: '0' }, tags: ['атака'], by: { expr: '@действующий' }, against: { expr: '@цель' } },
    { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '1' } },
    { type: 'branch', if: { expr: 'не(@hit.success)' } }, { type: 'stop' }, { type: 'end' },
  ];
  const attack = (sys: any, sh: any, ...dice: number[]) => play(sys, sh, attackSteps, queue(...dice)).trace[0] as any;

  test('правка «на любой бросок» достаёт атаку, хотя та объявлена «Броском атаки»', () => {
    const sys = withRule('disadvantage');
    const t = attack(sys, cursed(['всякий']), 18, 4);
    deepEq(t.rolls, [18, 4], 'кости две — общая мишень сработала');
    eq(t.kept, 4, 'взята худшая');
    deepEq(t.edits, ['Помеха']);
  });

  test('преимущество «на любой бросок» работает так же — порода одна', () => {
    const sys = withRule('advantage');
    const t = attack(sys, cursed(['всякий']), 4, 18);
    eq(t.kept, 18, 'взята лучшая');
  });

  test('общая правка гасится своей: помеха на всё против преимущества на атаки', () => {
    const sys: any = withRule('disadvantage');
    sys.effects.фланг = {
      label: 'Во фланге', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], if: OWN, edit: 'advantage' }],
    };
    const t = attack(sys, cursed(['всякий', 'фланг']), 18);
    deepEq(t.rolls, [18], 'одна кость: гашение не смотрит, с какой мишени пришла правка');
    eq(t.edits, undefined, 'правок не осталось — трасса о них и не заикается');
  });

  test('спасбросок ЦЕЛИ ловит её собственную общую правку — бросает цель', () => {
    const sys = withRule('disadvantage');
    const target = { ...cursed(['всякий']), id: 'цель' };
    const save = [
      { id: 'спас_бросок', type: 'roll', die: 'к20', bonus: { expr: '0' }, tags: ['спас'], by: { expr: '@цель' }, against: { expr: '@действующий' } },
      { id: 'спас', type: 'check', value: { expr: '@спас_бросок' }, versus: { expr: '1' } },
      { type: 'branch', if: { expr: 'не(@спас.success)' } }, { type: 'stop' }, { type: 'end' },
    ];
    const t = play(sys, sheet([]), save, queue(19, 2), [target]).trace[0] as any;
    deepEq(t.rolls, [19, 2], 'проклятие висит на ЦЕЛИ, и бросает его она');
    eq(t.kept, 2);
  });
});

group('переворот к100 доезжает через эффект — проверка под навык', () => {
  const sys = (lucky: boolean) => ({
    id: 'варгейм',
    tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'проверка' }] } },
    constants: { сотня: { label: 'к100', kind: 'die', dice: [{ count: 1, sides: 100 }] } },
    roll_edits: { удача: { label: 'Удача', ops: [{ op: 'flip', prefer: 'low' }] } },
    effects: lucky ? { удача: passive('удача', 'удача') } : {},
  });
  const under = {
    steps: [
      { id: 'try_бросок', type: 'roll', die: 'сотня', bonus: { expr: '0' }, tags: ['проверка'], by: { expr: '@действующий' } },
      { id: 'try', type: 'check', value: { expr: '@try_бросок' }, versus: { expr: '45' }, successWhen: 'notOver' },
      { type: 'branch', if: { expr: 'не(@try.success)' } }, { type: 'stop' }, { type: 'end' },
    ],
  };
  const underRun = (s: any, sh: any, ...dice: number[]) => {
    const { trace } = play(s, sh, under.steps, queue(...dice));
    return { trace, roll: trace[0], results: { try: trace[1] } as any };
  };

  test('без правки 71 против 45 «не выше» — провал', () => {
    eq(underRun(sys(false), sheet([]), 71).results.try.success, false);
  });

  test('с «Удачей» тот же бросок читается как 17 — успех, журнал называет правку', () => {
    const r = underRun(sys(true), sheet(['удача']), 71);
    eq(r.results.try.success, true);
    eq(r.results.try.total, 17);
    deepEq(r.roll.edits, ['Удача']);
  });
});

group('исход шага помнит, была ли правка', () => {
  const flagged = (sys: any) => ({
    ...sys,
    tables: { ...sys.tables, лист: { shape: 'single', columns: [{ key: 'флаг', label: 'Флаг', kind: 'number', default: 0 }] } },
  });
  const steps = [
    ...rule.steps,
    { type: 'branch', if: { expr: '@try.edited' } },
    { type: 'apply', target: { expr: '@цель.флаг' }, direction: 'add', value: { expr: '1' } },
    { type: 'end' },
  ];
  const flag = (sys: any, sh: any, ...dice: number[]) =>
    Number(play(flagged(sys), sh, steps, queue(...dice)).out.sheets.find(s => s.id === 'цель')!.values.флаг ?? 0);

  test('без правок — «нет», с правкой — «да»: на это можно повесить условие', () => {
    eq(flag(world({}, []), sheet([]), 6), 0);
    const sys = world({ помощь: { label: 'Помощь', ops: [{ op: 'addDie' }] } }, ['помощь']);
    eq(flag(sys, sheet(['помощь']), 2, 6), 1);
  });
});
