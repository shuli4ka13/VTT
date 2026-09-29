import { useMemo, useState } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, Field, Select } from '../../ui/primitives.tsx';
import { sheetKinds, shownOn } from '@vtt/engine/model/owned';
import type { Sheet, StoredValue, System } from '@vtt/schema';

export function setSample(draft: System, tag: string, value: StoredValue): void {
  const field = draft.fields.find(f => f.tag === tag);
  if (!field) return;
  const mark = field.cell;
  if (mark) {
    const view = draft.tables?.[mark.table]?.sheet;
    if (!view) return;
    const key = `${mark.row}.${mark.column}`;
    view.cells = { ...view.cells, [key]: { ...view.cells?.[key], start: value as string | number | boolean } };
    return;
  }
  if (field.value.kind === 'stored') field.value.default = value as string | number | boolean;
}

export function SheetSample({ system }: { system: System }) {
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
  const only = kind?.blocks?.length ? system.fields.filter(shownOn(system, sample)).map(f => f.tag) : undefined;

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
        onChange={(tag, value) => editSystem(draft => setSample(draft, tag, value))}
      />
    </>
  );
}
