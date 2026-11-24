import { group, test, eq, ok, deepEq } from './harness.ts';
import { critOf, setCrit, armorOf, setArmor, armorTail, CRIT_RULE, CRIT_EDIT, CRIT_DOUBLE } from '../src/model/toggles.ts';
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
    eq(lintSystem(system).filter(p => p.text.includes('в условии нет носителя')).map(p => p.text).join('|'), '', 'правило комнаты привязано к бросающему — предупреждения нет');

    setCrit(system, 'off');
    eq(critOf(system), 'off');
    ok(!system.effects[CRIT_RULE]);
    ok(!system.roll_edits?.[CRIT_EDIT]);
    eq(errorsOf(lintSystem(system)).length, 0);
  });

  const damageOf = (system: System, effect: string): Record<string, unknown> =>
    system.effects[effect]!.steps!.find(s => s.id === 'uron' || s.id === 'uron_vsego') as Record<string, unknown>;
  const marksOf = (system: System, effect: string): string[] => ((damageOf(system, effect).tags as unknown[] | undefined) ?? [])
    .filter((tag): tag is { expr: string } => typeof tag === 'object' && tag !== null).map(tag => tag.expr).filter(expr => expr.includes('"krit"'));

  test('«кости вдвое» — правило среди выданного всем и метка «крит» на каждом числе после проверки действующего', () => {
    const system = dnd();
    setCrit(system, 'off');
    eq(critOf(system), 'off');
    deepEq(marksOf(system, 'strike'), []);
    setCrit(system, 'double');
    eq(critOf(system), 'double');
    ok((system.grants ?? []).includes(CRIT_DOUBLE));
    deepEq(system.effects[CRIT_DOUBLE]!.modifiers!.map(mod => [(mod as { param?: string }).param, (mod as { op?: string }).op, (mod as { tags?: string[] }).tags]), [['count', 'mul', ['krit']]]);
    deepEq(marksOf(system, 'strike'), ['if(@brosok.krit, "krit", "")']);
    ok(!JSON.stringify(system.effects.spell_save!.steps).includes('"krit"'),
      'урон Огненного шара бросается до спасбросков — метки нет, это не атака');
    eq(errorsOf(lintSystem(system)).length, 0);
  });

  test('образец уже собран переключателем: «кости вдвое» поверх ничего не меняет, формулы шагов не трогаются', () => {
    const system = dnd();
    const before = JSON.stringify(system);
    setCrit(system, 'double');
    eq(JSON.stringify(system), before);
    setCrit(system, 'explode');
    eq((damageOf(system, 'strike').times as { expr: string }).expr, '@dice');
    deepEq(marksOf(system, 'strike'), []);
  });

  test('туда и обратно ничего не копит: «нет» снимает правило и метки, число костей и кость не трогаются', () => {
    const system = dnd();
    setCrit(system, 'off');
    const bare = JSON.stringify(system);
    setCrit(system, 'double');
    setCrit(system, 'off');
    eq(JSON.stringify(system), bare);
    ok(!system.effects[CRIT_DOUBLE] && !(system.grants ?? []).includes(CRIT_DOUBLE));
    const step = damageOf(system, 'strike');
    eq((step.die as { expr: string }).expr, '@damage_dice');
    ok(step.count === undefined, 'число костей не трогается — у «2к6» их две');
  });

  test('«нет» не трогает чужую формулу метки, в которой «крит» — только часть', () => {
    const system = dnd();
    const own = { expr: 'if(@brosok.popal, "ognennyy", "") + if(@brosok.krit, "krit", "")' };
    (damageOf(system, 'strike').tags as unknown[]).push(own);
    setCrit(system, 'off');
    ok((damageOf(system, 'strike').tags as unknown[]).some(tag => JSON.stringify(tag) === JSON.stringify(own)));
  });

  test('крит удваивает кости за столом: с правилом — вдвое, без правила — как обычно', () => {
    const world = clone(SAMPLE_WORLDS[0]!);
    const hit = (system: System): number => {
      const sheets = (clone(world.sheets) as Sheet[]).map(sheet => (sheet.id === 'orc' ? { ...sheet, values: { ...sheet.values, hp_block: 500, hp_current: 500 } } : sheet));
      const out = exchange({ system, compendium: world.compendium as Compendium, die: () => 8, sheets, actionId: 'longsword:0', fromId: 'arven', toId: 'orc', claims: {} });
      return Number(sheets.find(s => s.id === 'orc')!.values.hp_current) - Number(out.sheets.find(s => s.id === 'orc')!.values.hp_current);
    };
    const on = world.system as System;
    const off = clone(on);
    setCrit(off, 'off');
    eq(hit(on) - hit(off), 0, 'восьмёрка — не крит: правило молчит');
    const crit = (system: System): System => { const next = clone(system); (next.effects.attack_roll!.returns!.find(column => column.key === 'krit') as { expr: { expr: string } }).expr = { expr: '@proverka.success' }; return next; };
    eq(hit(crit(on)) - hit(crit(off)), 8, 'крит: кость оружия брошена дважды — на восемь больше');
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
      actionId: 'heavy-pistol:0', fromId: from!.id, toId: to!.id, inputs: { distance: 5, spend_luck: 0, aim: 'po_telu' },
    });
    const after = out.sheets.find(s => s.id === to!.id)!;
    eq(Number(after.values.hp), hpBefore, 'по порогу малый урон не прошёл');
    eq(Number(after.values.sp_body), Number(to!.values.sp_body), 'броня по порогу не изнашивается');
  });
});

group('крит вдвое не ломает бросок урона с «оставить»', () => {
  const dh = () => clone(SAMPLE_WORLDS.find(w => (w.system as System).name === 'Daggerheart')!.system as System);
  const formulas = (system: System): string[] => Object.values(system.effects).flatMap(effect => (effect.steps ?? [])
    .filter(step => (step as { type?: string; die?: unknown }).type === 'roll' && (step as { die?: unknown }).die !== undefined)
    .map(step => JSON.stringify(step)));

  test('после «вдвое» число костей и «оставить» урона героя на месте, бросок получил метку «крит»', () => {
    const system = dh();
    setCrit(system, 'double');
    const hero = formulas(system).find(text => text.includes('@damage_die'))!;
    ok(hero.includes('"keep":{"expr":"@deystvuyuschiy.proficiency"}'), hero);
    ok(hero.includes('"count":{"expr":"@deystvuyuschiy.proficiency + @extra_die"}'), hero);
    ok(hero.includes('\\"krit\\"') && !/"times":/.test(hero), hero);
    ok(lintSystem(system).some(problem => problem.level === 'warn' && problem.text.includes('кто бросает')), 'бросок урона героя без бросающего — «Проблемы» говорят, что правило до него не дойдёт');
  });

  test('туда и обратно — формулы прежние', () => {
    const system = dh();
    const before = formulas(system);
    setCrit(system, 'double');
    setCrit(system, 'off');
    deepEq(formulas(system), before);
  });
});
