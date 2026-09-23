import { useState } from 'react';
import { FieldCell } from '../../sheet/field-cell.tsx';
import { useReader } from '../../engine/use-calc.ts';
import { mannequinsOf } from '../../engine/dry-run.ts';
import type { System, Compendium, Field as FieldModel, StoredValue } from '@vtt/schema';

export function FieldPreview({ field, system, compendium }: {
  field: FieldModel;
  system: System;
  compendium: Compendium;
}) {
  const [doll] = mannequinsOf(system);
  const [tried, setTried] = useState<Record<string, StoredValue>>({});
  const sheet = { ...doll!, values: { ...doll!.values, ...tried } };
  const reader = useReader(system, sheet, compendium);

  return (
    <div className="field-preview" aria-label="Так поле увидит игрок">
      <span className="faint field-preview__note">так увидит игрок · можно пощёлкать, система не меняется</span>
      <FieldCell
        field={field} system={system} sheet={sheet} reader={reader}
        onChange={(tag, value) => setTried(before => ({ ...before, [tag]: value }))}
      />
    </div>
  );
}
