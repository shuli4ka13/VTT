import { useState } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import type { System, Effect, Param, Binding, SlotRef } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { tableOf } from '@vtt/engine/model/buttons';
import { paramsOf } from '@vtt/engine/model/inherit';
import { listOf } from '@vtt/engine/model/lists';
import { Card, Field, Select, LabelInput, Button, DangerButton } from '../../ui/primitives.tsx';
import { asDice } from '@vtt/engine/words/glossary';
import { ValueField, asText } from './value-field.tsx';
import { grouped as byRole } from './effects/roles.ts';
import { kindWords } from './effects/params-editor.tsx';

const EMPTY = '';
const FORMULA = '=';
const NEW = '+';
const OWN = 'Своё у каждой записи';
const SAME = 'Одно на всех';
const ROWS = 'Одно на всех — строка';

type Fill = 'actor' | 'targets';

export function ButtonEditor({ binding, system, recordKind, kindId, onEdit, onDelete, onFillWithProp }: {
  binding: Binding;
  system: System;

  recordKind: RecordKind;
  kindId?: string;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;

  onFillWithProp?: (param: Param) => void;
}) {
  const effect = system.effects[binding.effect];
  const params = effect ? paramsOf(system, effect) : [];
  const buttons = Object.entries(system.effects).filter(([, e]) => (e.activation ?? 'manual') !== 'passive');
  const where = binding.label || effect?.label || binding.effect;

  const onArg = (key: string, next: SlotRef | null) => onEdit(draft => {
    draft.args ??= {};
    if (next) draft.args[key] = next as never; else delete draft.args[key];
    if (!Object.keys(draft.args).length) delete draft.args;
  });

  const onSheet = (key: string, fill: Fill | '') => onEdit(draft => {
    const table: Record<string, Fill> = { ...tableOf(draft, { params }) };
    if (fill) table[key] = fill; else delete table[key];
    const guessed = tableOf({}, { params });
    const same = Object.keys(table).length === Object.keys(guessed).length
      && Object.entries(table).every(([at, value]) => guessed[at] === value);
    if (same) delete draft.table; else draft.table = table;
  });

  return (
    <Card tone="flat">
      <div className="button-head">
        <Field label="Кнопка на листе">
          <LabelInput value={binding.label ?? ''} placeholder="как назвать кнопку" onCommit={label => onEdit(draft => { draft.label = label; })} />
        </Field>
        <Field label="Вызывает эффект" needed={!effect}>
          <Select
            value={binding.effect ?? ''}
            options={[['', '— какой эффект —'], ...byRole(system, buttons).map(([id, e, group]) => [id, e.label || id, group] as const)] as never}
            onChange={next => onEdit(draft => {
              draft.effect = next;
              if (!draft.label?.trim() && system.effects[next]) draft.label = system.effects[next]!.label || next;
            })}
          />
        </Field>
        <div className="button-head__actions">
          {effect ? (
            <Button size="sm" variant="ghost" title="открыть эффект"
              onClick={() => useWorld.getState().pick({ activeTab: 'effects', activeEffectId: binding.effect, activeStepIndex: null })}>
              как устроен →
            </Button>
          ) : null}
          <DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>
        </div>
      </div>
      {effect ? (params.length ? (
        <div className="args-table">
          <div className="args-table__head" aria-hidden><span>Вход</span><span>Что это</span><span>Чем заполнить</span></div>
          {params.map(param => (
            <ArgRow
              key={param.key}
              param={param}
              binding={binding}
              params={params}
              system={system}
              recordKind={recordKind}
              effectId={binding.effect}
              {...(kindId ? { kindId } : {})}
              effect={effect}
              where={where}
              onArg={next => onArg(param.key, next)}
              onSheet={fill => onSheet(param.key, fill)}
              {...(onFillWithProp ? { onNew: () => onFillWithProp(param) } : {})}
            />
          ))}
        </div>
      ) : <span className="faint">«{effect.label || binding.effect}» ничего не принимает.</span>) : null}
    </Card>
  );
}

interface Source { key: string; label: string; group: string }

