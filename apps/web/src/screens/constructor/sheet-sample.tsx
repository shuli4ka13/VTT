import { useMemo, useState } from 'react';
import type { CellValue } from '@vtt/schema';
import type { ReactNode } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import { useReader } from '../../engine/use-calc.ts';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Card, Chip, Field, Select, Button, Fold } from '../../ui/primitives.tsx';
import { recordDetails } from '../../sheet/record-view.tsx';
import { ThingsList, ThingLine } from '../../sheet/things-list.tsx';
import { sheetKinds, shownOn, recordKinds, recordKindOf, availableActions, pageOfBlock, placeBlock, setWidth, setHeight, SHEET_LISTS, dice, fieldsOf, fieldOf, listOf, optionsOf, freshSheet } from '@vtt/engine';
import { OPEN_PAGE } from './page-panel.tsx';
import type { SheetList } from '@vtt/schema';
import type { Sheet, StoredValue, System, CompendiumRecord, Column } from '@vtt/schema';
import { useT, t } from '../../i18n/author.ts';

const DICE = [[1, 4], [1, 6], [1, 8], [1, 10], [1, 12], [2, 6]].map(([count, sides]) => dice(count, sides!));

const anyOf = <T,>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

export function sampleCells(system: System, columns: readonly Column[]): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const column of columns) {
    const kind = column.kind ?? 'text';
    if (kind === 'number') {
      const low = typeof column.min === 'number' ? column.min : 1;
      const high = typeof column.max === 'number' ? column.max : Math.max(low, 10);
      out[column.key] = low + Math.floor(Math.random() * (high - low + 1));
    } else if (kind === 'boolean') out[column.key] = Math.random() < 0.5;
    else if (kind === 'dice') out[column.key] = anyOf(DICE) ?? null;
    else if (kind === 'choice') {
      const pick = anyOf(listOf(system, column.from) ?? []);
      if (pick) out[column.key] = column.many ? [pick.value] : pick.value;
    }
  }
  return out;
}

export function sampleValues(system: System): Record<string, StoredValue> {
  const out: Record<string, StoredValue> = {};
  for (const field of fieldsOf(system)) {
    const value = field.value;
    if (value.kind !== 'stored' || value.type !== 'choice') continue;
    const start = value.default;
    if (start !== undefined && start !== '' && !(Array.isArray(start) && !start.length)) continue;
    const first = optionsOf(system, field)[0];
    if (first) out[field.tag] = (value.many ? [first.value] : first.value) as StoredValue;
  }
  return out;
}

const noValue = (value: unknown): boolean => value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);

export function setSample(draft: System, tag: string, value: StoredValue, base?: unknown): void {
  const field = fieldOf(draft, tag);
  if (!field || field.value.kind !== 'stored') return;
  const sample = { ...(draft.sample ?? {}) };
  if (noValue(value) || JSON.stringify(value) === JSON.stringify(base)) delete sample[tag]; else sample[tag] = value;
  if (Object.keys(sample).length) draft.sample = sample; else delete draft.sample;
}

export function sampleBase(system: System, of: string): Record<string, StoredValue> {
  return { ...sampleValues(system), ...freshSheet(system, { id: 'sample', name: t('sheetTab:sample.name'), ...(of ? { of } : {}) }).values };
}

