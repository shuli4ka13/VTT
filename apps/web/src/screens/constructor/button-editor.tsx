import { useWorld, useBook } from '../../store/world.ts';
import type { System, Effect, Param, Binding, SlotRef } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { tableOf } from '@vtt/engine/model/buttons';
import { paramsOf } from '@vtt/engine/model/inherit';
import { listOf } from '@vtt/engine/model/lists';
import { Card, Field, Select, LabelInput, Button, DangerButton } from '../../ui/primitives.tsx';
import { asDice } from '@vtt/engine/words/glossary';
import { ValueField, asText, type SlotOption } from './value-field.tsx';
import { paymentsOf } from '@vtt/engine/model/payments';
import { grouped as byRole } from './effects/roles.ts';
import { kindWords } from './effects/params-editor.tsx';

const EMPTY = '';
const OWN = 'Своё у каждой записи';

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

function effectSources(param: Param, kind: RecordKind, system: System, effectId: string): Source[] {
  const own = (kind.columns ?? [])
    .filter(prop => prop.key === param.key || prop.kind === 'effect')
    .map(prop => ({ key: `@${prop.key}`, label: `свойство «${prop.label ?? prop.key}»`, group: OWN }));
  const effects = byRole(system, Object.entries(system.effects).filter(([id]) => id !== effectId))
    .map(([id, e, group]) => ({ key: JSON.stringify(id), label: e.label || id, group }));
  return [...own, ...effects];
}

function hintsOf(param: Param, system: System, effect: Effect, args: Record<string, unknown> | undefined, onNew: (() => void) | undefined): SlotOption[] {
  const fresh = onNew ? [{ group: 'Завести', label: `+ новое свойство «${param.label ?? param.key}»`, onPick: onNew }] : [];
  const rows = param.kind === 'choice' && param.from
    ? (listOf(system, param.from) ?? []).map(row => ({ group: `Строки «${system.tables?.[param.from!]?.label || param.from}»`, label: row.label, formula: JSON.stringify(row.value) }))
    : [];
  const asks = paymentsOf(system, effect, args ?? {})
    .flatMap(({ payment }) => (payment.params ?? []).filter(one => one.ask))
    .map(one => ({ group: 'Спросят при оплате', label: one.label ?? one.key, name: one.key }));
  return [...fresh, ...rows, ...asks];
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

const LONE = /^@([\p{L}\p{N}_]+)(?:\.[\p{L}\p{N}_]+)?$/u;

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

  const byName = (recordKind.columns ?? []).some(prop => prop.key === param.key);
  const arg = binding.args?.[param.key] as unknown;
  const empty = arg === undefined || arg === null;
  const text = empty ? (byName ? `@${param.key}` : '') : asText(arg)?.trim() ?? '';
  const need = !text && !free;

  if (kind === 'effect') {
    const sources = effectSources(param, recordKind, system, effectId);
    return (
      <div className={`args-row${need ? ' args-row--need' : ''}`}>
        <span className="args-row__name">{name}</span>
        <KindCell param={param} system={system} />
        <div className="args-row__fill">
          <Select<string>
            label={`«${name}» — чем заполняет тип`}
            value={text}
            options={[...(byName ? [] : [[EMPTY, emptyWords(param, system)] as const]), ...sources.map(source => [source.key, source.label, source.group] as const)]}
            onChange={next => onArg(next === EMPTY || (byName && next === `@${param.key}`) ? null : { expr: next })}
          />
        </div>
      </div>
    );
  }

  const lone = LONE.exec(text)?.[1];
  return (
    <div className={`args-row${need ? ' args-row--need' : ''}`}>
      <span className="args-row__name">{name}</span>
      <KindCell param={param} system={system} />
      <div className="args-row__fill">
        <ValueField
          where={`${where} · ${name}`}
          value={(text ? { expr: text } : undefined) as never}
          context={{ system, effect: { ...effect, params: [] }, earlier: [], recordKind, sheets: new Map(params.filter(one => one.kind === 'sheet' && !one.many).map(one => [one.key, one.label ?? one.key] as const)) }}
          allow={['prop', 'table', 'tag']}
          extraOptions={hintsOf(param, system, effect, binding.args as Record<string, unknown> | undefined, onNew && !byName ? onNew : undefined)}
          placeholder={emptyWords(param, system)}
          dice={kind === 'dice'}
          onChange={next => {
            const typed = asText(next)?.trim() ?? '';
            onArg(!next || !typed || (byName && typed === `@${param.key}`) ? null : next);
          }}
        />
        {lone && kindId && (recordKind.columns ?? []).some(prop => prop.key === lone)
          ? <Examples system={system} kind={recordKind} kindId={kindId} prop={lone} /> : null}
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
