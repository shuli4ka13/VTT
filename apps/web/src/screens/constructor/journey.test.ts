import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import { exchange } from '@vtt/engine/events/exchange';
import { unifyWorld } from '@vtt/engine/model/unify';
import { emptySystem } from '../../store/world.ts';
import { newField, newDie, newEffect, newRecordKind, newBinding, BRICKS } from './factory.ts';
import type { System, Compendium, Sheet, Step } from '@vtt/schema';

const brick = (key: string, system: System, taken: string[] = []): Step =>
  BRICKS.find(b => b.key === key)!.make(system, taken)[0]!;

function assemble(): { system: System; compendium: Compendium; sheets: Sheet[]; hits: string; action: string } {
  const system = emptySystem();

  const hits = newField(system, 'Здоровье');
  hits.value.label = 'Хиты';
  hits.value.value = { kind: 'stored', type: 'number', default: 10, min: 0 };
  system.fields.push(hits.value);

  const die = newDie(system);
  die.value.label = 'Кость проверки';
  (system.constants ??= {})[die.key] = die.value;

  const effect = newEffect(system, 'manual');
  effect.value.label = 'Удар';
  const check = brick('check', system) as Record<string, any>;
  check.id = 'попадание';
  check.versus = { const: 5 };
  const amount = brick('number', system) as Record<string, any>;
  amount.dice = { const: '1d4' };
  const change = brick('change', system) as Record<string, any>;
  change.target = { tag: hits.key };
  change.value = { ref: amount.id };
  effect.value.steps = [check, amount, change] as Step[];
  system.effects[effect.key] = effect.value;

  const kind = newRecordKind(system);
  kind.value.kind = 'action';
  kind.value.label = 'Приём';
  kind.value.bindings = [newBinding(system)];
  (system.records ??= {})[kind.key] = kind.value;

  const compendium: Compendium = {
    items: [],
    actions: [{ id: 'удар', rk: kind.key, label: 'Удар' }],
  } as Compendium;

  const sheet = (id: string, name: string): Sheet => W.sheet.parse({
    id, systemId: system.id ?? '', kind: 'pc', name, values: {}, equipped: [], effects: [], actions: ['удар'],
  });

  return { system, compendium, sheets: [sheet('герой', 'Герой'), sheet('враг', 'Враг')], hits: hits.key, action: 'удар:0' };
}

describe('сквозной путь: собрал в конструкторе → прошёл схему → сыграл', () => {
  it('собранный мир проходит схему', () => {
    const { system, compendium, sheets } = assemble();
    const parsed = W.world.safeParse({ system, compendium, sheets });
    expect(parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });

  it('удар по максимальным костям уменьшает хиты цели', () => {
    const made = assemble();
    const world = unifyWorld({ system: made.system, compendium: made.compendium });
    const out = exchange({
      ...world, die: (sides: number) => sides, sheets: made.sheets,
      actionId: made.action, fromId: 'герой', toId: 'враг',
    } as never);
    const target = out.sheets.find(s => s.id === 'враг')!;
    expect(target.values[made.hits]).toBe(6);
  });

  it('удар по минимальным костям обрывается на проверке и хиты не трогает', () => {
    const made = assemble();
    const world = unifyWorld({ system: made.system, compendium: made.compendium });
    const out = exchange({
      ...world, die: () => 1, sheets: made.sheets,
      actionId: made.action, fromId: 'герой', toId: 'враг',
    } as never);
    const target = out.sheets.find(s => s.id === 'враг')!;
    expect(target.values[made.hits] ?? 10).toBe(10);
    expect(out.reports[0]!.report.stopped).toBeTruthy();
  });
});
