import { useMemo, useState } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, Field, Select } from '../../ui/primitives.tsx';
import { sheetKinds, shownOn } from '@vtt/engine/model/owned';
import type { Sheet, StoredValue, System } from '@vtt/schema';
import { fieldsOf, fieldOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';
import { setRowView } from './row-view.ts';

const ZERO: Record<string, unknown> = { number: 0, text: '', boolean: false, choice: '' };

export function setSample(draft: System, tag: string, value: StoredValue): void {
  const field = fieldOf(draft, tag);
  const table = field ? draft.tables?.[field.home] : undefined;
  if (!field || !table || field.value.kind !== 'stored' || value === null) return;
  const blank = value === '' || (Array.isArray(value) && !value.length);
  if (field.cell) {
    const mark = field.cell;
    const row = (table.rows ?? []).find(r => rowKeyOf(r) === mark.row);
    if (!row) return;
    const own = (table.columns ?? []).find(c => c.key === mark.column);
    setRowView(row, mark.column, 'default', blank ? undefined : value, own?.default ?? ZERO[own?.kind ?? 'number']);
    return;
  }
  const column = (table.columns ?? []).find(c => c.key === tag);
  if (!column) return;
  if (blank || value === ZERO[column.kind ?? 'number']) delete column.default; else column.default = value;
}

export function SheetSample({ system, picked, onPick, onPickBlock, onPickRow }: {
  system: System; picked?: string | null; onPick?: (tag: string, block?: string) => void;
  onPickBlock?: (name: string) => void; onPickRow?: (table: string, row: string) => void;
}) {
  const compendium = useBook();
  const editSystem = useWorld(s => s.editSystem);
  const kinds = sheetKinds(system);
  const [of, setOf] = useState('');
  const kind = of ? system.sheets?.[of] : undefined;
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
        {...(onPickBlock ? { onPickBlock } : {})}
        {...(onPickRow ? { onPickRow } : {})}
        picked={picked ?? null}
        onChange={(tag, value) => {
          const now = reader.valueOf(tag);
          if (now.ok && now.value === value) return;
          editSystem(draft => setSample(draft, tag, value));
        }}
      />
    </>
  );
}
