import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, CardHead, Chip, Field, Select, Fold, LabelInput, Button } from '../../ui/primitives.tsx';
import { ValueEditor } from '../../ui/value-editor.tsx';
import { sheetKinds, shownOn, recordKinds, recordKindOf } from '@vtt/engine/model/owned';
import { availableActions } from '@vtt/engine/events/actions';
import { pageOfBlock } from '@vtt/engine/model/pages';
import { SHEET_LISTS } from '@vtt/engine/words/glossary';
import { OPEN_PAGE } from './page-panel.tsx';
import type { PageList } from '@vtt/schema';
import type { Sheet, StoredValue, System, CompendiumRecord } from '@vtt/schema';
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
  const [bag, setBag] = useState<{ table: string; label?: string; cells: Record<string, unknown> }[]>([]);
  const kind = of ? system.sheets?.[of] : undefined;
  const bookKinds = recordKinds(system);
  const samples = useMemo<CompendiumRecord[]>(() => bag
    .filter(item => system.tables?.[item.table])
    .map((item, at) => ({ id: `образец-${at + 1}`, table: item.table, label: item.label || `${system.tables![item.table]!.label || item.table} (образец)`, cells: item.cells })), [bag, system.tables]);
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
  const lists: Partial<Record<PageList, ReactNode>> = {
    things: (
      <Card>
        <CardHead title={SHEET_LISTS.things} />
        <div className="inline inline--tight">
          {samples.length === 0 ? <span className="faint">У образца пока ничего нет — добавьте образец вещи или умения.</span> : null}
        </div>
        {samples.map((record, at) => (
          <Fold key={record.id} title={record.label ?? record.id} open={at === samples.length - 1 && !Object.keys(record.cells ?? {}).length}>
            <div className="stack stack--tight">
              <Field label="Название">
                <LabelInput value={bag[at]!.label ?? ''} placeholder={record.label ?? ''}
                  onCommit={label => change(at, item => ({ ...item, label: label.trim() || undefined }))} />
              </Field>
              <div className="row">
                {(recordKindOf(system, record.table)?.columns ?? []).map(prop => (
                  <Field key={prop.key} label={prop.label ?? prop.key}>
                    <ValueEditor type={prop} value={record.cells?.[prop.key]} system={system} compendium={book} onlyWorn except={record.id}
                      onChange={next => change(at, item => {
                        const cells = { ...item.cells };
                        if (next === undefined || next === '' || (Array.isArray(next) && !next.length)) delete cells[prop.key]; else cells[prop.key] = next;
                        return { ...item, cells };
                      })} />
                  </Field>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setBag(bag.filter((_, other) => other !== at))}>убрать из сумки</Button>
            </div>
          </Fold>
        ))}
        <Select<string> label="добавить образец" value=""
          options={[['', bookKinds.length ? '+ образец вещи или умения' : 'типов вещей и умений ещё нет'], ...bookKinds
            .map(([key, table]) => [key, table.label || key] as const)]}
          onChange={key => { if (key) setBag([...bag, { table: key, cells: {} }]); }} />
      </Card>
    ),
    actions: (
      <Card>
        <CardHead title={SHEET_LISTS.actions} />
        {actions.length === 0
          ? <span className="faint">Применить нечего — добавьте вещь или умение в «{SHEET_LISTS.things}».</span>
          : <div className="inline inline--tight">{actions.map(action => <Chip key={action.id}>{action.label}</Chip>)}</div>}
      </Card>
    ),
    hanging: (
      <Card>
        <CardHead title={SHEET_LISTS.hanging} />
        <span className="faint">На образце ничего не висит.</span>
      </Card>
    ),
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
        pages={{ at: at ?? null, onAt: name => pick({ ...OPEN_PAGE, activePage: name }), lists, all: true }}
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
