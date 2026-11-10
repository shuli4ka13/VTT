import { useMemo, useState } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import type { System, Effect, Param, Binding, SlotRef } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { isUnder, propsOf as propsOfRecord } from '@vtt/engine/model/owned';
import { paramsOf, typeColumns } from '@vtt/engine/model/inherit';
import { columnChoices, type ColumnChoice } from '@vtt/engine/model/paths';
import { ITEM_NAME } from '@vtt/engine/model/item-ref';
import { listOf } from '@vtt/engine/model/lists';
import { Card, Field, Select, LabelInput, Button, DangerButton } from '../../ui/primitives.tsx';
import { asDice } from '@vtt/engine/words/glossary';
import { ValueField, asText, type SlotOption } from './value-field.tsx';
import { paymentsOf } from '@vtt/engine/model/payments';
import { grouped as byRole } from './effects/roles.ts';
import { kindWords } from './effects/params-editor.tsx';
import { ConditionField } from './condition-field.tsx';
import { shapeProblem, shapeOfKind, type Shape } from './formula-shape.ts';

const EMPTY = '';
const NEW = '+';
const OWN = 'Своё у каждой записи';

export function ButtonEditor({ binding, system, recordKind: ownKind, kindId, onEdit, onDelete, onFillWithProps }: {
  binding: Binding;
  system: System;

  recordKind: RecordKind;
  kindId?: string;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;

  onFillWithProps?: (params: Param[]) => void;
}) {
  const recordKind = useMemo(() => (kindId ? { ...ownKind, columns: typeColumns(system, kindId) } : ownKind), [system, ownKind, kindId]);
  const props = useMemo(() => propsOf(system, kindId), [system, kindId]);
  const propNames = useMemo(() => new Map([[ITEM_NAME, 'эта вещь'], ...[...props].map(([key, one]) => [key, one.label] as const)]), [props]);
  const effect = system.effects[binding.effect];
  const params = effect ? paramsOf(system, effect) : [];
  const buttons = Object.entries(system.effects).filter(([, e]) => (e.activation ?? 'manual') !== 'passive');
  const where = binding.label || effect?.label || binding.effect;
  const [more, setMore] = useState(false);
  const given = (param: Param): boolean => binding.args?.[param.key] !== undefined && binding.args?.[param.key] !== null;
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(params.filter(given).map(param => param.key)));
  const inputs = params.filter(param => param.kind !== 'sheet');
  const shown = inputs.filter(param => !freeParam(param) || given(param) || opened.has(param.key));
  const spare = inputs.filter(param => !shown.includes(param));

  const onArg = (key: string, next: SlotRef | null) => onEdit(draft => {
    draft.args ??= {};
    if (next) draft.args[key] = next as never; else delete draft.args[key];
    if (!Object.keys(draft.args).length) delete draft.args;
  });


  return (
    <Card tone="flat" label={`кнопка «${where}»`}>
      <div className="button-head">
        <Field label="Кнопка на листе">
          <LabelInput value={binding.label ?? ''} placeholder="как назвать кнопку" onCommit={label => onEdit(draft => { draft.label = label; })} />
        </Field>
        <Field label="Вызывает эффект" needed={!effect}>
          <Select
            value={binding.effect ?? ''}
            options={[['', '— какой эффект —'], ...byRole(system, buttons).map(([id, e, group]) => [id, e.label || id, group] as const)] as never}
            onChange={next => {
              const chosen = system.effects[next];
              const columns = new Set((recordKind.columns ?? []).map(prop => prop.key));
              onEdit(draft => {
                draft.effect = next;
                if (!draft.label?.trim() && system.effects[next]) draft.label = system.effects[next]!.label || next;
                if (!chosen) return;
                const kept: Record<string, unknown> = {};
                for (const param of paramsOf(system, chosen)) {
                  if (param.kind === 'sheet') continue;
                  const given = draft.args?.[param.key];
                  if (given !== undefined) kept[param.key] = given;
                  else if (columns.has(param.key)) kept[param.key] = { expr: `@${param.key}` };
                }
                if (Object.keys(kept).length) draft.args = kept as never; else delete draft.args;
              });
              const missing = chosen ? paramsOf(system, chosen)
                .filter(param => param.kind !== 'sheet' && !freeParam(param) && !columns.has(param.key) && binding.args?.[param.key] === undefined) : [];
              if (missing.length) onFillWithProps?.(missing);
            }}
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
      {effect ? (shown.length ? (
        <div className="args-table">
          <div className="args-table__head" aria-hidden><span>Вход</span><span>Что это</span><span>Чем заполнить</span></div>
          {shown.map(param => (
            <ArgRow
              key={param.key}
              param={param}
              binding={binding}
              params={params}
              system={system}
              recordKind={recordKind}
              props={props}
              propNames={propNames}
              effectId={binding.effect}
              {...(kindId ? { kindId } : {})}
              effect={effect}
              where={where}
              onArg={next => onArg(param.key, next)}
              {...(onFillWithProps ? { onNew: () => onFillWithProps([param]) } : {})}
            />
          ))}
        </div>
      ) : <span className="faint">{spare.length ? `Обязательных входов у «${effect.label || binding.effect}» нет.` : params.length ? `«${effect.label || binding.effect}» берёт только того, кто нажал, и цели — заполнять нечего.` : `«${effect.label || binding.effect}» ничего не принимает.`}</span>) : null}
      {effect && spare.length ? (
        <div className="row">
          <Select<string>
            label="передать ещё"
            value=""
            options={[['', `+ передать… (${spare.length})`], ...spare.map(param => [param.key, `${param.label ?? param.key} — сейчас ${emptyWords(param, system)}`] as const)]}
            onChange={key => { if (key) setOpened(prev => new Set([...prev, key])); }}
          />
        </div>
      ) : null}
      {more || binding.if?.expr ? (
        <div className="row">
          <ConditionField
            value={binding.if?.expr}
            onChange={expr => onEdit(draft => { if (expr) draft.if = { expr }; else delete draft.if; })}
            system={system}
            names={propNames}
            where={`${where} · только если`}
            placeholder="например: @срок.держится"
            ruleHint="Пока условие неверно, у записи этой кнопки нет."
          />
        </div>
      ) : (
        <Button size="sm" variant="ghost" title="условие кнопки" onClick={() => setMore(true)}>ещё</Button>
      )}
    </Card>
  );
}

