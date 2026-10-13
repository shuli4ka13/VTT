import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

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

const edit = (label: string, word: string, condition: string, extra: Record<string, unknown> = {}) => ({
  label, activation: 'passive', duration: { kind: 'permanent' },
  modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: word, if: { expr: condition }, ...extra }],
});

const shared = [
  { id: 'бросок', type: 'roll', die: 'к20', tags: ['атака'], by: { expr: '@действующий' } },
  EACH,
  { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' }, succeedOn: { expr: '20' } },
];

const single = [
  EACH,
  { id: 'бросок', type: 'roll', die: 'к20', tags: ['атака'], by: { expr: '@действующий' } },
  { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' } },
];

const volley = [
  { id: 'залп', type: 'roll', die: 'пул', tags: ['атака'], by: { expr: '@действующий' } },
  EACH,
  { id: 'попал', type: 'check', value: { expr: '@залп' }, versus: { expr: '@цель.порог' } },
];

const world = (steps: unknown[]): System => ({
  id: 'против', name: 'Против',
  constants: {
    к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] },
    пул: { label: 'Пул', kind: 'die', dice: [{ count: 6, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  },
  roll_edits: {
    advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], canceledBy: 'disadvantage' },
    disadvantage: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], canceledBy: 'advantage' },
    boon: { label: 'Подмога', ops: [{ op: 'plus', value: { expr: "кинуть('1к6')" } }], canceledBy: 'bane' },
    bane: { label: 'Сбивка', ops: [{ op: 'plus', value: { expr: "0 - кинуть('1к6')" } }], canceledBy: 'boon' },
    reroll: { label: 'Переброс', ops: [{ op: 'reroll', n: 1 }] },
    cover: { label: 'Укрытие', ops: [{ op: 'shiftVersus', by: 2 }] },
  },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'кд', label: 'КД', kind: 'number', default: 10 },
      { key: 'порог', label: 'Порог', kind: 'number', default: 1 },
    ] },
    rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'лечение' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps },
    парализован: edit('Парализован', 'advantage', '@против == @носитель'),
    уклоняется: edit('Уклоняется', 'disadvantage', '@против == @носитель'),
    отравлен: edit('Отравлен', 'disadvantage', '@бросающий == @носитель'),
    уязвим: edit('Уязвим', 'boon', '@против == @носитель'),
    укрыт: edit('Укрыт', 'cover', '@против == @носитель'),
    вдохновлён: {
      label: 'Вдохновлён', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'seen', if: { expr: '@бросающий == @носитель' }, steps: [{ type: 'roll-add', count: { expr: '1' }, keep: 'best' }] }],
    },
    меткий: {
      label: 'Меткий', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '@против.кд' }, tags: ['атака'], if: { expr: '@бросающий == @носитель' } }],
    },
    испуган: {
      label: 'Испуг', activation: 'passive', duration: { kind: 'permanent' },
      params: [{ key: 'источник', kind: 'sheet' }],
      modifiers: [{
        kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-4' }, notTags: ['лечение'],
        if: { expr: 'все(@бросающий == @носитель, @против == @источник)' },
      }],
    },
  },
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Приём', cells: {} }] } as unknown as Compendium;

const sheet = (id: string, effects: (string | { effectId: string; args: Record<string, string> })[] = [], values: Record<string, number> = {}): Sheet =>
  ({ id, systemId: 'против', name: id, values, has: [{ of: 'приём' }], effects: effects.map(one => (typeof one === 'string' ? { effectId: one } : one)) } as unknown as Sheet);

const strike = (steps: unknown[], from: Sheet, targets: Sheet[], dice: number[]) => {
  const out = exchange({
    system: world(steps), compendium: book, die: queue(...dice), sheets: [from, ...targets],
    actionId: 'приём:0', fromId: from.id, toIds: targets.map(one => one.id),
  });
  const check = (to: string) => out.reports.find(entry => entry.toId === to && entry.report.trace.some(t => t.step === 'попал'))!
    .report.trace.find(t => t.step === 'попал') as unknown as { total: number; versus: number; success: boolean; natural?: number; faced?: { against: string; edits: string[]; dropped: string[]; dice: number[]; total?: number; stale?: boolean }[] };
  return { out, check };
};

