import { group, test, eq, ok, deepEq } from './harness.ts';
import { critOf, setCrit, armorOf, setArmor, armorTail, CRIT_RULE, CRIT_EDIT } from '../src/model/toggles.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
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
    ok((system.room_rules ?? []).includes(CRIT_RULE));
    ok(!Object.values(system.effects).some(e => (e.steps ?? []).some(s => (s as Record<string, unknown>).double)), 'удвоение снято');
    eq(errorsOf(lintSystem(system)).length, 0);

    setCrit(system, 'off');
    eq(critOf(system), 'off');
    ok(!system.effects[CRIT_RULE]);
    ok(!system.roll_edits?.[CRIT_EDIT]);
    eq(errorsOf(lintSystem(system)).length, 0);
  });

  test('«кости вдвое» вешает удвоение на каждое число после проверки отправителя', () => {
    const system = dnd();
    setCrit(system, 'off');
    setCrit(system, 'double');
    const lineOf = (effect: string): string => {
      const step = system.effects[effect]!.steps!.find(s => s.type === 'amount') as Record<string, unknown>;
      return String((step.fixed as { expr?: unknown } | undefined)?.expr ?? '');
    };
    eq(lineOf('strike'), 'кинуть(@damage_dice, (@hit.atMax >= 1 ? 2 : 1)) + @damage_with');
    ok(!lineOf('spell_save_half').includes('? 2 : 1'),
      'после спасброска цели удвоения нет — это не атака');
    eq(errorsOf(lintSystem(system)).length, 0);
  });

  test('удвоение снимается из той же строки, не оставляя мусора', () => {
    const system = dnd();
    const lineOf = (effect: string): string => {
      const step = system.effects[effect]!.steps!.find(s => s.type === 'amount') as Record<string, unknown>;
      return String((step.fixed as { expr?: unknown } | undefined)?.expr ?? '');
    };
    setCrit(system, 'off');
    const голые = ['strike', 'cantrip_attack', 'spell_attack'].map(lineOf);
    deepEq(голые, [
      'кинуть(@damage_dice) + @damage_with',
      'кинуть(@damage_die, @cantrip_dice)',
      'кинуть(@damage_die, (@dice_count + (@slot - @spell_level) * @dice_up))',
    ]);
    setCrit(system, 'double');
    setCrit(system, 'off');
    deepEq(['strike', 'cantrip_attack', 'spell_attack'].map(lineOf), голые, 'круг туда-обратно ничего не копит');
  });
});

group('тогл брони переписывает общий эффект урона', () => {
  test('образец RED читается как «вычитание и износ» по броне тела и хитам', () => {
    deepEq(armorOf(red(), 'damage'), { choice: 'ablation', armor: 'sp_body', hp: 'hp' });
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
    deepEq(armorTail('threshold', 'sp_body', 'hp').map(s => s.type), ['compare', 'apply']);
  });

  test('«вычитание и износ» даёт те же шаги, что собраны в образце RED руками для тела', () => {
    const system = red();
    const bodyBranch = clone(system.effects.damage!.steps!.slice(0, 3))
      .map(step => { delete (step as Record<string, unknown>).when; return step; });
    setArmor(system, 'ablation', { event: 'damage', armor: 'sp_body', hp: 'hp' });
    deepEq(system.effects.damage!.steps, bodyBranch);
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