export function SheetSample({ system, picked, onPick, onPickBlock, onPickRow }: {
  system: System; picked?: string | null; onPick?: (tag: string, block?: string) => void;
  onPickBlock?: (name: string) => void; onPickRow?: (table: string, row: string) => void;
}) {
  const t = useT('sheetTab');
  const compendium = useBook();
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const activePage = useWorld(s => s.activePage);
  const activeBlock = useWorld(s => s.activeBlock);
  const kinds = sheetKinds(system);
  const [of, setOf] = useState('');
  const [bag, setBag] = useState<{ table: string; label?: string; cells: Record<string, CellValue> }[]>([]);
  const kind = of ? system.sheets?.[of] : undefined;
  const bookKinds = recordKinds(system);
  const samples = useMemo<CompendiumRecord[]>(() => bag
    .filter(item => system.tables?.[item.table])
    .map((item, at) => ({ id: `sample-${at + 1}`, table: item.table, label: item.label || `${system.tables![item.table]!.label || item.table} ${at + 1}`, cells: item.cells })), [bag, system.tables]);
  const change = (at: number, next: (item: (typeof bag)[number]) => (typeof bag)[number]) => setBag(bag.map((item, other) => (other === at ? next(item) : item)));
  const book = useMemo(() => ({ ...compendium, records: [...(compendium.records ?? []), ...samples] }), [compendium, samples]);
  const base = useMemo(() => sampleBase(system, of), [system, of]);
  const sample = useMemo<Sheet>(() => ({
    id: 'sample', systemId: system.id ?? '', name: kind?.label ?? t('sample.name'),
    ...(of ? { of } : {}), values: { ...base, ...(system.sample ?? {}) }, has: samples.map(record => ({ of: record.id })), effects: [],
  }), [system, of, kind?.label, samples, base, t]);
  const reader = useReader(system, sample, book);
  const everyField = fieldsOf(system);
  const placed = everyField.filter(f => f.placements?.length);
  const service = everyField.filter(f => !f.placements?.length);
  const visible = shownOn(system, sample);
  const only = placed.filter(f => !kind?.blocks?.length || visible(f)).map(f => f.tag);

  const at = (activeBlock ? pageOfBlock(system, activeBlock) : undefined) ?? activePage;
  const actions = (() => { try { return availableActions(sample, { system, compendium: book }); } catch { return []; } })();
  const lists: Partial<Record<SheetList, ReactNode>> = {
    things: (
      <>
        <div className="inline inline--tight">
          {samples.length === 0 ? <span className="faint">{t('sample.nothing')}</span> : null}
        </div>
        <ThingsList system={system} kinds={(system.blocks ?? []).find(block => block.list === 'things')?.kinds} records={samples} onPickKind={table => pick({ ...OPEN_PAGE, activeThing: table })} row={record => {
          const at = samples.indexOf(record);
          return (
            <ThingLine label={record.label ?? record.id} details={recordDetails(record, system, book).map(line => `${line.label}: ${line.value}`).join(' · ')}
              actions={<>
                <Button size="sm" variant="ghost" onClick={() => change(at, item => ({ ...item, cells: sampleCells(system, recordKindOf(system, item.table)?.columns ?? []) }))}>{t('sample.otherValues')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setBag(bag.filter((_, other) => other !== at))}>{t('common:removeLower')}</Button>
              </>} />
          );
        }} />
        <Select<string> label={t('sample.add')} value=""
          options={[['', bookKinds.length ? t('sample.addOption') : t('sample.noKinds')], ...bookKinds
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
          ? <span className="faint">{t('sample.nothingToApply', { name: SHEET_LISTS.things })}</span>
          : <div className="inline inline--tight">{actions.map(action => <Chip key={action.id}>{action.label}</Chip>)}</div>}
      </>
    ),
    hanging: <span className="faint">{t('sample.nothingHangs')}</span>,
  };

  return (
    <>
      {kinds.length ? (
        <Card>
          <Field label={t('sample.sheetKind')}>
            <Select
              value={of}
              options={[['', t('sample.allBlocks')], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
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
        badge={t('sample.badge')}
        marks
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
          editSystem(draft => setSample(draft, tag, value, base[tag]));
        }}
      />
      <span className="faint">{t('sample.note')}</span>
      {service.length ? (
        <Fold title={t('sample.service')} count={service.length}>
          <div className="inline inline--tight">{service.map(f => <Chip key={f.tag}>{f.label || f.tag}</Chip>)}</div>
        </Fold>
      ) : null}
    </>
  );
}
