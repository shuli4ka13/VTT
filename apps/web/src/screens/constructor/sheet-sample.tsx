import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, Field, Select } from '../../ui/primitives.tsx';
import { sheetKinds, shownOn } from '@vtt/engine/model/owned';
import { pageOfBlock, PAGE_LISTS } from '@vtt/engine/model/pages';
import { SHEET_LISTS } from '@vtt/engine/words/glossary';
import { OPEN_PAGE } from './page-panel.tsx';
import type { PageList } from '@vtt/schema';
import type { Sheet, StoredValue, System } from '@vtt/schema';
import { fieldsOf, fieldOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';

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
    const { default: _old, ...rest } = row.view?.[mark.column] ?? {};
    const own = (table.columns ?? []).find(c => c.key === mark.column);
    const base = own?.default ?? ZERO[own?.kind ?? 'number'];
    const next = blank || value === base ? rest : { ...rest, default: value };
    const views = { ...row.view };
    if (Object.keys(next).length) views[mark.column] = next; else delete views[mark.column];
    if (Object.keys(views).length) row.view = views; else delete row.view;
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
  const pick = useWorld(s => s.pick);
  const activePage = useWorld(s => s.activePage);
  const activeBlock = useWorld(s => s.activeBlock);
  const kinds = sheetKinds(system);
  const [of, setOf] = useState('');
  const kind = of ? system.sheets?.[of] : undefined;
  const sample = useMemo<Sheet>(() => ({
    id: 'образец', systemId: system.id ?? '', name: kind?.label ?? 'Образец листа',
    ...(of ? { of } : {}), values: {}, has: [], effects: [],
  }), [system.id, of, kind?.label]);
  const reader = useReader(system, sample, compendium);
  const only = kind?.blocks?.length ? fieldsOf(system).filter(shownOn(system, sample)).map(f => f.tag) : undefined;

  const at = (activeBlock ? pageOfBlock(system, activeBlock) : undefined) ?? activePage;
  const lists = Object.fromEntries(PAGE_LISTS.map(list => [list, (
    <Card><span className="faint">здесь будет: {SHEET_LISTS[list]}</span></Card>
  )])) as Partial<Record<PageList, ReactNode>>;

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
        pages={{ at: at ?? null, onAt: name => pick({ ...OPEN_PAGE, activePage: name }), lists }}
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
