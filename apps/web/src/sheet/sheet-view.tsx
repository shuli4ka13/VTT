import { Card, CardHead, Chip } from '../ui/primitives.tsx';
import { FieldCell } from './field-cell.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, Field as FieldModel, StoredValue } from '@vtt/schema';

export const groupsOf = (system: System): [string, FieldModel[]][] => {
  const groups = new Map<string, FieldModel[]>();
  for (const field of system.fields) {
    const key = field.group ?? 'Без блока';
    const list = groups.get(key);
    if (list) list.push(field as FieldModel);
    else groups.set(key, [field as FieldModel]);
  }
  return [...groups];
};

export function SheetView({ system, sheet, reader, onChange, onRoll, badge, only }: {
  system: System;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
  badge?: string;
  only?: string[];
}) {
  const shown = only
    ? groupsOf(system).map(([group, fields]) =>
      [group, fields.filter(f => only.includes(f.tag))] as [string, FieldModel[]]).filter(([, fields]) => fields.length)
    : groupsOf(system);

  return (
    <>
      <Card>
        <CardHead title={sheet.name ?? sheet.id} badge={badge ? <Chip>{badge}</Chip> : undefined} />
      </Card>

      {shown.map(([group, fields]) => (
        <Card key={group}>
          <CardHead title={group} />
          <div className="row">
            {fields.map(field => (
              <FieldCell
                key={field.tag}
                field={field}
                system={system}
                sheet={sheet}
                reader={reader}
                onChange={onChange}
                onRoll={onRoll}
              />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
