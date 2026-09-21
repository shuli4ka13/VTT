import { Card, Chip } from '../ui/primitives.tsx';
import { asDice } from '../words.ts';
import { listOf } from '@vtt/engine/model/lists';
import type { CompendiumRecord, Compendium, System } from '@vtt/schema';

export interface RecordLine { label: string; value: string }

const recordLabel = (compendium: Compendium | undefined, id: string): string => {
  const found = [...(compendium?.items ?? []), ...(compendium?.actions ?? [])].find(r => r.id === id);
  return found?.label ?? id;
};

export function recordDetails(record: CompendiumRecord, system: System, compendium?: Compendium): RecordLine[] {
  const kind = system.records?.[String(record.rk)];
  return (kind?.props ?? [])
    .filter(prop => prop.onSheet !== false)
    .filter(prop => record.props?.[prop.key] !== undefined && record.props[prop.key] !== '')
    .map(prop => {
      const raw = String(record.props?.[prop.key]);
      const kindOf = String(prop.kind ?? 'number');
      const value = kindOf === 'dice' ? asDice(raw)
        : kindOf === 'effect' ? (system.effects[raw]?.label ?? raw)
          : kindOf === 'record' ? recordLabel(compendium, raw)
            : kindOf === 'choice'
              ? (listOf(system, prop.from)?.find(option => String(option.value) === raw)?.label ?? raw)
              : raw;
      return { label: prop.label ?? prop.key, value };
    });
}

export function recordButtons(record: CompendiumRecord, system: System): string[] {
  const kind = system.records?.[String(record.rk)];
  const bindings = record.activities?.length ? record.activities : (kind?.bindings ?? []);
  return bindings.map(b => b.label ?? system.effects[b.effect]?.label ?? 'Применение');
}

export function RecordView({ record, system, compendium }: {
  record: CompendiumRecord;
  system: System;
  compendium?: Compendium;
}) {
  const details = recordDetails(record, system, compendium);
  const buttons = recordButtons(record, system);
  const kind = system.records?.[String(record.rk)];

  return (
    <Card tone="flat">
      <div className="record-view">
        <div className="record-view__head">
          <span className="record-view__name">{record.label ?? record.id}</span>
          {kind ? <Chip>{kind.label ?? String(record.rk)}</Chip> : null}
        </div>
        {record.description ? <p className="record-view__text">{record.description}</p> : null}
        {details.length ? (
          <dl className="record-view__props">
            {details.map(line => (
              <div key={line.label} className="record-view__prop">
                <dt>{line.label}</dt>
                <dd className="num">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {buttons.length ? (
          <div className="inline inline--tight">
            {buttons.map(label => <Chip key={label} active>{label}</Chip>)}
          </div>
        ) : null}
        {record.grants?.length ? (
          <div className="inline inline--tight">
            <span className="faint">даёт:</span>
            {record.grants.map(id => <Chip key={id}>{system.effects[id]?.label ?? id}</Chip>)}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
