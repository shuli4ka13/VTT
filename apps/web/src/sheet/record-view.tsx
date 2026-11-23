import { findRecord, recordKindOf, propsOf, entryKeyOf as keyOf, isFormulaCell, itemExpr, ITEM_NAME, compile, listOf, fieldOf } from '@vtt/engine';
import { Card, Chip } from '../ui/primitives.tsx';
import { asDice } from '../words.ts';
import { formulaWords } from '../ui/formula-words.ts';
import type { Computed } from '../engine/use-calc.ts';
import type { CompendiumRecord, Compendium, System, Owned } from '@vtt/schema';

export interface RecordLine { label: string; value: string }

function labelsOf(system: System, from: string | undefined, value: unknown): string {
  const options = listOf(system, from) ?? [];
  const one = (key: unknown) => options.find(option => String(option.value) === String(key))?.label ?? String(key);
  return Array.isArray(value) ? value.map(one).join(', ') : one(value);
}

const recordLabel = (compendium: Compendium | undefined, id: string): string => {
  const found = findRecord(compendium, id);
  return found?.label ?? id;
};

const alone = (expr: string): Computed => {
  try { return { ok: true, value: compile(expr).evaluate(name => { throw new Error(`нет листа для «${name}»`); }) }; }
  catch (err) { return { ok: false, error: (err as Error).message }; }
};

const counted = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean' || (typeof value === 'string' && value !== '');

function columnNames(columns: readonly { key: string; label?: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const column of columns) {
    out.set(column.key, column.label || column.key);
    out.set(`${ITEM_NAME}.${column.key}`, column.label || column.key);
  }
  return out;
}

export function recordDetails(record: CompendiumRecord, system: System, compendium?: Compendium, at?: {
  entry?: Owned;
  count?: (expr: string) => Computed;
}): RecordLine[] {
  const kind = recordKindOf(system, record.table);
  const columns = kind?.columns ?? [];
  const entry = at?.entry;
  const cells = propsOf(record, system, entry) ?? {};
  const shown = (key: string) => {
    const own = entry?.values?.[key];
    return own !== undefined ? own : record.cells?.[key];
  };
  const word = (prop: (typeof columns)[number], value: unknown): string => {
    const kindOf = String(prop.kind ?? 'number');
    if (typeof value === 'boolean') return value ? 'да' : 'нет';
    if (Array.isArray(value)) return value.map(one => word(prop, one)).join(', ');
    const raw = String(value);
    return kindOf === 'dice' ? asDice(raw)
      : kindOf === 'effect' ? (system.effects[raw]?.label ?? raw)
        : kindOf === 'field' ? (fieldOf(system, raw)?.label ?? raw)
        : kindOf === 'record' ? recordLabel(compendium, raw)
          : kindOf === 'choice' ? labelsOf(system, prop.from, value)
            : raw;
  };
  return columns
    .filter(prop => prop.onSheet !== false)
    .filter(prop => shown(prop.key) !== undefined && shown(prop.key) !== '')
    .map(prop => {
      const value = shown(prop.key);
      if (!isFormulaCell(value)) return { label: prop.label ?? prop.key, value: word(prop, value) };
      let result: Computed;
      try { result = (at?.count ?? alone)(itemExpr(system, record.table!, cells, prop.key, entry ? keyOf(entry) : undefined)); }
      catch (err) { result = { ok: false, error: (err as Error).message }; }
      return {
        label: prop.label ?? prop.key,
        value: result.ok && counted(result.value) ? word(prop, result.value) : formulaWords(system, value.expr, columnNames(columns)),
      };
    });
}

export function recordButtons(record: CompendiumRecord, system: System): string[] {
  const kind = recordKindOf(system, record.table);
  const bindings = record.bindings?.length ? record.bindings : (kind?.bindings ?? []);
  return bindings.map(b => b.label ?? system.effects[b.effect]?.label ?? 'Применение');
}

export function RecordView({ record, system, compendium }: {
  record: CompendiumRecord;
  system: System;
  compendium?: Compendium;
}) {
  const details = recordDetails(record, system, compendium);
  const buttons = recordButtons(record, system);
  const kind = recordKindOf(system, record.table);

  return (
    <Card tone="flat">
      <div className="record-view">
        <div className="record-view__head">
          <span className="record-view__name">{record.label ?? record.id}</span>
          {kind ? <Chip>{kind.label ?? String(record.table)}</Chip> : null}
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

export function groupsByKind<T extends CompendiumRecord>(system: System, records: readonly T[]): { table: string; title: string; records: T[] }[] {
  const out = new Map<string, T[]>();
  for (const record of records) out.set(record.table ?? '', [...(out.get(record.table ?? '') ?? []), record]);
  return [...out].map(([table, list]) => ({ table, title: recordKindOf(system, table)?.label || table || '—', records: list }));
}
