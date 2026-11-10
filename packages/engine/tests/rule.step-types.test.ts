import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
import * as rollStep from '../src/engine/steps/roll.ts';
import * as checkStep from '../src/engine/steps/check.ts';
import * as applyStep from '../src/engine/steps/apply.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const HERE = (field: string) => ({ expr: `@цель.${field}` });

const SYS = {
  ...system,
  constants: { lead_die: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
};

const run = (steps, opts: any = {}) => {
  const {
    sys = SYS, sender = arven, die = queue(),
    targetSheet = mirra,
    params = {}, paramDefs = [], props = null,
    book = compendium,
  } = opts;
  const propKeys = props ? Object.keys(props) : [];
  const world: any = {
    ...sys,
    tables: {
      ...sys.tables,
      приём: { shape: 'book', use: 'action', label: 'Приём' },
      предмет: {
        shape: 'book', use: 'item', label: 'Предмет',
        columns: propKeys.map(key => ({ key, label: key, kind: paramDefs.find((d: any) => d.key === key)?.kind ?? 'number' })),
        bindings: [{ label: 'правило', effect: 'правило', args: params }],
      },
    },
    effects: { ...sys.effects, правило: { label: 'правило', activation: 'manual', params: [ACTOR, TARGETS, ...paramDefs], steps: [EACH, ...steps] } },
  };
  const records = [...book.records, { id: 'вещь', table: 'предмет', label: 'вещь', cells: props ?? {} }];
  const from = { ...sender, has: [...(sender.has ?? []), { of: 'вещь' }] };
  const out = exchange({ system: world, compendium: { ...book, records }, die, sheets: [from, targetSheet], actionId: 'вещь:0', fromId: from.id, toId: targetSheet.id });
  const report: any = out.reports[0].report;
  const results: Record<string, any> = {};
  for (const t of report.trace as any[]) {
    if (t.skipped || t.step === undefined) continue;
    results[t.step] = t.type === 'roll' ? { ...t, dice: { rolls: t.rolls, kept: t.kept } } : t;
  }
  return {
    sheet: out.sheets.find(x => x.id === targetSheet.id), trace: report.trace as any[], stopped: report.stopped as any,
    changes: report.changes, effects: report.effects, removed: report.removed, results,
  };
};

const viaInput = (key, kind = 'number') => ({ paramDefs: [{ key, kind }], params: { [key]: { expr: `@${key}` } } });

const attack = (rollOver = {}, checkOver = {}) => [
  {
    id: 'hit_бросок', type: 'roll', die: 'lead_die', bonus: { expr: '@действующий.attack_bonus' }, tags: ['атака'],
    by: { expr: '@действующий' },
    ...rollOver,
  },
  { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '@цель.ac' }, ...checkOver },
  { type: 'branch', if: { expr: 'не @hit.success' } }, { type: 'stop' }, { type: 'end' },
];

