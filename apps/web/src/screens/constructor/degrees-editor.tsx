import { Select } from '../../ui/primitives.tsx';
import { DegreeList } from './degree-list.tsx';
import type { Degree } from './degree-list.tsx';
import type { System } from '@vtt/schema';
import { rowTables } from '@vtt/engine';
import { useT } from '../../i18n/author.ts';

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
  const t = useT('fields');
  const tables = rowTables(system);
  const scale = value && !Array.isArray(value) ? value as { table: string; of?: string } : null;
  const list = Array.isArray(value) ? value as Degree[] : [];
  return (
    <>
      {tables.length || scale ? (
        <span className="inline inline--tight">
          <Select
            label={t('degrees.label')}
            value={scale?.table ?? ''}
            options={[['', t('degrees.list')], ...tables.map(([key, table]) => [key, t('degrees.fromTable', { name: table.label || key })] as const)] as never}
            onChange={(next: string) => set(next ? { table: next, ...(scale?.of === 'margin' ? { of: 'margin' as const } : {}) } : undefined)}
          />
          {scale ? (
            <>
              <span className="faint">{t('degrees.by')}</span>
              <Select
                label={t('degrees.byLabel')}
                value={scale.of === 'margin' ? 'margin' : 'total'}
                options={[['total', t('degrees.byTotal')], ['margin', t('degrees.byMargin')]] as const}
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
