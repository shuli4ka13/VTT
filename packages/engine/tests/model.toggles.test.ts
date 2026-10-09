import { group, test, eq, ok, deepEq } from './harness.ts';
import { critOf, setCrit, armorOf, setArmor, armorTail, CRIT_RULE, CRIT_EDIT } from '../src/model/toggles.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { endOf } from '../src/model/flow.ts';
import { compile } from '../src/formula/index.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const dnd = () => clone(SAMPLE_WORLDS[0]!.system as System);
const red = () => clone(SAMPLE_WORLDS[1]!.system as System);

group('тогл крита пишет данные, а не код', () => {
  test('образец D&D читается как «кости урона вдвое», у RED крит правкой словаря без правила комнаты', () => {
    eq(critOf(dnd()), 'double');
    eq(critOf(red()), 'off');
  });

  test('«взрывная кость» заводит правку словаря и правило комнаты на любой бросок, «нет» всё убирает', () => {
    const system = dnd();
    setCrit(system, 'explode');
    eq(critOf(system), 'explode');
    ok(Boolean(system.roll_edits?.[CRIT_EDIT]));
    ok((system.grants ?? []).includes(CRIT_RULE));
    ok(!Object.values(system.effects).some(e => (e.steps ?? []).some(s => (s as Record<string, unknown>).double)), 'удвоение снято');
    eq(errorsOf(lintSystem(system)).length, 0);

    setCrit(system, 'off');
    eq(critOf(system), 'off');
    ok(!system.effects[CRIT_RULE]);
    ok(!system.roll_edits?.[CRIT_EDIT]);
    eq(errorsOf(lintSystem(system)).length, 0);
  });

  test('«кости вдвое» вешает удвоение на каждое число после проверки действующего', () => {
    const system = dnd();
    setCrit(system, 'off');
    setCrit(system, 'double');
    const lineOf = (effect: string): string => {
      const step = system.effects[effect]!.steps!.find(s => s.type === 'roll' && !(s as { by?: unknown }).by) as Record<string, unknown>;
      return String((step.fixed as { expr?: unknown } | undefined)?.expr ?? '');
    };
    eq(lineOf('strike'), 'кинуть(@damage_dice, @dice * если(@hit_бросок.atMax >= 1, 2, 1)) + @damage_with');
    ok(!lineOf('spell_save_half').includes('atMax'),
      'урон Огненного шара бросается до спасбросков — удвоения нет, это не атака');
    eq(errorsOf(lintSystem(system)).length, 0);
  });

  test('удвоение снимается из той же строки, не оставляя мусора', () => {
    const system = dnd();
    const lineOf = (effect: string): string => {
      const step = system.effects[effect]!.steps!.find(s => s.type === 'roll' && !(s as { by?: unknown }).by) as Record<string, unknown>;
      return String((step.fixed as { expr?: unknown } | undefined)?.expr ?? '');
    };
    setCrit(system, 'off');
    const голые = ['strike'].map(lineOf);
    deepEq(голые, ['кинуть(@damage_dice, @dice) + @damage_with']);
    setCrit(system, 'double');
    setCrit(system, 'off');
    deepEq(['strike'].map(lineOf), голые, 'круг туда-обратно ничего не копит');
  });
});

group('тогл брони переписывает общий эффект урона', () => {
  test('образец RED читается как «вычитание и износ» по броне тела и хитам', () => {
    deepEq(armorOf(red(), 'damage'), { choice: 'ablation', armor: 'sp_body', hp: 'hp' });
  });

  test('у эффекта без входа-листа броня ничего не пишет — нет «запасного» имени', () => {
    const system = red();
    system.effects.damage!.params = (system.effects.damage!.params ?? []).filter(param => param.kind !== 'sheet');
    const before = clone(system.effects.damage!.steps);
    setArmor(system, 'threshold', { event: 'damage', armor: 'sp_body', hp: 'hp' });
    deepEq(system.effects.damage!.steps, before);
  });

  test('образец D&D читается как «урон целиком»', () => {
    eq(armorOf(dnd(), 'damage').choice, 'none');
  });

  test('«порог»: урон не выше брони не проходит, выше — проходит целиком', () => {
    const world = clone(SAMPLE_WORLDS[1]!);
    const system = world.system as System;
    setArmor(system, 'threshold', { event: 'damage', armor: 'sp_body', hp: 'hp' });
    eq(armorOf(system, 'damage').choice, 'threshold');
    eq(errorsOf(lintSystem(system)).length, 0);
    deepEq(armorTail('threshold', 'sp_body', 'hp', 'amount', 'лист').map(s => s.type), ['check', 'branch', 'stop', 'end', 'apply']);
  });

  test('«вычитание и износ» даёт те же шаги, что собраны в образце RED руками для тела', () => {
    const system = red();
    const before = clone(system.effects.damage!.steps);
    setArmor(system, 'ablation', { event: 'damage', armor: 'sp_body', hp: 'hp' });
    deepEq(system.effects.damage!.steps, before);
  });

  test('переписывается только ветка выбранной брони: голова и «мимо брони» на месте, условие ветки сохранено', () => {
    const system = red();
    const before = clone(system.effects.damage!.steps!);
    setArmor(system, 'threshold', { event: 'damage', armor: 'sp_body', hp: 'hp' });
    const after = system.effects.damage!.steps!;
    deepEq(after.slice(endOf(after, 0) + 1), before.slice(endOf(before, 0) + 1));
    deepEq(after[0], before[0], 'условие ветки сохранено');
  });

  test('переписанный хвост работает за столом: урон 7 сквозь броню 11 по порогу не проходит', () => {
    const world = clone(SAMPLE_WORLDS[1]!);
    const system = world.system as System;
    setArmor(system, 'threshold', { event: 'damage', armor: 'sp_body', hp: 'hp' });
    const sheets = world.sheets as Sheet[];
    const [from, to] = sheets;
    const hpBefore = Number(to!.values.hp);
    const out = exchange({
      system, compendium: world.compendium as Compendium, die: () => 3, sheets,
      actionId: 'heavy-pistol:0', fromId: from!.id, toId: to!.id, inputs: { distance: 5, spend_luck: 0, aim: 'по телу' },
    });
    const after = out.sheets.find(s => s.id === to!.id)!;
    eq(Number(after.values.hp), hpBefore, 'по порогу малый урон не прошёл');
    eq(Number(after.values.sp_body), Number(to!.values.sp_body), 'броня по порогу не изнашивается');
  });
});

group('крит вдвое не ломает «кинуть» с тремя аргументами', () => {
  const dh = () => clone(SAMPLE_WORLDS.find(w => (w.system as System).name === 'Daggerheart')!.system as System);
  const formulas = (system: System): string[] => Object.values(system.effects).flatMap(effect => (effect.steps ?? [])
    .map(step => (step as { fixed?: { expr?: unknown } }).fixed?.expr)
    .filter((expr): expr is string => typeof expr === 'string' && expr.includes('кинуть(')));

  test('после «вдвое» формулы разбираются, третий аргумент остаётся третьим', () => {
    const system = dh();
    setCrit(system, 'double');
    for (const expr of formulas(system)) compile(expr);
    ok(formulas(system).some(expr => /кинуть\(@damage_die, .*если\(.*, 2, 1\), @действующий\.proficiency\)/.test(expr)), formulas(system).join('\n'));
  });

  test('туда и обратно — формулы прежние', () => {
    const system = dh();
    const before = formulas(system);
    setCrit(system, 'double');
    setCrit(system, 'off');
    deepEq(formulas(system), before);
  });
});