const FITS: Record<string, string[]> = {
  number: ['number'],
  dice: ['dice'],
  text: ['text'],
  effect: ['effect'],
  record: ['record'],
};

function sourcesOf(param: Param, kind: RecordKind, system: System, effectId: string): Source[] {
  const props = kind.columns ?? [];
  const want = String(param.kind ?? 'number');
  const fits = (prop: (typeof props)[number]) => prop.key === param.key || (want === 'choice'
    ? prop.kind === 'choice' && prop.from === param.from
    : (FITS[want] ?? []).includes(String(prop.kind ?? 'number')));
  const own = props.filter(fits).map(prop => ({ key: `@${prop.key}`, label: `свойство «${prop.label ?? prop.key}»`, group: OWN }));
  const via = want !== 'number' ? [] : props
    .filter(prop => prop.kind === 'choice' && prop.from && system.tables?.[prop.from]?.columns?.length)
    .flatMap(prop => (system.tables![prop.from!]!.columns ?? [])
      .filter(column => String(column.kind ?? 'number') === 'number')
      .map(column => ({ key: `@${prop.key}.${column.key}`, label: `${prop.label ?? prop.key} · ${column.label || column.key}`, group: OWN })));
  const rows = want === 'choice' && param.from
    ? (listOf(system, param.from) ?? []).map(row => ({ key: JSON.stringify(row.value), label: row.label, group: `${ROWS} «${system.tables?.[param.from!]?.label || param.from}»` }))
    : [];
  const effects = want === 'effect'
    ? byRole(system, Object.entries(system.effects).filter(([id]) => id !== effectId))
      .map(([id, e, group]) => ({ key: JSON.stringify(id), label: e.label || id, group }))
    : [];
  return [...own, ...via, ...rows, ...effects];
}

function emptyWords(param: Param, system: System): string {
  if (param.default !== undefined) {
    const value = param.default;
    const shown = value === true ? 'да' : value === false ? 'нет'
      : typeof value === 'string' && system.effects[value] ? system.effects[value]!.label || value : String(value);
    return `как у эффекта: ${shown}`;
  }
  if (param.ask) return param.ask.by === 'gm' ? 'спросят ведущего' : 'спросят игрока';
  if (param.optional) return 'не передаётся';
  return '— не заполнено —';
}

const loose = (param: Param) => param as Param & { optional?: boolean };

