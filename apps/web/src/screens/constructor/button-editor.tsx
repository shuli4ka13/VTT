import { useMemo, useState } from 'react';
import { useWorld, useBook } from '../../store/world.ts';
import type { System, Effect, Param, Binding, SlotRef } from '@vtt/schema';
import { isUnder, propsOf as propsOfRecord, paramsOf, typeColumns, columnChoices, ITEM_NAME, listOf, asDice, paymentsOf, NAMES, NAME_LABELS } from '@vtt/engine';
import type { RecordKind, ColumnChoice } from '@vtt/engine';
import { Card, Field, Select, LabelInput, Button, DangerButton } from '../../ui/primitives.tsx';
import { ValueField, asText, type SlotOption } from './value-field.tsx';
import { grouped as byRole } from './effects/roles.ts';
import { formulaAsLabels, literalSaid, defaultSaid } from '../../ui/formula-labels.ts';
import { kindWords } from './effects/params-editor.tsx';
import { ConditionField } from './condition-field.tsx';
import { shapeProblem, shapeOfKind, type Shape } from './formula-shape.ts';
import { useT, t as tr } from '../../i18n/author.ts';

const EMPTY = '';
const NEW = '+';
const ownGroup = (): string => tr('records:button.own');

export function ButtonEditor({ binding, system, recordKind: ownKind, kindId, onEdit, onDelete, onFillWithProps }: {
  binding: Binding;
  system: System;

  recordKind: RecordKind;
  kindId?: string;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;

  onFillWithProps?: (params: Param[]) => void;
}) {
  const t = useT('records');
  const recordKind = useMemo(() => (kindId ? { ...ownKind, columns: typeColumns(system, kindId) } : ownKind), [system, ownKind, kindId]);
  const props = useMemo(() => propsOf(system, kindId), [system, kindId]);
  const propNames = useMemo(() => new Map([[ITEM_NAME, t('button.thisItem')], ...[...props].map(([key, one]) => [key, one.label] as const)]), [props, t]);
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
    <Card tone="flat" label={t('button.card', { where })}>
      <div className="button-head">
        <Field label={t('button.label')}>
          <LabelInput value={binding.label ?? ''} placeholder={t('button.labelPlaceholder')} onCommit={label => onEdit(draft => { draft.label = label; })} />
        </Field>
        <Field label={t('button.effect')} needed={!effect}>
          <Select
            value={binding.effect ?? ''}
            options={[['', t('button.effectEmpty')], ...byRole(system, buttons).map(([id, e, group]) => [id, e.label || id, group] as const)] as never}
            onChange={next => {
              const chosen = system.effects[next];
              const columns = new Set((recordKind.columns ?? []).map(prop => prop.key));
              const itself = (param: Param): boolean => param.kind === 'record' && Boolean(param.from && kindId && isUnder(system, kindId, param.from));
              onEdit(draft => {
                draft.effect = next;
                if (!draft.label?.trim() && system.effects[next]) draft.label = system.effects[next]!.label || next;
                if (!chosen) return;
                const kept: Record<string, unknown> = {};
                for (const param of paramsOf(system, chosen)) {
                  if (param.kind === 'sheet') continue;
                  const given = draft.args?.[param.key];
                  if (given !== undefined) kept[param.key] = given;
                  else if (itself(param)) kept[param.key] = { expr: `@${ITEM_NAME}` };
                  else if (columns.has(param.key)) kept[param.key] = { expr: `@${param.key}` };
                }
                if (Object.keys(kept).length) draft.args = kept as never; else delete draft.args;
              });
              const missing = chosen ? paramsOf(system, chosen)
                .filter(param => param.kind !== 'sheet' && !freeParam(param) && !itself(param) && !columns.has(param.key) && binding.args?.[param.key] === undefined) : [];
              if (missing.length) onFillWithProps?.(missing);
            }}
          />
        </Field>
        <div className="button-head__actions">
          {effect ? (
            <Button size="sm" variant="ghost" title={t('button.open')}
              onClick={() => useWorld.getState().pick({ activeTab: 'effects', activeEffectId: binding.effect, activeStepIndex: null })}>
              {t('button.openLabel')}
            </Button>
          ) : null}
          <DangerButton size="sm" onConfirm={onDelete}>{t('common:delete')}</DangerButton>
        </div>
      </div>
      {effect ? (shown.length ? (
        <div className="args-table">
          <div className="args-table__head" aria-hidden><span>{t('button.head.input')}</span><span>{t('button.head.what')}</span><span>{t('button.head.fill')}</span></div>
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
      ) : <span className="faint">{t(spare.length ? 'button.noRequired' : params.length ? 'button.onlyHolder' : 'button.takesNothing', { name: effect.label || binding.effect })}</span>) : null}
      {effect && spare.length ? (
        <div className="row">
          <Select<string>
            label={t('button.passMore')}
            value=""
            options={[['', t('button.pass', { n: spare.length })], ...spare.map(param => [param.key, t('button.passRow', { name: param.label ?? param.key, now: emptyWords(param, system) })] as const)]}
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
            where={t('button.ifWhere', { where })}
            placeholder={t('button.ifPlaceholder')}
            ruleHint={t('button.ifHint')}
          />
        </div>
      ) : (
        <Button size="sm" variant="ghost" title={t('button.ifTitle')} onClick={() => setMore(true)}>{t('common:more')}</Button>
      )}
    </Card>
  );
}