group('шаги «бросок» и «проверка»', () => {
  test('действующий бросает ведущую кость, против — считает цель', () => {
    const out = run(attack(), { die: queue(10) });
    const rolled = out.results.hit_бросок;
    const checked = out.results.hit;
    eq(checked.success, true);
    eq(checked.margin, 2);
    eq(checked.total, 16, 'бросок 10 + бонус 6 против КД Мирры 14');
    deepEq(rolled.dice, { rolls: [10], kept: 10 });
    eq(out.stopped, null);
    eq(checked.versus, 14);
  });

  test('провал — стоп в блоке «Если» обрывает цепочку, в журнале видно и проверку, и стоп', () => {
    const out = run([...attack(), { id: 'после', type: 'roll', fixed: { expr: "кинуть('1d8')" } }],
      { die: queue(2, 5) });
    eq(out.stopped.reason, 'stop');
    eq(out.stopped.step, 4, 'оборвал шаг «Стоп» — пятый в цепочке после «Для каждой цели»');
    eq(out.trace.length, 3, 'до шага «после» дело не дошло');
    eq(out.trace[1].success, false);
    eq(out.trace[1].margin, -6);
    eq(out.trace[2].type, 'stop');
  });

  test('модификаторы броска действующего отыгрываются на его броске', () => {
    const poisoned = { ...arven, effects: [{ effectId: 'poisoned' }] };
    const out = run(attack(), { sender: poisoned, die: queue(17, 4) });
    deepEq(out.results.hit_бросок.dice, { rolls: [17, 4], kept: 4 }, 'взята худшая кость');
  });

  test('бросок цели: бросает цель, своими модификаторами, а проверка читает его', () => {
    const save = [
      {
        id: 'save_бросок', type: 'roll', die: 'lead_die', bonus: HERE('dex_save'), tags: ['спасбросок'],
        by: { expr: '@цель' },
      },
      { id: 'save', type: 'check', value: { expr: '@save_бросок' }, versus: { expr: '@действующий.spell_dc' } },
      { type: 'branch', if: { expr: '@save.success' } }, { type: 'stop' }, { type: 'end' },
    ];

    const failed = run(save, { sender: mirra, targetSheet: arven, die: queue(5) });
    eq(failed.stopped, null, 'цель провалилась — цепочка продолжается');
    deepEq(failed.results.save_бросок.dice, { rolls: [5], kept: 5 });
    eq(failed.results.save.margin, -7, 'спасбросок 6 против сложности 13');

    const held = run(save, { sender: mirra, targetSheet: arven, die: queue(19) });
    eq(held.stopped.reason, 'stop', 'цель спаслась — стоп в блоке «Если»');
    eq(held.results.save.success, true, 'и в журнале видно, что спас удался');
  });

  test('составная ведущая кость: total сравнивается, части доступны дальше', () => {
    const duality = {
      ...SYS,
      constants: {
        lead_die: {
          label: 'Кости дуальности', kind: 'die',
          dice: [{ sides: 12, name: 'hope' }, { sides: 12, name: 'fear' }],
        },
      },
    };
    const out = run([
      ...attack({}, { versus: { expr: '10' } }),
      { id: 'pen', type: 'check', value: { expr: '@hit_бросок.parts.hope' }, versus: { expr: '5' } },
    ], { sys: duality, die: queue(7, 4) });
    eq(out.results.hit.total, 17, 'сумма 11 плюс бонус 6 — total есть всегда');
    eq(out.results.hit.success, true);
    eq(out.results.pen.margin, 2, 'а на Надежду смотрит только шаг, которому она нужна');
  });

  test('сравнивать бросок с текстовым полем нельзя — внятная ошибка', () => {
    throws(() => run(attack({}, { versus: { expr: '@цель.race' } }), { die: queue(10) }), 'race');
  });

  test('бросок без кости и без формулы — ошибка при выполнении, а не тихий ноль', () => {
    throws(() => run([{ id: 'hit_бросок', type: 'roll', bonus: { expr: '0' } }]), 'кост');
  });

  test('«всегда успех» на кости требует проверять бросок, а не число', () => {
    throws(() => run([{ id: 'n', type: 'roll', fixed: { expr: '3' } }, { id: 'c', type: 'check', value: { expr: '3' }, versus: { expr: '1' }, succeedOn: { expr: '20' } }]), 'бросок');
  });
});

group('шаг «бросок» без «бросает»: расчёт', () => {
  test('своя кость: кость из записи оружия плюс слагаемое-выражение', () => {
    const out = run([{ id: 'dmg', type: 'roll', fixed: { expr: 'кинуть(@damage_dice) + @действующий.str_mod' } }],
      { die: queue(5), props: { damage_dice: '1d8' }, ...viaInput('damage_dice', 'dice') });
    eq(out.results.dmg.total, 8, 'кость 5 плюс Сила 3');
    eq(out.trace[0].total, 8);
    deepEq(out.trace[0].rolls, [5]);
  });

  test('превышение: база плюс превышение проверки по имени', () => {
    const out = run([
      ...attack(),
      { id: 'dmg', type: 'roll', fixed: { expr: '3 + @hit.margin' } },
    ], { die: queue(10) });
    eq(out.results.dmg.total, 5, 'нож 3 плюс превышение 2');
    eq(out.trace[3].fixed, 5, 'сумма видна в трассе — после проверки и пропущенного стопа');
  });

  test('фикс предмета: костей не бросали вовсе', () => {
    const out = run([{ id: 'dmg', type: 'roll', fixed: { expr: '@damage_flat' } }],
      { die: queue(), props: { damage_flat: 3 }, ...viaInput('damage_flat') });
    eq(out.results.dmg.total, 3);
    deepEq(out.trace[0].rolls, [], 'очередь костей пуста — и не понадобилась');
  });

  test('расчёт без кости и без формулы — ошибка словами', () => {
    throws(() => run([{ id: 'd', type: 'roll' }]), 'кост');
  });

  test('на расчёт правки броска не действуют: кость урона не знает про помеху', () => {
    const poisoned = { ...arven, effects: [{ effectId: 'poisoned' }] };
    const out = run([{ id: 'dmg', type: 'roll', fixed: { expr: "кинуть('1d8')" } }], { sender: poisoned, die: queue(5) });
    deepEq(out.trace[0].rolls, [5]);
  });
});