group('бросок один, против кого — решает сравнение', () => {
  test('сравнение в той же области: правка цели действует уже при броске', () => {
    const { check } = strike(single, sheet('стрелок'), [sheet('лежачий', ['парализован'])], [5, 17]);
    eq(check('лежачий').total, 17, 'преимущество: лучшая из двух');
    eq(check('лежачий').faced, undefined, 'бросок уже был против цели — пересчёта нет');
  });

  test('помеха стрелка гасит преимущество от цели — ровный бросок, вторая кость не нужна', () => {
    const { check } = strike(single, sheet('стрелок', ['отравлен']), [sheet('лежачий', ['парализован'])], [5]);
    eq(check('лежачий').total, 5);
  });

  test('общий бросок по двум целям: преимущество только против парализованной, лишняя кость одна', () => {
    const { check } = strike(shared, sheet('стрелок'), [sheet('стоит'), sheet('лежачий', ['парализован'])], [5, 17]);
    eq(check('стоит').total, 5, 'обычная цель — та же кость');
    eq(check('лежачий').total, 17, 'против парализованной — лучшая из двух');
    deepEq(check('лежачий').faced?.[0]?.edits, ['Парализован — Преимущество']);
    deepEq(check('лежачий').faced?.[0]?.dice, [17]);
  });

  test('две парализованные цели делят одну докинутую кость', () => {
    const { check } = strike(shared, sheet('стрелок'), [sheet('первый', ['парализован']), sheet('второй', ['парализован'])], [5, 17]);
    eq(check('первый').total, 17);
    eq(check('второй').total, 17);
  });

  test('порядок целей не меняет кости', () => {
    const a = strike(shared, sheet('стрелок'), [sheet('стоит'), sheet('лежачий', ['парализован'])], [5, 17]).check;
    const b = strike(shared, sheet('стрелок'), [sheet('лежачий', ['парализован']), sheet('стоит')], [5, 17]).check;
    eq(a('лежачий').total, b('лежачий').total);
    eq(a('стоит').total, b('стоит').total);
  });

  test('общий бросок с помехой стрелка: против парализованной помеха снята, кость та же', () => {
    const { check } = strike(shared, sheet('стрелок', ['отравлен']), [sheet('стоит'), sheet('лежачий', ['парализован'])], [5, 3]);
    eq(check('стоит').total, 3, 'помеха: худшая из двух');
    eq(check('лежачий').total, 5, 'ровный бросок — первая кость');
    deepEq(check('лежачий').faced?.[0]?.dice, [], 'новых костей нет');
  });

  test('крит на докинутой кости — успех только против этой цели', () => {
    const { check } = strike(shared, sheet('стрелок'), [sheet('стоит', [], { кд: 25 }), sheet('лежачий', ['парализован'], { кд: 25 })], [2, 20]);
    eq(check('лежачий').success, true, 'натуральная 20 на добавленной кости — успех и против КД 25');
    eq((check('лежачий') as unknown as { forced?: number }).forced, 20);
    eq(check('стоит').success, false, '2 против 25');
  });

  test('прибавка-кость против уязвимой: +к6 только в её сравнении и одна на всех уязвимых', () => {
    const { check } = strike(shared, sheet('стрелок'), [sheet('а', ['уязвим']), sheet('б'), sheet('в', ['уязвим'])], [8, 4]);
    eq(check('а').total, 12);
    eq(check('б').total, 8);
    eq(check('в').total, 12);
  });

  test('без правок «против» сравнение берёт тот же бросок и не трогает кости', () => {
    const { check } = strike(shared, sheet('стрелок'), [sheet('а'), sheet('б')], [8]);
    eq(check('а').total, 8);
    eq(check('б').total, 8);
    eq(check('а').faced, undefined);
  });

  test('журнал называет правку цели, докинутую кость и итог', () => {
    const { out } = strike(shared, sheet('стрелок'), [sheet('стоит'), sheet('лежачий', ['парализован'])], [5, 17]);
    ok(out.log.some(line => line.includes('против лежачий: Парализован — Преимущество; докинуто [17] → 17')), out.log.join('\n'));
  });

  test('преимущество цели гасит помеху стрелка — журнал так и говорит', () => {
    const { check } = strike(shared, sheet('стрелок', ['отравлен']), [sheet('лежачий', ['парализован'])], [5, 3]);
    deepEq(check('лежачий').faced?.[0]?.edits, ['Парализован — Преимущество гасит «Помеха»']);
    deepEq(check('лежачий').faced?.[0]?.dropped, []);
  });

  test('сдвиг порога от цели действует только в её сравнении', () => {
    const { check } = strike(shared, sheet('стрелок'), [sheet('открыт'), sheet('за стеной', ['укрыт'])], [11]);
    eq(check('открыт').versus, 10);
    eq(check('за стеной').versus, 12);
    eq(check('за стеной').success, false, '11 против 12');
  });

  test('ответ «увидев кости» выбрал кость, а цель даёт помеху — сравнение берёт выбранное, как прямой бросок', () => {
    const { check } = strike(shared, sheet('стрелок', ['вдохновлён']), [sheet('ловкий', ['уклоняется'])], [5, 17]);
    eq(check('ловкий').total, 17);
    eq(check('ловкий').faced?.[0]?.stale, true);
  });

  test('величина правки читает @против, а условие — нет: общий бросок не падает, прибавка у каждой цели своя', () => {
    const { check } = strike(shared, sheet('стрелок', ['меткий']), [sheet('а', [], { кд: 10 }), sheet('б', [], { кд: 13 })], [7]);
    eq(check('а').total, 17);
    eq(check('б').total, 20);
  });

  test('сравнение внутри «Если» не задаёт противника при броске — правка цели приходит в самом сравнении', () => {
    const steps = [
      EACH,
      { id: 'бросок', type: 'roll', die: 'к20', tags: ['атака'], by: { expr: '@действующий' } },
      { type: 'branch', if: { expr: '1 == 1' } },
      { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' } },
      { type: 'end' },
    ];
    const { check } = strike(steps, sheet('стрелок'), [sheet('лежачий', ['парализован'])], [5, 17]);
    eq(check('лежачий').total, 17);
    ok(check('лежачий').faced, 'пересчёт в сравнении');
  });

  test('испуганный стреляет по двум целям: −4 кости только против источника страха', () => {
    const shooter = sheet('стрелок', [{ effectId: 'испуган', args: { источник: 'страшный' } }]);
    const { check } = strike(volley, shooter, [sheet('страшный'), sheet('другой')], [1, 1, 6, 6, 6, 6]);
    eq(check('другой').total, 4, 'весь пул: четыре шестёрки');
    eq(check('страшный').total, 0, 'с конца ушли четыре кости — остались две единицы');
    deepEq(check('страшный').faced?.[0]?.edits, ['Испуг: −4 кости']);
  });
});

group('линт правок «против»', () => {
  const texts = (system: System) => lintSystem(system, book).map(problem => problem.text);

  test('правка «против» с перебросом — ошибка', () => {
    const system = world(single) as unknown as { effects: Record<string, unknown> };
    system.effects.кривой = edit('Кривой', 'reroll', '@против == @носитель');
    ok(texts(system as unknown as System).some(text => text.includes('может только добавлять и убирать кости') && text.includes('«reroll»')));
  });

  test('«увидев кости» с @против в условии — предупреждение', () => {
    const system = world(single) as unknown as { effects: Record<string, unknown> };
    system.effects.насмешка = { label: 'Насмешка', activation: 'passive', on: [{ on: 'seen', if: { expr: '@против == @носитель' }, steps: [{ type: 'roll-plus', value: { expr: '-1' } }] }] };
    ok(texts(system as unknown as System).some(text => text.includes('«увидев кости» с «@против»')));
  });

  test('бросающий у сложной формулы — ошибка', () => {
    const system = world([{ id: 'кости', type: 'roll', fixed: { expr: "кинуть('1к6') + 1" }, by: { expr: '@действующий' } }]);
    ok(texts(system).some(text => text.includes('у сложной формулы кости ничьи')));
  });

  test('общий бросок прочитан мимо сравнения — предупреждение с подсказкой', () => {
    const steps = [...shared, { type: 'branch', if: { expr: '@бросок.natural >= 20' } }, { type: 'end' }];
    ok(texts(world(steps)).some(text => text.includes('«бросок» здесь — общий бросок без правок цели') && text.includes('@попал.natural')));
  });

  test('общий бросок сравнивается только внутри формулы — предупреждение', () => {
    const steps = [shared[0], EACH, { id: 'попал', type: 'check', value: { expr: '@бросок + 1' }, versus: { expr: '@цель.кд' } }];
    ok(texts(world(steps)).some(text => text.includes('«бросок» сравнивается внутри формулы')));
  });

  test('общий бросок, переданный в вызов целиком, не тревожит', () => {
    const steps = [...shared, { type: 'emit', effect: 'удар', args: { бросок: { expr: '@бросок' } } }];
    ok(!texts(world(steps)).some(text => text.includes('общий бросок без правок цели')));
  });

  test('заготовка броска без кости и формулы не ругается на «сложную формулу»', () => {
    const system = world([{ id: 'кости', type: 'roll', by: { expr: '@действующий' } }]);
    ok(!texts(system).some(text => text.includes('у сложной формулы кости ничьи')));
  });

  test('чтение частей общего броска не тревожит', () => {
    const steps = [...shared, { type: 'branch', if: { expr: '@бросок.rolled >= 1' } }, { type: 'end' }];
    ok(!texts(world(steps)).some(text => text.includes('общий бросок без правок цели')));
  });
});