interface Source { key: string; label: string; group: string }

function pickSources(param: Param, kind: RecordKind, system: System, effectId: string): Source[] {
  const choice = param.kind === 'choice';
  const own = (kind.columns ?? [])
    .filter(prop => prop.key === param.key || (choice ? prop.kind === 'choice' && prop.from === param.from : prop.kind === 'effect'))
    .map(prop => ({ key: `@${prop.key}`, label: tr('records:button.prop', { name: prop.label ?? prop.key }), group: ownGroup() }));
  if (choice) {
    const table = param.from ? system.tables?.[param.from] : undefined;
    const rows = param.from ? (listOf(system, param.from) ?? []) : [];
    return [...own, ...rows.map(row => ({ key: JSON.stringify(row.value), label: row.label, group: tr('records:button.oneForAll', { table: table?.label || param.from }) }))];
  }
  const effects = byRole(system, Object.entries(system.effects).filter(([id]) => id !== effectId))
    .map(([id, e, group]) => ({ key: JSON.stringify(id), label: e.label || id, group }));
  return [...own, ...effects];
}

function hintsOf(param: Param, system: System, effect: Effect, args: Record<string, unknown> | undefined, onNew: (() => void) | undefined): SlotOption[] {
  const fresh = onNew ? [{ group: tr('records:button.create'), label: tr('records:button.newProp', { name: param.label ?? param.key }), onPick: onNew }] : [];
  const asks = paymentsOf(system, effect, args ?? {})
    .flatMap(({ payment }) => (payment.params ?? []).filter(one => one.ask))
    .map(one => ({ group: tr('records:button.asked'), label: one.label ?? one.key, name: one.key }));
  return [...fresh, ...asks];
}

function emptyWords(param: Param, system: System): string {
  if (param.default !== undefined) return tr('records:button.sameAsEffect', { value: defaultSaid(system, param, param.default) });
  if (param.ask) return param.ask.by === 'gm' ? tr('records:button.askGm') : tr('records:button.askPlayer');
  if (param.optional) return tr('records:button.notPassed');
  return tr('records:button.notFilled');
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
  const t = useT('records');
  const own = ownGroup();
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
            label={t('button.fillsBy', { name })}
            value={text}
            options={[
              [EMPTY, emptyWords(param, system)] as const,
              ...(known ? [] : [[text, t('button.byFormula', { text: formulaAsLabels(system, text) })] as const]),
              ...sources.filter(source => source.group === own).map(source => [source.key, source.label, source.group] as const),
              ...(onNew && !byName ? [[NEW, t('button.addProp', { name }), own] as const] : []),
              ...sources.filter(source => source.group !== own).map(source => [source.key, source.label, source.group] as const),
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
          context={{ system, effect: { ...effect, params: [] }, earlier: [], recordKind, names: propNames, sheets: new Map([[NAMES.holder, NAME_LABELS.holder] as const, ...params.filter(one => one.kind === 'sheet' && !one.many).map(one => [one.key, one.label ?? one.key] as const)]) }}
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
          <Button size="sm" title={t('button.addPropTitle', { name })} onClick={onNew}>{t('button.addPropShort')}</Button>
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
  const t = useT('records');
  const table = param.kind === 'choice' && param.from ? param.from : null;
  if (!table) return <span className="args-row__kind">{kindWords(param, system)}</span>;
  return (
    <span className="args-row__kind">
      {param.many ? t('button.rows') : t('button.row')}{' '}
      <button type="button" className="link-button" title={t('button.openTable')}
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
  if (typeof value === 'object') return formulaAsLabels(system, String((value as { expr?: unknown }).expr ?? ''));
  if (column.kind === 'dice') return asDice(String(value));
  if (column.kind === 'choice' && column.from) return listOf(system, column.from)?.find(row => row.value === value)?.label ?? system.effects?.[String(value)]?.label ?? literalSaid(system, String(value)) ?? String(value);
  if (column.kind === 'effect') return system.effects?.[String(value)]?.label ?? String(value);
  return literalSaid(system, String(value)) ?? String(value);
}

function Examples({ system, kind, kindId, prop }: { system: System; kind: RecordKind; kindId: string; prop: string }) {
  const t = useT('records');
  const book = useBook();
  const column = (kind.columns ?? []).find(one => one.key === prop);
  if (!column) return null;
  const records = (book.records ?? []).filter(record => isUnder(system, record.table, kindId));
  if (!records.length) return null;
  const shown = records.slice(0, SHOWN).map(record => `${record.label || record.id} ${cellWords(system, column, propsOfRecord(record, system)?.[prop])}`);
  const rest = records.length - SHOWN;
  return <span className="args-row__eg">{t(rest > 0 ? 'button.exampleMore' : 'button.example', { shown: shown.join(' · '), n: rest })}</span>;
}

const propsOf = (system: System, kindId: string | undefined): Map<string, ColumnChoice> =>
  new Map(kindId ? columnChoices(system, kindId).map(one => [one.path.slice(1), one] as const) : []);

export const namesOf = (system: System, kindId: string | undefined): Map<string, string> =>
  new Map([...propsOf(system, kindId)].map(([key, one]) => [key, one.label] as const));