group('шаг «проверка»', () => {
  const dmg = { id: 'dmg', type: 'roll', fixed: { expr: '@damage_flat' } };
  const pen = (over = {}) => ({ id: 'pen', type: 'check', value: { expr: '@dmg' }, versus: { expr: '5' }, ...over });
  const stopUnlessPen = [{ type: 'branch', if: { expr: 'не @pen.success' } }, { type: 'stop' }, { type: 'end' }];

  test('выше порога: разница доступна дальше по имени', () => {
    const out = run([dmg, pen(), ...stopUnlessPen], { props: { damage_flat: 8 }, ...viaInput('damage_flat') });
    eq(out.stopped, null);
    eq(out.results.pen.margin, 3);
  });

  test('ниже порога: стоп в блоке «Если» обрывает, у проверки есть трасса', () => {
    const out = run([dmg, pen(), ...stopUnlessPen], { props: { damage_flat: 3 }, ...viaInput('damage_flat') });
    eq(out.stopped.reason, 'stop');
    eq(out.trace[1].success, false);
    eq(out.trace[1].margin, -2);
  });

  test('равенство при «не меньше» проходит', () => {
    const out = run([dmg, pen(), ...stopUnlessPen], { props: { damage_flat: 5 }, ...viaInput('damage_flat') });
    eq(out.stopped, null);
    eq(out.results.pen.margin, 0);
  });

  test('равенство при «строго больше» — провал, стоп в блоке «Если» обрывает', () => {
    const out = run([dmg, pen({ successWhen: 'over' }), ...stopUnlessPen], { props: { damage_flat: 5 }, ...viaInput('damage_flat') });
    eq(out.results.pen.success, false);
    eq(out.stopped.reason, 'stop');
  });

  test('проверка сама не обрывает: без «Стоп» цепочка идёт дальше и после провала', () => {
    const out = run([dmg, pen(), { id: 'после', type: 'roll', fixed: { expr: '1' } }], { props: { damage_flat: 3 }, ...viaInput('damage_flat') });
    eq(out.stopped, null);
    eq(out.results.pen.success, false);
    eq(out.results.после.total, 1);
  });
});

group('шаг «применить»', () => {

  test('вычесть: хиты падают, журнал изменений полон', () => {
    const out = run([{ type: 'apply', target: HERE('hp_current'), direction: 'subtract', value: { expr: '8' } }]);
    deepEq(out.changes, [{ tag: 'hp_current', from: 21, to: 13, sheetId: mirra.id }]);
    eq(out.sheet.values.hp_current, 13);
    eq(mirra.values.hp_current, 21, 'исходный лист не тронут');
  });

  test('нижняя граница поля держит: хиты не уходят ниже нуля', () => {
    const weak = { ...mirra, values: { ...mirra.values, hp_current: 3 } };
    const out = run([{ type: 'apply', target: HERE('hp_current'), direction: 'subtract', value: { expr: '8' } }],
      { targetSheet: weak });
    eq(out.sheet.values.hp_current, 0, 'min поля, эффект о нуле не знает');
  });

  test('верхняя граница-формула: лечение не выше максимума хитов', () => {
    const wounded = { ...mirra, values: { ...mirra.values, hp_current: 15 } };
    const out = run([{ type: 'apply', target: HERE('hp_current'), direction: 'add', value: { expr: '10' } }],
      { targetSheet: wounded });
    eq(out.sheet.values.hp_current, 21, '15 + 10, но max поля — «#hp_max» листа цели');
  });

  test('присвоить: направление «set» пишет величину как есть', () => {
    const out = run([{ type: 'apply', target: HERE('hp_current'), direction: 'set', value: { expr: '5' } }]);
    eq(out.sheet.values.hp_current, 5);
  });

  test('в вычисляемое поле писать нельзя — его считает движок, а не эффект', () => {
    throws(() => run([{ type: 'apply', target: HERE('ac'), direction: 'subtract', value: { expr: '1' } }]), 'ac');
  });

  test('неизвестное направление — ошибка с перечнем', () => {
    throws(() => run([{ type: 'apply', target: HERE('hp_current'), direction: 'котик', value: { expr: '1' } }]), 'котик');
  });
});

