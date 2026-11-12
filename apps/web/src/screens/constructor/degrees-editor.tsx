import { Select } from '../../ui/primitives.tsx';
import { DegreeList } from './degree-list.tsx';
import type { Degree } from './degree-list.tsx';
import type { System } from '@vtt/schema';
import { rowTables } from '@vtt/engine/model/tables';

type Shared = Parameters<typeof DegreeList>[0]['shared'];

export type DegreesValue = Degree[] | { table: string; of?: 'margin' };

export function DegreesEditor({ value, set, system, where, shared, placeholder }: {
  value: unknown;
  set: (next: DegreesValue | undefined) => void;
  system: System;
  where: string;
  shared: Shared;
  placeholder?: string;
}) {
  const tables = rowTables(system);
  const scale = value && !Array.isArray(value) ? value as { table: string; of?: string } : null;
  const list = Array.isArray(value) ? value as Degree[] : [];
  return (
    <>
      {tables.length || scale ? (
        <span className="inline inline--tight">
          <Select
            label="Ступени"
            value={scale?.table ?? ''}
            options={[['', 'списком'], ...tables.map(([key, t]) => [key, `из таблицы «${t.label || key}»`] as const)] as never}
            onChange={(next: string) => set(next ? { table: next, ...(scale?.of === 'margin' ? { of: 'margin' as const } : {}) } : undefined)}
          />
          {scale ? (
            <>
              <span className="faint">ступень по</span>
              <Select
                label="Ступень по"
                value={scale.of === 'margin' ? 'margin' : 'total'}
                options={[['total', 'итогу'], ['margin', 'запасу против порога']] as const}
                onChange={(next: string) => set({ table: scale.table, ...(next === 'margin' ? { of: 'margin' as const } : {}) })}
              />
            </>
          ) : null}
        </span>
      ) : null}
      {scale ? null : (
        <DegreeList list={list} system={system} where={where} shared={shared} {...(placeholder ? { placeholder } : {})}
          change={apply => {
            const next = structuredClone(list);
            apply(next);
            set(next.length ? next : undefined);
          }} />
      )}
    </>
  );
}
