import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { Views, holderOf } from '../src/core/view.ts';
import { rollHeld, rollEdits, gather, stack } from '../src/core/edits.ts';
import { calc } from '../src/engine/calc.ts';
import { amountParamOf } from '../src/model/lists.ts';
import type { Sheet, System } from '../src/model/types.ts';

const world = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;

function withEffect(system: System, id: string, modifiers: unknown[]): System {
  return { ...system, effects: { ...system.effects, [id]: { label: id, activation: 'passive', modifiers } as never } };
}

const wearing = (sheet: Sheet, effectId: string): Sheet => ({ ...sheet, effects: [...(sheet.effects ?? []), { effectId }] });

describe('правки на листе-держателе', () => {
  const base = flattenSystem(world.system);
  const system = withEffect(base, 'уклон', [
    { kind: 'edit', call: 'roll', param: 'bonus', as: 'against', op: 'add', value: { expr: '-@ac' } },
  ]);
  const attacker = world.sheets.find((s: Sheet) => s.id === 'ogre')!;
  const target = wearing(world.sheets.find((s: Sheet) => s.id === 'arven')!, 'уклон');
  const sheets = [attacker, target];
  const views = new Views(system, world.compendium);

  it('прибавка «бросок по мне» считается по листу, где висит правка, — по цели', () => {
    const roller = views.of(sheets, attacker.id);
    const against = views.of(sheets, target.id);
    const held = rollHeld(roller, against, ['атака']);
    const { bonus } = rollEdits(held, [], roller, ['атака']);
    const targetAc = Number(calc(system, target, 'ac', against));
    const attackerAc = Number(calc(system, attacker, 'ac', roller));
    expect(targetAc).not.toBe(attackerAc);
    expect(bonus).toBe(-targetAc);
  });

  it('без противника правок «по мне» нет', () => {
    const roller = views.of(sheets, attacker.id);
    expect(rollEdits(rollHeld(roller, null, ['атака']), [], roller, ['атака']).bonus).toBe(0);
  });

  it('заявленная правка броска собирается словарём; неизвестная — ошибка словами', () => {
    const roller = views.of(sheets, attacker.id);
    const key = Object.keys(system.roll_edits ?? {})[0]!;
    expect(rollEdits([], [key], roller, []).edits.map(e => e.label)).toHaveLength(1);
    expect(() => rollEdits([], ['нет-такой'], roller, [])).toThrow(/нет в словаре/);
  });
});

describe('условие правки: одна политика', () => {
  const base = flattenSystem(world.system);
  const sheet = (_system: System) => [wearing(world.sheets.find((s: Sheet) => s.id === 'arven')!, 'x')];
  const damage = Object.keys(base.effects).find(id => amountParamOf(base.effects[id]!)?.key === 'amount')!;
  const views = (system: System) => new Views(system, world.compendium);

  const spec = { call: damage, param: 'amount', tags: [], args: {} };

  it('опечатка в условии правки всплывает, а не глотается', () => {
    const typo = withEffect(base, 'x', [{ kind: 'edit', call: damage, param: 'amount', op: 'mul', value: { expr: '0.5' }, condition: { expr: '@нет_такого_поля > 0' } }]);
    expect(() => gather(views(typo).of(sheet(typo), 'arven'), spec)).toThrow();
  });

  it('«только если по вызову» видит аргументы вызова', () => {
    const ok = withEffect(base, 'x', [{ kind: 'edit', call: damage, param: 'amount', op: 'mul', value: { expr: '0.5' }, when: { expr: '@вызов.amount > 5' } }]);
    const okView = views(ok).of(sheet(ok), 'arven');
    expect(stack(gather(okView, { ...spec, args: { amount: 10 } }), 10, 'урон')).toBe(5);
    expect(stack(gather(okView, { ...spec, args: { amount: 3 } }), 3, 'урон')).toBe(3);
  });
});

describe('держатель поля', () => {
  it('поле стола держит стол, своё — сам лист', () => {
    const system = flattenSystem(world.system);
    const deskField = Object.entries(system.tables ?? {}).find(([, t]) => (t as { owner?: string }).owner === 'desk');
    const sheets = world.sheets as Sheet[];
    expect(holderOf(system, sheets, 'arven', 'ac')).toBe('arven');
    if (deskField) {
      const column = ((deskField[1] as { columns?: { key: string }[] }).columns ?? [])[0]?.key;
      if (column) expect(holderOf(system, sheets, 'arven', column)).toBe('стол');
    }
  });
});
