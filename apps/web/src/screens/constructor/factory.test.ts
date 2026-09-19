import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { emptySystem } from '../../store/world.ts';
import {
  newEffect, newField, newRecordKind, newBinding, newProp, newDie, newRollEdit, newRoll, newTable,
  newEvent, newActionType, BRICKS,
} from './factory.ts';
import type { System, Activation } from '@vtt/schema';

const BASES: [string, () => System][] = [
  ['пустая система', emptySystem],
  ...SAMPLE_SYSTEMS.map((s): [string, () => System] => [String(s.name ?? s.id), () => structuredClone(s) as System]),
];

const issuesOf = (system: System): string[] => {
  const parsed = W.system.safeParse(system);
  return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
};

const ACTIVATIONS: Activation[] = ['manual', 'triggered', 'reaction', 'passive'];

const BROKEN_NOW = new Set(['triggered']);

for (const [name, base] of BASES) {
  describe(`фабрики конструктора поверх «${name}»`, () => {
    it('основа сама проходит схему', () => {
      expect(issuesOf(base())).toEqual([]);
    });

    for (const activation of ACTIVATIONS) {
      const check = () => {
        const system = base();
        const made = newEffect(system, activation);
        system.effects[made.key] = made.value;
        expect(issuesOf(system)).toEqual([]);
      };
      if (BROKEN_NOW.has(activation)) it.fails(`новый эффект «${activation}» проходит схему`, check);
      else it(`новый эффект «${activation}» проходит схему`, check);
    }

    it.fails('новый эффект «reaction» получает настройку, когда стол спрашивает', () => {
      const made = newEffect(base(), 'reaction');
      expect(made.value.trigger?.on).toBeTruthy();
    });

    it('новое поле проходит схему', () => {
      const system = base();
      system.fields.push(newField(system, 'Новый блок').value);
      expect(issuesOf(system)).toEqual([]);
    });

    it('новый тип записи со свойством проходит схему', () => {
      const system = base();
      const made = newRecordKind(system);
      made.value.props = [newProp(made.value)];
      (system.records ??= {})[made.key] = made.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('новая привязка проходит схему', () => {
      const system = base();
      const effect = newEffect(system, 'manual');
      system.effects[effect.key] = effect.value;
      const made = newRecordKind(system);
      made.value.bindings = [newBinding(system)];
      (system.records ??= {})[made.key] = made.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('записи словарей проходят схему', () => {
      const system = base();
      const die = newDie(system); (system.constants ??= {})[die.key] = die.value;
      const edit = newRollEdit(system); (system.roll_edits ??= {})[edit.key] = edit.value;
      (system.rolls ??= []).push(newRoll(system));
      const table = newTable(system); (system.tables ??= {})[table.key] = table.value;
      const event = newEvent(system); (system.events ??= {})[event.key] = event.value;
      const action = newActionType(system); (system.action_types ??= {})[action.key] = action.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('каждый шаг палитры проходит схему', () => {
      for (const brick of BRICKS) {
        const system = base();
        const effect = newEffect(system, 'manual');
        effect.value.steps = brick.make(system, []);
        system.effects[effect.key] = effect.value;
        expect(issuesOf(system), brick.key).toEqual([]);
      }
    });
  });
}