group('шаг «состояние»', () => {

  const withStacking = stacking => ({
    ...SYS,
    effects: { ...SYS.effects, poisoned: { ...SYS.effects.poisoned, reapply: stacking } },
  });
  const poison = { type: 'status', effect: 'poisoned', to: { expr: '@цель' } };
  const twice = sys => run([poison, poison], { sys });

  test('вешает эффект на цель', () => {
    const out = run([poison]);
    deepEq(out.sheet.effects, [...mirra.effects, { effectId: 'poisoned' }]);
    deepEq(out.effects, ['poisoned']);
  });

  test('«не накладывается повторно» — одна запись, второй раз молчание', () => {
    const out = twice(withStacking('ignore'));
    deepEq(out.sheet.effects, [...mirra.effects, { effectId: 'poisoned' }]);
  });

  test('«обновляется» — тоже одна запись: наложили заново, а не рядом', () => {
    const out = twice(withStacking('refresh'));
    deepEq(out.sheet.effects, [...mirra.effects, { effectId: 'poisoned' }]);
    deepEq(out.effects, ['poisoned'], 'журналу нужен факт, а не счёт наложений');
  });

  test('«копится» — каждое наложение отдельной записью', () => {
    const out = twice(withStacking('stack'));
    eq(out.sheet.effects.length, mirra.effects.length + 2);
  });

  test('режим «снять» убирает висящий эффект', () => {
    const out = run([{ type: 'status', mode: 'remove', effect: 'poisoned', to: { expr: '@цель' } }],
      { targetSheet: { ...mirra, effects: [{ effectId: 'poisoned' }] } });
    deepEq(out.sheet.effects, []);
    deepEq(out.removed, ['poisoned']);
  });

  test('пустой слот — законная пустота: шаг молчит, а не падает', () => {
    const out = run([{ type: 'status', effect: null, to: { expr: '@цель' } }]);
    deepEq(out.sheet.effects, mirra.effects, 'ничего не наложено');
    eq(out.trace[0].effect, null, 'и в журнале это видно');
  });

  test('эффект, которого система не объявляет, — внятная ошибка', () => {
    throws(() => run([{ type: 'status', effect: 'нетакого', to: { expr: '@цель' } }]), 'нетакого');
  });
});

group('линт шага — для приговора в конструкторе', () => {

  test('бросок: без кости и формулы — беда видна без выполнения', () => {
    const { lint } = rollStep;
    ok(lint({ type: 'roll' }).includes('шаг пуст'));
    eq(lint({ type: 'roll', die: 'lead_die' }), null);
    eq(lint({ type: 'roll', fixed: { expr: '3' } }), null);
  });

  test('проверка: без значения или порога', () => {
    const { lint } = checkStep;
    ok(lint({ type: 'check', versus: { expr: '1' } }).includes('проверять'));
    ok(lint({ type: 'check', value: { expr: '1' } }).includes('порог'));
    eq(lint({ type: 'check', value: { expr: '1' }, versus: { expr: '1' } }), null);
  });

  test('применить: без поля или величины', () => {
    const { lint } = applyStep;
    ok(lint({ type: 'apply', value: { expr: '1' } }).includes('поле'));
    ok(lint({ type: 'apply', target: { expr: '@цель.hp' } }).includes('величин'));
    eq(lint({ type: 'apply', target: { expr: '@цель.hp' }, value: { expr: '1' } }), null);
  });
});

group('шаг «бросок» и кость из словаря системы', () => {
  const withDice = (dice: unknown) => ({ id: 'n', type: 'roll', die: dice });

  test('ссылка на кость системы разворачивается в бросок', () => {
    const out = run([withDice('lead_die')] as never, { die: queue(7) });
    eq(out.results.n.total, 7);
  });

  test('кости, которой нет, отказ называет по имени', () => {
    throws(() => run([withDice('нет_такой')] as never), 'нет_такой');
  });

  test('составная кость в броске складывается: сумма всех граней', () => {
    const sys = {
      ...SYS,
      constants: { ...SYS.constants, пул: { label: 'Пул', kind: 'die', dice: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }] } },
    };
    const out = run([withDice('пул')] as never, { sys, die: queue(3, 4, 5) });
    eq(out.results.n.total, 12);
  });
});