function ArgRow({ param, binding, params, system, recordKind, kindId, effectId, effect, where, onArg, onSheet, onNew }: {
  param: Param;
  kindId?: string;
  binding: Binding;
  params: Param[];
  system: System;
  recordKind: RecordKind;
  effectId: string;
  effect: Effect;
  where: string;
  onArg: (next: SlotRef | null) => void;
  onSheet: (fill: Fill | '') => void;
  onNew?: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const name = param.label ?? param.key;
  const kind = String(param.kind ?? 'number');
  const free = Boolean(loose(param).optional) || param.default !== undefined || Boolean(param.ask);

  if (kind === 'sheet') {
    const fill = tableOf(binding, { params })[param.key] ?? '';
    return (
      <div className={`args-row${!fill && !loose(param).optional ? ' args-row--need' : ''}`}>
        <span className="args-row__name">{name}</span>
        <KindCell param={param} system={system} />
        <div className="args-row__fill">
          <Select<string>
            label={`«${name}» — чем заполняет тип`}
            value={fill}
            options={[['actor', 'кто нажал кнопку'], ['targets', 'цели, выбранные за столом'], ['', loose(param).optional ? 'не передаётся' : '— не заполнено —']]}
            onChange={next => onSheet(next as Fill | '')}
          />
        </div>
      </div>
    );
  }

  const sources = sourcesOf(param, recordKind, system, effectId);
  const byName = (recordKind.columns ?? []).some(prop => prop.key === param.key);
  const arg = binding.args?.[param.key] as unknown;
  const text = asText(arg)?.trim() ?? '';
  const matched = arg === undefined || arg === null
    ? (byName ? `@${param.key}` : EMPTY)
    : sources.some(source => source.key === text) ? text : FORMULA;
  const value = typing ? FORMULA : matched;
  const need = value === EMPTY && !free;

  const options: (readonly [string, string] | readonly [string, string, string])[] = [
    ...(byName ? [] : [[EMPTY, emptyWords(param, system)] as const]),
    ...sources.filter(source => source.group === OWN).map(source => [source.key, source.label, source.group] as const),
    ...(onNew && !byName ? [[NEW, `+ новое свойство «${name}»`, OWN] as const] : []),
    ...sources.filter(source => source.group.startsWith(ROWS)).map(source => [source.key, source.label, source.group] as const),
    [FORMULA, 'формула…', SAME] as const,
    ...sources.filter(source => source.group !== OWN && !source.group.startsWith(ROWS)).map(source => [source.key, source.label, source.group] as const),
  ];

  const pick = (next: string) => {
    if (next === FORMULA) { setTyping(true); return; }
    setTyping(false);
    if (next === NEW) { onNew?.(); return; }
    if (next === EMPTY || (byName && next === `@${param.key}`)) { onArg(null); return; }
    onArg({ expr: next });
  };

  return (
    <div className={`args-row${need ? ' args-row--need' : ''}`}>
      <span className="args-row__name">{name}</span>
      <KindCell param={param} system={system} />
      <div className="args-row__fill">
        <Select<string> label={`«${name}» — чем заполняет тип`} value={value} options={options} onChange={pick} />
        {value.startsWith('@') && kindId ? <Examples system={system} kind={recordKind} kindId={kindId} prop={value.slice(1).split('.')[0]!} /> : null}
        {value === FORMULA ? (
          <ValueField
            where={`${where} · ${name}`}
            value={arg as never}
            context={{ system, effect, earlier: [], recordKind }}
            allow={['prop', 'table']}
            dice={kind === 'dice'}
            placeholder={byName ? `пусто — свойство «${name}»` : 'число или формула — @ подскажет'}
            onChange={next => { onArg(next); if (!next) setTyping(false); }}
          />
        ) : null}
      </div>
    </div>
  );
}

function KindCell({ param, system }: { param: Param; system: System }) {
  const table = param.kind === 'choice' && param.from ? param.from : null;
  if (!table) return <span className="args-row__kind">{kindWords(param, system)}</span>;
  return (
    <span className="args-row__kind">
      {param.many ? 'строки таблицы' : 'строка таблицы'}{' '}
      <button type="button" className="link-button" title="открыть таблицу"
        onClick={() => useWorld.getState().pick({ activeTab: 'dictionaries', activeTableId: table })}>
        «{system.tables?.[table]?.label || table}»
      </button>
    </span>
  );
}

const SHOWN = 3;

function cellWords(system: System, column: { kind?: string; from?: string }, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.map(one => cellWords(system, column, one)).join(', ');
  if (typeof value === 'object') return String((value as { expr?: unknown }).expr ?? '');
  if (column.kind === 'dice') return asDice(String(value));
  if (column.kind === 'choice' && column.from) return listOf(system, column.from)?.find(row => row.value === value)?.label ?? String(value);
  return String(value);
}

function Examples({ system, kind, kindId, prop }: { system: System; kind: RecordKind; kindId: string; prop: string }) {
  const book = useBook();
  const column = (kind.columns ?? []).find(one => one.key === prop);
  if (!column) return null;
  const records = (book.records ?? []).filter(record => record.table === kindId);
  if (!records.length) return null;
  const shown = records.slice(0, SHOWN).map(record => `${record.label || record.id} ${cellWords(system, column, record.cells?.[prop])}`);
  const rest = records.length - SHOWN;
  return <span className="args-row__eg">в книге: {shown.join(' · ')}{rest > 0 ? ` · ещё ${rest}` : ''}</span>;
}

export function namesOf(kind: RecordKind, system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const prop of kind.columns ?? []) {
    const label = prop.label ?? prop.key;
    out.set(prop.key, label);
    const table = prop.kind === 'choice' && prop.from ? system.tables?.[prop.from] : undefined;
    for (const column of table?.columns ?? []) out.set(`${prop.key}.${column.key}`, `${label} · ${column.label || column.key}`);
  }
  return out;
}
