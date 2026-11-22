import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import { withColumn } from '@vtt/engine';
import type { LaunchKind } from '@vtt/engine';
import { SAMPLE_SYSTEMS } from '@vtt/engine/samples';
import { emptySystem } from '../../store/world.ts';
import {
  newEffect, newColumn, newRecordKind, newBinding, newProp, newDie, newRollEdit, newTable,
  BRICKS,
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

    it('новый вид «auto» — висит с одной подпиской на любое действие', () => {
      const system = base();
      const made = newEffect(system, 'auto');
      expect(made.value.activation).toBe('passive');
      expect(made.value.on).toEqual([{ on: 'before:*', steps: [] }]);
    });

    it('новое поле проходит схему', () => {
      const system = base();
      system.tables = withColumn(system, newColumn(system).value).tables;
      expect(issuesOf(system)).toEqual([]);
    });

    it('новая колонка без блока', () => {
      expect(newColumn(base()).value).not.toHaveProperty('block');
    });

    it('новый тип записи со свойством проходит схему', () => {
      const system = base();
      const made = newRecordKind(system);
      made.value.columns = [newProp(made.value)];
      (system.tables ??= {})[made.key] = made.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('новая привязка проходит схему', () => {
      const system = base();
      const effect = newEffect(system, 'manual');
      system.effects[effect.key] = effect.value;
      const made = newRecordKind(system);
      made.value.bindings = [newBinding()];
      (system.tables ??= {})[made.key] = made.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('записи словарей проходят схему', () => {
      const system = base();
      const die = newDie(system); (system.constants ??= {})[die.key] = die.value;
      const edit = newRollEdit(system); (system.roll_edits ??= {})[edit.key] = edit.value;
      const table = newTable(system); (system.tables ??= {})[table.key] = table.value;
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
