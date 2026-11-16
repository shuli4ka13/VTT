import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Chip } from '../ui/primitives.tsx';
import { groupsByKind } from './record-view.tsx';
import type { CompendiumRecord, System } from '@vtt/schema';

export function ThingsList<T extends CompendiumRecord>({ system, records, row, onPickKind, kinds }: {
  system: System;
  kinds?: readonly string[] | undefined;
  records: readonly T[];
  row: (record: T) => ReactNode;
  onPickKind?: (table: string) => void;
}) {
  return (
    <>
      {orderedKinds(groupsByKind(system, records), kinds ?? Object.keys(system.tables ?? {})).map(({ table, title, records: group }) => (
        <Fragment key={table}>
          <h4 className="sheet-section__title">
            {onPickKind
              ? <button type="button" className="sheet-pick__head" title="что видно в строке" onClick={() => onPickKind(table)}>{title}</button>
              : title}
          </h4>
          {group.map(record => <Fragment key={record.id}>{row(record)}</Fragment>)}
        </Fragment>
      ))}
    </>
  );
}

export function orderedKinds<G extends { table: string }>(groups: G[], kinds: readonly string[]): G[] {
  return kinds.flatMap(kind => groups.filter(group => group.table === kind));
}

export function ThingLine({ label, active, onClick, actions, details, more }: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
  details?: string;
  more?: ReactNode;
}) {
  return (
    <div>
      <div className="inline inline--tight">
        <Chip {...(active ? { active } : {})} {...(onClick ? { onClick } : {})}>{label}</Chip>
        {actions}
      </div>
      {details ? <div className="faint">{details}</div> : null}
      {more}
    </div>
  );
}
