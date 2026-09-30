import { useMemo, useState } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, Field, Select } from '../../ui/primitives.tsx';
import { sheetKinds, shownOn } from '@vtt/engine/model/owned';
import type { Sheet, StoredValue, System } from '@vtt/schema';
import { fieldsOf, fieldOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';

export function setSample(draft: System, tag: string, value: StoredValue): void {
  const field = fieldOf(draft, tag);
  const table = field ? draft.tables?.[field.home] : undefined;
  if (!field || !table || field.value.kind !== 'stored' || value === null) return;
  if (field.cell) {
    const mark = field.cell;
    const row = (table.rows ?? []).find(r => rowKeyOf(r) === mark.row);
    if (row) row.view = { ...row.view, [mark.column]: { ...row.view?.[mark.column], default: value } };
    return;
  }
  const column = (table.columns ?? []).find(c => c.key === tag);
  if (column) column.default = value;
}

export function SheetSample({ system, picked, onPick }: { system: System; picked?: string | null; onPick?: (tag: string) => void }) {
  const compendium = useBook();
  const editSystem = useWorld(s => s.editSystem);
  const kinds = sheetKinds(system);
  const [of, setOf] = useState('');
  const kind = of ? system.records?.[of] : undefined;
  const sample = useMemo<Sheet>(() => ({
    id: 'образец', systemId: system.id ?? '', name: kind?.label ?? 'Образец листа',
    ...(of ? { of } : {}), values: {}, has: [], effects: [],
  }), [system.id, of, kind?.label]);
  const reader = useReader(system, sample, compendium);
  const only = kind?.blocks?.length ? fieldsOf(system).filter(shownOn(system, sample)).map(f => f.tag) : undefined;

  return (
    <>
      {kinds.length ? (
        <Card>
          <Field label="Тип листа">
            <Select
              value={of}
              options={[['', 'все блоки'], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
              onChange={setOf}
            />
          </Field>
        </Card>
      ) : null}
      <SheetView
        system={system}
        sheet={sample}
        reader={reader}
        only={only}
        badge="образец"
        {...(onPick ? { onPick } : {})}
        picked={picked ?? null}
        onChange={(tag, value) => editSystem(draft => setSample(draft, tag, value))}
      />
    </>
  );
}
