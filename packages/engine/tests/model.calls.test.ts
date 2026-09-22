import { group, test, eq, ok, deepEq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { unifyCalls } from '../src/model/calls.ts';
import { exchange } from '../src/events/exchange.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

type Loose = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const hpAfter = (world: typeof PLAYABLE_WORLDS[number], system: System, action: string, targetAt: number, extra: string[] = []) => {
  const sheets = clone(world.sheets as Sheet[]);
  const hero = sheets[0]!;
  (hero as Loose).equipped = [...(hero.equipped ?? []), action.split(':')[0]];
  const target = sheets[targetAt]!;
  (target.values as Loose).hp_current = 200;
  (target as Loose).effects = [...(target.effects ?? []), ...extra.map(effectId => ({ effectId }))];
  const out = exchange({
    system, compendium: world.compendium as Compendium, die: () => 17,
    sheets: [hero, target], actionId: action, fromId: hero.id, toId: target.id, inputs: {},
  });
  return out.sheets.find(s => s.id === target.id)!.values.hp_current;
};

group('вызов: число и метки — обычные потребности вызванного', () => {
  const world = PLAYABLE_WORLDS[0]!;
  const legacy = clone(world.system) as System;
  (legacy.effects.damage as Loose).tagsFrom = ['damage_types', 'damage_source'];
  legacy.effects.damage!.params = [];
  for (const effect of Object.values(legacy.effects)) {
    for (const step of [...(effect.steps ?? []), ...(effect.self ?? [])] as Loose[]) {
      if (step.type !== 'emit' || step.event !== 'damage') continue;
      const args = (step.args ?? {}) as Loose;
      const amount = Object.values(args)[0];
      step.amount = amount;
      step.tags = Object.values(args).slice(1).map(v => ((v as Loose).const ?? v));
      delete step.args;
    }
  }
  const unified = unifyCalls(legacy);
  const damage = unified.effects.damage!;

  test('у «Урона» появились входы: главное число и выборы из таблиц', () => {
    const params = (damage.params ?? []) as Loose[];
    eq(params.find(p => p.role === 'amount')?.kind, 'number');
    deepEq(params.filter(p => p.kind === 'choice').map(p => p.from), ['damage_types', 'damage_source']);
    eq((damage as Loose).tagsFrom, undefined);
  });

  test('ни один вызов не шлёт число и метки мимо потребностей', () => {
    for (const effect of Object.values(unified.effects)) {
      for (const step of [...(effect.steps ?? []), ...(effect.self ?? [])] as Loose[]) {
        if (step.type !== 'emit' || step.event !== 'damage') continue;
        eq(step.amount, undefined, JSON.stringify(step));
        eq(step.tags, undefined, JSON.stringify(step));
      }
    }
  });

  test('удар даёт те же хиты до и после перевода — и с каменной кожей тоже', () => {
    for (const [action, skin] of [['longsword:0', []], ['magic_sword_1:0', ['stoneskin']], ['longsword:0', ['stoneskin']]] as const) {
      eq(hpAfter(world, unified, action, 5, [...skin]), hpAfter(world, legacy, action, 5, [...skin]), `${action} ${skin.join()}`);
    }
  });

  test('переведённый мир проходит линт', () => {
    const errors = errorsOf(lintSystem(unified, world.compendium as Compendium)).map(p => p.text);
    eq(errors.length, 0, errors.join('\n'));
  });

  test('повторный перевод ничего не меняет', () => {
    ok(unifyCalls(unified) === unified);
  });
});
