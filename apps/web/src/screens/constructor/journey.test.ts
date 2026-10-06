import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import { act } from '@vtt/engine/core/act';
import { emptyJournal } from '@vtt/engine/core/external';
import { emptySystem } from '../../store/world.ts';
import { newColumn, newDie, newEffect, newRecordKind, newBinding, BRICKS } from './factory.ts';
import type { System, Compendium, Sheet, Step } from '@vtt/schema';
import { withColumn } from '@vtt/engine/model/sheet-columns';

const bricks = (key: string, system: System, taken: string[] = []): Step[] =>
  BRICKS.find(b => b.key === key)!.make(system, taken);

function assemble(): { system: System; compendium: Compendium; sheets: Sheet[]; hits: string; action: string } {
  const system = emptySystem();

  const hits = newColumn(system, 'Здоровье');
  Object.assign(hits.value, { label: 'Хиты', kind: 'number', default: 10, min: 0 });
  system.tables = withColumn(system, hits.value).tables;

  const die = newDie(system);
  die.value.label = 'Кость проверки';
  (system.constants ??= {})[die.key] = die.value;

  const effect = newEffect(system, 'manual');
  effect.value.label = 'Удар';
  effect.value.params = [
    { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
    { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } },
  ];
  const each = BRICKS.find(b => b.key === 'each')!.make(system, [], effect.value)[0]!;
  const [roll, check] = bricks('check', system) as [Record<string, any>, Record<string, any>];
  check.versus = { expr: '5' };
  const amount = bricks('number', system, ['проверка', 'проверка_бросок'])[0] as Record<string, any>;
  amount.die = { expr: '"1d4"' };
  delete amount.fixed;
  const change = bricks('change', system)[0] as Record<string, any>;
  change.target = { expr: `@цель.${hits.key}` };
  change.value = { expr: `@${amount.id}` };
  effect.value.steps = [each, roll, check, amount, change] as Step[];
  system.effects[effect.key] = effect.value;

  const kind = newRecordKind(system);
  kind.value.use = 'action';
  kind.value.label = 'Приём';
  kind.value.bindings = [newBinding(system)];
  (system.tables ??= {})[kind.key] = kind.value;

  const compendium: Compendium = {
    records: [{ id: 'удар', table: kind.key, label: 'Удар' }],
  } as Compendium;

  const sheet = (id: string, name: string): Sheet => W.sheet.parse({
    id, systemId: system.id ?? '', name, values: {}, has: [{ of: 'удар' }], effects: []
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
    const world = { system: made.system, compendium: made.compendium };
    const out = act({
      ...world, clock: null, die: (sides: number) => sides, sheets: made.sheets, journal: emptyJournal(), declineAll: true,
    } as never, { actionId: made.action, fromId: 'герой', toIds: ['враг'] });
    const target = out.sheets.find(s => s.id === 'враг')!;
    expect(target.values[made.hits]).toBe(6);
  });

  it('удар по минимальным костям обрывается на проверке и хиты не трогает', () => {
    const made = assemble();
    const world = { system: made.system, compendium: made.compendium };
    const out = act({
      ...world, clock: null, die: () => 1, sheets: made.sheets, journal: emptyJournal(), declineAll: true,
    } as never, { actionId: made.action, fromId: 'герой', toIds: ['враг'] });
    const target = out.sheets.find(s => s.id === 'враг')!;
    expect(target.values[made.hits] ?? 10).toBe(10);
    expect(out.entries.some(entry => 'report' in entry && entry.report.stopped)).toBeTruthy();
  });
});