interface Source { key: string; label: string; group: string }

function pickSources(param: Param, kind: RecordKind, system: System, effectId: string): Source[] {
  const choice = param.kind === 'choice';
  const own = (kind.columns ?? [])
    .filter(prop => prop.key === param.key || (choice ? prop.kind === 'choice' && prop.from === param.from : prop.kind === 'effect'))
    .map(prop => ({ key: `@${prop.key}`, label: `свойство «${prop.label ?? prop.key}»`, group: OWN }));
  if (choice) {
    const table = param.from ? system.tables?.[param.from] : undefined;
    const rows = param.from ? (listOf(system, param.from) ?? []) : [];
    return [...own, ...rows.map(row => ({ key: JSON.stringify(row.value), label: row.label, group: `Один на всех — строка «${table?.label || param.from}»` }))];
  }
  const effects = byRole(system, Object.entries(system.effects).filter(([id]) => id !== effectId))
    .map(([id, e, group]) => ({ key: JSON.stringify(id), label: e.label || id, group }));
  return [...own, ...effects];
}

function hintsOf(param: Param, system: System, effect: Effect, args: Record<string, unknown> | undefined, onNew: (() => void) | undefined): SlotOption[] {
  const fresh = onNew ? [{ group: 'Завести', label: `+ новое свойство «${param.label ?? param.key}»`, onPick: onNew }] : [];
  const asks = paymentsOf(system, effect, args ?? {})
    .flatMap(({ payment }) => (payment.params ?? []).filter(one => one.ask))
    .map(one => ({ group: 'Спросят при оплате', label: one.label ?? one.key, name: one.key }));
  return [...fresh, ...asks];
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

const freeParam = (param: Param): boolean => Boolean(loose(param).optional) || param.default !== undefined || Boolean(param.ask);

const LONE = /^@([\p{L}\p{N}_]+)(?:\.[\p{L}\p{N}_]+)?$/u;

function ArgRow({ param, binding, params, system, recordKind, props, propNames, kindId, effectId, effect, where, onArg, onNew }: {
  param: Param;
  kindId?: string;
  binding: Binding;
  params: Param[];
  system: System;
  recordKind: RecordKind;
  props: ReadonlyMap<string, ColumnChoice>;
  propNames: ReadonlyMap<string, string>;
  effectId: string;
  effect: Effect;
  where: string;
  onArg: (next: SlotRef | null) => void;
  onNew?: () => void;
}) {
  const name = param.label ?? param.key;
  const kind = String(param.kind ?? 'number');
  const free = freeParam(param);

  const byName = (recordKind.columns ?? []).some(prop => prop.key === param.key);
  const arg = binding.args?.[param.key] as unknown;
  const empty = arg === undefined || arg === null;
  const text = empty ? '' : asText(arg)?.trim() ?? '';
  const need = !text && !free;

  if (kind === 'effect' || kind === 'choice') {
    const sources = pickSources(param, recordKind, system, effectId);
    const known = !text || sources.some(source => source.key === text);
    return (
      <div className={`args-row${need ? ' args-row--need' : ''}`}>
        <span className="args-row__name">{name}</span>
        <KindCell param={param} system={system} />
        <div className="args-row__fill">
          <Select<string>
            label={`«${name}» — чем заполняет тип`}
            value={text}
            options={[
              [EMPTY, emptyWords(param, system)] as const,
              ...(known ? [] : [[text, `формула: ${text}`] as const]),
              ...sources.filter(source => source.group === OWN).map(source => [source.key, source.label, source.group] as const),
              ...(onNew && !byName ? [[NEW, `+ свойство «${name}»`, OWN] as const] : []),
              ...sources.filter(source => source.group !== OWN).map(source => [source.key, source.label, source.group] as const),
            ]}
            onChange={next => {
              if (next === NEW) { onNew?.(); return; }
              onArg(next === EMPTY ? null : { expr: next });
            }}
          />
          {kindId && text.startsWith('@') && (recordKind.columns ?? []).some(prop => `@${prop.key}` === text)
            ? <Examples system={system} kind={recordKind} kindId={kindId} prop={text.slice(1)} /> : null}
        </div>
      </div>
    );
  }

  const lone = LONE.exec(text)?.[1];
  const problem = text ? shapeProblem(text, kind, tag => shapeIn(tag, props, system, effect, binding.args as Record<string, unknown> | undefined)) : null;
  return (
    <div className={`args-row${need ? ' args-row--need' : ''}${problem ? ' args-row--bad' : ''}`}>
      <span className="args-row__name">{name}</span>
      <KindCell param={param} system={system} />
      <div className="args-row__fill">
        <div className="args-row__line">
        <ValueField
          where={`${where} · ${name}`}
          value={(text ? { expr: text } : undefined) as never}
          context={{ system, effect: { ...effect, params: [] }, earlier: [], recordKind, names: propNames, sheets: new Map(params.filter(one => one.kind === 'sheet' && !one.many).map(one => [one.key, one.label ?? one.key] as const)) }}
          allow={['prop', 'table', 'tag']}
          extraOptions={hintsOf(param, system, effect, binding.args as Record<string, unknown> | undefined, onNew && !byName ? onNew : undefined)}
          placeholder={emptyWords(param, system)}
          dice={kind === 'dice'}
          onChange={next => {
            const typed = asText(next)?.trim() ?? '';
            onArg(!next || !typed ? null : next);
          }}
        />
        {!text && onNew ? (
          <Button size="sm" title={`завести у типа свойство «${name}»: у каждой записи своё значение, его заполняют в книге`} onClick={onNew}>+ свойство</Button>
        ) : null}
        </div>
        {problem ? <span className="args-row__err">{problem}</span> : null}
        {lone && kindId && (recordKind.columns ?? []).some(prop => prop.key === lone)
          ? <Examples system={system} kind={recordKind} kindId={kindId} prop={lone} /> : null}
      </div>
    </div>
  );
}

function shapeIn(tag: string, props: ReadonlyMap<string, ColumnChoice>, system: System, effect: Effect, args: Record<string, unknown> | undefined): Shape {
  const prop = props.get(tag);
  if (prop) return shapeOfKind(prop.kind);
  const asked = paymentsOf(system, effect, args ?? {})
    .flatMap(({ payment }) => payment.params ?? []).find(one => one.key === tag && one.ask);
  return asked ? shapeOfKind(asked.kind) : 'any';
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
  const records = (book.records ?? []).filter(record => isUnder(system, record.table, kindId));
  if (!records.length) return null;
  const shown = records.slice(0, SHOWN).map(record => `${record.label || record.id} ${cellWords(system, column, propsOfRecord(record, system)?.[prop])}`);
  const rest = records.length - SHOWN;
  return <span className="args-row__eg">в книге: {shown.join(' · ')}{rest > 0 ? ` · ещё ${rest}` : ''}</span>;
}

const propsOf = (system: System, kindId: string | undefined): Map<string, ColumnChoice> =>
  new Map(kindId ? columnChoices(system, kindId).map(one => [one.path.slice(1), one] as const) : []);

export const namesOf = (system: System, kindId: string | undefined): Map<string, string> =>
  new Map([...propsOf(system, kindId)].map(([key, one]) => [key, one.label] as const));
