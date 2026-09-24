import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { emptySystem } from '../../store/world.ts';
import {
  newEffect, newField, newRecordKind, newBinding, newProp, newDie, newRollEdit, newTable,
  newCalled, BRICKS,
} from './factory.ts';
import type { System } from '@vtt/schema';

const BASES: [string, () => System][] = [
  ['пустая система', emptySystem],
  ...SAMPLE_SYSTEMS.map((s): [string, () => System] => [String(s.name ?? s.id), () => structuredClone(s) as System]),
];

const issuesOf = (system: System): string[] => {
  const parsed = W.system.safeParse(system);
  return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
};

const KINDS: LaunchKind[] = ['manual', 'auto', 'passive'];

for (const [name, base] of BASES) {
  describe(`фабрики конструктора поверх «${name}»`, () => {
    it('основа сама проходит схему', () => {
      expect(issuesOf(base())).toEqual([]);
    });

    for (const kind of KINDS) {
      const check = () => {
        const system = base();
        const made = newEffect(system, kind);
        system.effects[made.key] = made.value;
        expect(issuesOf(system)).toEqual([]);
      };
      it(`новый эффект «${kind}» проходит схему`, check);
    }

    it('новый «срабатывает сам» — висит с одним пустым «когда»', () => {
      const system = base();
      const made = newEffect(system, 'auto');
      expect(made.value.activation).toBe('passive');
      expect(made.value.on).toEqual([{ on: '', steps: [] }]);
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
      const table = newTable(system); (system.tables ??= {})[table.key] = table.value;
      const called = newCalled(system); system.effects[called.key] = called.value;
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
