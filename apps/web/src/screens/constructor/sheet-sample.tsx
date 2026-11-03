import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, Chip, Field, Select, Button } from '../../ui/primitives.tsx';
import { recordDetails } from '../../sheet/record-view.tsx';
import { ThingsList, ThingLine } from '../../sheet/things-list.tsx';
import { sheetKinds, shownOn, recordKinds, recordKindOf } from '@vtt/engine/model/owned';
import { availableActions } from '@vtt/engine/events/actions';
import { pageOfBlock, placeBlock, setWidth, setHeight } from '@vtt/engine/model/pages';
import { SHEET_LISTS, dice } from '@vtt/engine/words/glossary';
import { OPEN_PAGE } from './page-panel.tsx';
import type { SheetList } from '@vtt/schema';
import type { Sheet, StoredValue, System, CompendiumRecord, Column } from '@vtt/schema';
import { fieldsOf, fieldOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';
import { listOf } from '@vtt/engine/model/lists';

const ZERO: Record<string, unknown> = { number: 0, text: '', boolean: false, choice: '' };

const DICE = [[1, 4], [1, 6], [1, 8], [1, 10], [1, 12], [2, 6]].map(([count, sides]) => dice(count, sides!));

const anyOf = <T,>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

export function sampleCells(system: System, columns: readonly Column[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    const kind = column.kind ?? 'text';
    if (kind === 'number') {
      const low = typeof column.min === 'number' ? column.min : 1;
      const high = typeof column.max === 'number' ? column.max : Math.max(low, 10);
      out[column.key] = low + Math.floor(Math.random() * (high - low + 1));
    } else if (kind === 'boolean') out[column.key] = Math.random() < 0.5;
    else if (kind === 'dice') out[column.key] = anyOf(DICE);
    else if (kind === 'choice') {
      const pick = anyOf(listOf(system, column.from) ?? []);
      if (pick) out[column.key] = column.many ? [pick.value] : pick.value;
    }
  }
  return out;
}

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
  const [bag, setBag] = useState<{ table: string; label?: string; cells: Record<string, unknown> }[]>([]);
  const kind = of ? system.sheets?.[of] : undefined;
  const bookKinds = recordKinds(system);
  const samples = useMemo<CompendiumRecord[]>(() => bag
    .filter(item => system.tables?.[item.table])
    .map((item, at) => ({ id: `образец-${at + 1}`, table: item.table, label: item.label || `${system.tables![item.table]!.label || item.table} ${at + 1}`, cells: item.cells })), [bag, system.tables]);
  const change = (at: number, next: (item: (typeof bag)[number]) => (typeof bag)[number]) => setBag(bag.map((item, other) => (other === at ? next(item) : item)));
  const book = useMemo(() => ({ ...compendium, records: [...(compendium.records ?? []), ...samples] }), [compendium, samples]);
  const sample = useMemo<Sheet>(() => ({
    id: 'образец', systemId: system.id ?? '', name: kind?.label ?? 'Образец листа',
    ...(of ? { of } : {}), values: {}, has: samples.map(record => ({ of: record.id })), effects: [],
  }), [system.id, of, kind?.label, samples]);
  const reader = useReader(system, sample, book);
  const only = kind?.blocks?.length ? fieldsOf(system).filter(shownOn(system, sample)).map(f => f.tag) : undefined;

  const at = (activeBlock ? pageOfBlock(system, activeBlock) : undefined) ?? activePage;
  const actions = (() => { try { return availableActions(sample, { system, compendium: book }); } catch { return []; } })();
  const lists: Partial<Record<SheetList, ReactNode>> = {
    things: (
      <>
        <div className="inline inline--tight">
          {samples.length === 0 ? <span className="faint">У образца пока ничего нет — добавьте образец вещи или умения.</span> : null}
        </div>
        <ThingsList system={system} kinds={(system.blocks ?? []).find(block => block.list === 'things')?.kinds} records={samples} onPickKind={table => pick({ ...OPEN_PAGE, activeThing: table })} row={record => {
          const at = samples.indexOf(record);
          return (
            <ThingLine label={record.label ?? record.id} details={recordDetails(record, system, book).map(line => `${line.label}: ${line.value}`).join(' · ')}
              actions={<>
                <Button size="sm" variant="ghost" onClick={() => change(at, item => ({ ...item, cells: sampleCells(system, recordKindOf(system, item.table)?.columns ?? []) }))}>другие значения</Button>
                <Button size="sm" variant="ghost" onClick={() => setBag(bag.filter((_, other) => other !== at))}>убрать</Button>
              </>} />
          );
        }} />
        <Select<string> label="добавить образец" value=""
          options={[['', bookKinds.length ? '+ образец вещи или умения' : 'типов вещей и умений ещё нет'], ...bookKinds
            .map(([key, table]) => [key, table.label || key] as const)]}
          onChange={key => {
            if (!key) return;
            const kindOfKey = recordKindOf(system, key);
            const number = bag.filter(item => item.table === key).length + 1;
            setBag([...bag, { table: key, label: `${kindOfKey?.label || key} ${number}`, cells: sampleCells(system, kindOfKey?.columns ?? []) }]);
          }} />
      </>
    ),
    actions: (
      <>
        {actions.length === 0
          ? <span className="faint">Применить нечего — добавьте вещь или умение в «{SHEET_LISTS.things}».</span>
          : <div className="inline inline--tight">{actions.map(action => <Chip key={action.id}>{action.label}</Chip>)}</div>}
      </>
    ),
    hanging: <span className="faint">На образце ничего не висит.</span>,
  };

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
        pages={{ at: at ?? null, onAt: name => pick({ ...OPEN_PAGE, activePage: name }), all: true }}
        lists={lists}
        edit={{
          onPlace: (block, target, where) => editSystem(draft => placeBlock(draft, block, target, where)),
          onWidth: (block, width) => editSystem(draft => setWidth(draft, block, width)),
          onHeight: (block, height) => editSystem(draft => setHeight(draft, block, height)),
        }}
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
