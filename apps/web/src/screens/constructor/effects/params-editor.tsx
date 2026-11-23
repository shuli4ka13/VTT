import { useState } from 'react';
import { recordKinds, kindsFor, kindWord, choiceTables, ASKABLE, asDice, toDice } from '@vtt/engine';
import { literalSaid, defaultSaid } from '../../../ui/formula-labels.ts';
import { freeId, useWorld } from '../../../store/world.ts';
import { followKey, paramUsed, keyOf, referenced } from '../keys.ts';
import { KeyField } from '../../../ui/key-field.tsx';
import { BoundField } from '../bound-field.tsx';
import { Card, CardHead, Field, Input, Select, Button, LabelInput } from '../../../ui/primitives.tsx';
import { ColumnList } from './column-list.tsx';
import type { Effect, Param, System, ValueKind, Stage } from '@vtt/schema';
import { StagesEditor } from '../stages-editor.tsx';
import { ConditionField } from '../condition-field.tsx';
import { focusNew } from '../../../ui/focus-new.ts';
import { shownDice } from '../../../ui/formula-lang.ts';
import { dataT, t, useT } from '../../../i18n/author.ts';
import { KEYS } from '../factory.ts';

const SHEETS = 'sheet+many';
const paramKinds = () => [...kindsFor('param'), [SHEETS, t('params:kind.sheets')] as const];

type Mode = 'must' | 'empty' | 'value' | 'actor' | 'gm';

const modeOf = (param: { ask?: { by?: string }; default?: unknown; optional?: boolean }): Mode =>
  param.ask ? (param.ask.by === 'gm' ? 'gm' : 'actor') : param.default !== undefined ? 'value' : param.optional ? 'empty' : 'must';

const modesFor = (kind: string, askable: boolean): (readonly [Mode, string])[] => [
  ['must', t('params:mode.must')],
  ['empty', t('params:mode.empty')],
  ...(kind === 'sheet' || kind === 'field' ? [] : [['value', t('params:mode.value')] as const]),
  ...(askable ? [['actor', t('params:mode.actor')] as const, ['gm', t('params:mode.gm')] as const] : []),
];

type Loose = Param & { role?: string; optional?: boolean };

export const kindWords = (param: Loose, system: System): string => {
  const kind = String(param.kind ?? 'number');
  if (kind === 'sheet') return param.many ? t('params:kind.eachNamed', { name: param.item?.label ?? param.item?.key ?? t('params:each.name') }) : t('params:kind.sheet');
  if (kind === 'choice') {
    const table = param.from ? system.tables?.[param.from] : undefined;
    if (table || param.from) return t(param.many ? 'params:kind.rowsNamed' : 'params:kind.rowNamed', { name: table?.label || param.from });
    return t(param.many ? 'params:kind.rows' : 'params:kind.row');
  }
  return kindWord(kind);
};

const defaultWords = (param: Loose, system: System): string => {
  const value = param.default;
  if (value === undefined || value === '') return '—';
  if (typeof value === 'string' && String(param.kind) === 'effect') return system.effects?.[value]?.label || value || t('params:nothing');
  if (typeof value === 'string' && typeof param.from !== 'string' && system.effects?.[value] === undefined && !literalSaid(system, value)) return shownDice(value);
  return defaultSaid(system, param, value);
};

const askWords = (param: Loose, system: System): string => {
  const mode = modeOf(param);
  if (mode === 'empty') return t('params:ask.empty');
  if (mode === 'value') return t('params:ask.value', { value: defaultWords(param, system) });
  if (mode === 'actor') return t('params:ask.actor');
  if (mode === 'gm') return t('params:ask.gm');
  return '';
};

export function ParamsEditor({ id, effect, system, onEdit }: {
  id: string;
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
}) {
  const t = useT('params');
  const td = dataT(system);
  const params = (effect.params ?? []) as Loose[];
  const [opened, setOpened] = useState<string[]>([]);
  const change = (key: string, fn: (target: Loose) => void) => onEdit(draft => {
    const target = draft.params?.find(p => p.key === key) as Loose | undefined;
    if (target) fn(target);
  });
  const addParam = () => {
    focusNew();
    const key = freeId(params.map(p => p.key), 'vhod');
    setOpened(now => [...now, key]);
    onEdit(draft => {
      draft.params ??= [];
      draft.params.push({ key, label: td('params:new.param'), kind: 'number' });
    });
  };
  const setMain = (key: string, on: boolean) => onEdit(draft => {
    for (const p of (draft.params ?? []) as Loose[]) {
      if (p.key === key && on) p.role = 'amount';
      else if (p.role === 'amount' && (p.key === key || on)) { delete p.role; delete (p as { stages?: unknown }).stages; }
    }
  });
  const used = (key: string) => { const st = useWorld.getState(); return paramUsed(st.system, st.compendium, id, key); };
  const keys = params.map(p => p.key);
  const move = (from: string, to: string, after: boolean) => onEdit(draft => {
    const list = draft.params ?? [];
    const moving = list.find(p => p.key === from);
    if (!moving) return;
    const rest = list.filter(p => p !== moving);
    const at = rest.findIndex(p => p.key === to);
    if (at < 0) return;
    rest.splice(at + (after ? 1 : 0), 0, moving);
    draft.params = rest;
  });
  const moveOpen = (from: string, to: string) => setOpened(now => now.map(k => (k === from ? to : k)));
  const relabel = (param: Loose, next: string) => {
    const key = followKey({ used: used(param.key), key: param.key, base: 'vhod', before: param.label ?? '', after: next, taken: keys });
    if (key !== param.key) moveOpen(param.key, key);
    onEdit(draft => {
      const target = draft.params?.find(p => p.key === param.key) as Loose | undefined;
      if (!target) return;
      target.key = key;
      target.label = next;
    });
  };
  const rekey = (param: Loose, next: string) => {
    moveOpen(param.key, next);
    change(param.key, t => { t.key = next; });
  };
  const toggle = (key: string) => setOpened(now => (now.includes(key) ? now.filter(k => k !== key) : [...now, key]));
  const drop = (key: string) => onEdit(draft => {
    draft.params = (draft.params ?? []).filter(p => p.key !== key);
    if (!draft.params.length) delete draft.params;
  });

  return (
    <Card>
      <CardHead title={t('card.title')} />
      {params.length === 0 ? (
        <div className="inline inline--tight">
          <span className="faint">{t('empty')}</span>
          <Button size="sm" onClick={addParam}>{t('add.first')}</Button>
        </div>
      ) : (
        <ColumnList
          items={params}
          isOpen={key => opened.includes(key)}
          onToggle={toggle}
          onDrop={drop}
          onMove={move}
          dropTitle={t('drop')}
          summary={param => <>{kindWords(param, system)}{askWords(param, system)}</>}
          head={[t('head.input'), t('head.what')]}
          form={param => (
            <ParamForm param={param} keys={keys} system={system} effect={effect}
              locked={used(param.key)} change={fn => change(param.key, fn)}
              onLabel={next => relabel(param, next)} onKey={next => rekey(param, next)} onMain={on => setMain(param.key, on)} />
          )}
        />
      )}
      {params.length ? (
        <div className="inline inline--tight">
          <Button size="sm" onClick={addParam}>{t('add.more')}</Button>
        </div>
      ) : null}
    </Card>
  );
}

function ParamForm({ param, keys, system, effect, locked, change, onLabel, onKey, onMain }: {
  param: Loose; keys: string[]; system: System; effect: Effect; locked: boolean;
  change: (fn: (target: Loose) => void) => void;
  onLabel: (next: string) => void; onKey: (next: string) => void; onMain: (on: boolean) => void;
}) {
  const t = useT('params');
  const td = dataT(system);
  const kind = String(param.kind ?? 'number');
  const askable = (ASKABLE as readonly string[]).includes(kind);
  const tables = choiceTables(system).map(([key, list]) => [key, list.label || key] as const);
  const rare = Boolean(param.ask?.hint) || Boolean(param.ask?.if) || (kind === 'sheet' && Boolean(param.from)) || param.role === 'amount' || param.min !== undefined || param.max !== undefined || Boolean(param.measure);
  const [more, setMore] = useState(rare);
  const full = more || rare;
  return (
    <div className="param-form">
      <div className="param-form__row">
        <Field label={t('field.name')}><LabelInput value={param.label ?? ''} onCommit={onLabel} /></Field>
        <Field label={t('field.kind')}>
          <Select
            value={kind === 'sheet' && param.many ? SHEETS : kind}
            options={paramKinds()}
            onChange={next => change(t => {
              t.kind = (next === SHEETS ? 'sheet' : next) as ValueKind;
              if (next === SHEETS) { t.many = true; t.item ??= { key: freeId(keys, KEYS.each), label: td('params:each.name') }; } else { delete t.many; delete t.item; }
              if (next !== 'number') { if (t.role === 'amount') delete t.role; delete (t as { stages?: unknown }).stages; }
              if (next !== 'sheet' && (t.role === 'target' || t.role === 'actor')) delete t.role;
              if (next !== 'choice' && next !== 'record' && next !== 'sheet' && next !== SHEETS) delete t.from;
              if (!(ASKABLE as readonly string[]).includes(next)) delete t.ask;
              if (next !== 'number' && next !== 'choice') delete t.measure;
            })}
          />
        </Field>
        {kind === 'record' ? (
          <Field label={t('field.record.label')} hint={t('field.record.hint')}>
            <Select
              value={String(param.from ?? '')}
              options={[['', t('field.record.pick')], ...recordKinds(system).map(([key, table]) => [key, table.label || key] as const)] as never}
              onChange={next => change(t => { if (next) t.from = next; else delete t.from; })}
            />
          </Field>
        ) : null}
        {kind === 'choice' ? (
          <Field label={t('field.table')}>
            <Select
              value={String(param.from ?? '')}
              options={[['', t('pick.which')], ...tables] as never}
              onChange={next => change(t => { if (next) t.from = next; else delete t.from; })}
            />
          </Field>
        ) : null}
        {kind === 'sheet' && param.many ? (
          <Field label={t('each.label')} hint={t('each.hint')}>
            <Input value={param.item?.label ?? param.item?.key ?? ''} placeholder={t('each.placeholder')}
              onChange={next => change(t => {
                const label = next.trim();
                if (!label) { delete t.item; return; }
                const st = useWorld.getState();
                const before = t.item?.key ?? '';
                const inUse = Boolean(before) && referenced({ s: st.system, c: st.compendium }, before, { steps: effect.steps ?? [], cost: effect.cost ?? [] });
                const key = followKey({ used: inUse, key: before || keyOf(label), base: KEYS.each, before: t.item?.label ?? '', after: label, taken: keys.filter(k => k !== before) });
                t.item = { key, label };
              })} />
          </Field>
        ) : null}
        {kind === 'sheet' && !param.many ? (
          <Field label={t('who.label')} hint={t('who.hint')}>
            <Select
              value={param.role === 'target' || param.role === 'actor' ? param.role : ''}
              options={[['', t('who.given')], ['target', t('who.target')], ['actor', t('who.actor')]] as const}
              onChange={next => change(t => { if (next) t.role = next as 'target' | 'actor'; else delete t.role; })}
            />
          </Field>
        ) : null}
        <Field label={t('missing.label')}>
          <span className="param-form__pair" title={t('missing.title')}>
            <Select<string>
              label={t('missing.aria', { name: param.label ?? param.key })}
              value={modeOf(param)}
              options={modesFor(kind, askable)}
              onChange={next => change(t => {
                delete t.ask; delete t.default; delete t.optional; delete t.measure;
                if (next === 'empty') t.optional = true;
                if (next === 'value') t.default = (kind === 'number' ? 0 : kind === 'boolean' ? false : '') as never;
                if (next === 'actor' || next === 'gm') t.ask = { by: next };
              })}
            />
            {modeOf(param) === 'value' ? (
              <DefaultCell param={param} system={system}
                onChange={next => change(t => { t.default = (next ?? '') as never; })} />
            ) : null}
          </span>
        </Field>
      </div>
      {full ? (
        <div className="param-form__row">
          {param.ask ? (
            <Field label={t('hint.label')} hint={t('hint.hint')}>
              <Input
                value={param.ask.hint ?? ''}
                placeholder={t('hint.placeholder')}
                onChange={next => change(t => {
                  if (!t.ask) return;
                  if (next) t.ask.hint = next; else delete t.ask.hint;
                })}
              />
            </Field>
          ) : null}
          {param.ask ? (
            <ConditionField
              value={param.ask.if?.expr}
              onChange={expr => change(t => {
                if (!t.ask) return;
                if (expr) t.ask.if = { expr }; else delete t.ask.if;
              })}
              system={system}
              title={t('askIf.title')}
              where={t('askIf.where', { name: param.label ?? param.key })}
              quick={(effect.params ?? []).filter(one => one.key !== param.key && one.kind === 'boolean').map(one => ({ ref: one.key, label: one.label ?? one.key, kind: 'boolean' as const }))}
              placeholder={t('askIf.placeholder')}
            />
          ) : null}
          {param.ask && (kind === 'number' || kind === 'choice') ? (
            <Field label={t('measure.label')} hint={t('measure.hint')}>
              <input
                type="checkbox" className="sheet-grid__check"
                aria-label={t('measure.aria', { name: param.label ?? param.key })}
                checked={Boolean(param.measure)}
                onChange={e => change(t => { if (e.target.checked) t.measure = true; else delete t.measure; })}
              />
            </Field>
          ) : null}
          {kind === 'sheet' && Object.keys(system.sheets ?? {}).length ? (
            <Field label={t('sheetType.label')} hint={t('sheetType.hint')}>
              <Select
                value={String(param.from ?? '')}
                options={[['', t('pick.any')], ...Object.entries(system.sheets ?? {}).map(([key, one]) => [key, (one as { label?: string }).label || key] as const)] as never}
                onChange={next => change(t => { if (next) t.from = next; else delete t.from; })}
              />
            </Field>
          ) : null}
          {kind === 'number' ? (
            <>
              <Field label={t('amount.label')} hint={t('amount.hint')}>
                <input
                  type="checkbox" className="sheet-grid__check"
                  aria-label={t('amount.aria', { name: param.label ?? param.key })}
                  checked={param.role === 'amount'}
                  onChange={e => onMain(e.target.checked)}
                />
              </Field>
              {param.role === 'amount' ? (
                <StagesEditor
                  stages={(param as { stages?: Stage[] }).stages}
                  onChange={next => change(t => { const x = t as { stages?: Stage[] }; if (next) x.stages = next; else delete x.stages; })}
                />
              ) : null}
              <Field label={t('bounds.label')} hint={t('bounds.hint')}>
                <span className="param-form__pair">
                  <BoundField value={param.min} placeholder={t('bounds.min')} onChange={next => change(t => { if (next === null) delete t.min; else t.min = next; })} />
                  <BoundField value={param.max} placeholder={t('bounds.max')} onChange={next => change(t => { if (next === null) delete t.max; else t.max = next; })} />
                </span>
              </Field>
            </>
          ) : null}
          <Field label={t('field.key')} hint={t('keyHint.param')}>
            <KeyField value={param.key} locked={locked} taken={keys} onChange={onKey} />
          </Field>
        </div>
      ) : null}
      {full && !more ? null : (
        <div className="inline inline--tight">
          <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? t('less') : t('common:more')}</Button>
        </div>
      )}
    </div>
  );
}

function DefaultCell({ param, system, onChange }: { param: Loose; system: System; onChange: (next: string | number | boolean | undefined) => void }) {
  const t = useT('params');
  const kind = String(param.kind ?? 'number');
  const value = param.default;
  if (kind === 'sheet' || kind === 'field') return <span className="faint">—</span>;
  if (kind === 'effect') {
    return (
      <Select<string> label={t('missing.aria', { name: param.label ?? param.key })} value={typeof value === 'string' ? value : ''}
        options={[['', t('nothing')], ...Object.entries(system.effects).map(([id, effect]) => [id, effect.label || id] as const)]}
        onChange={next => onChange(next || undefined)} />
    );
  }
  if (kind === 'boolean') {
    return (
      <Select<string> label={t('missing.aria', { name: param.label ?? param.key })} value={value === true ? 'yes' : value === false ? 'no' : ''}
        options={[['', '—'], ['yes', t('common:yes')], ['no', t('common:no')]]}
        onChange={next => onChange(next === 'yes' ? true : next === 'no' ? false : undefined)} />
    );
  }
  return (
    <Input value={value === undefined ? '' : kind === 'dice' ? asDice(String(value)) : String(value)} placeholder="—"
      onChange={text => {
        const trimmed = text.trim();
        if (!trimmed) { onChange(undefined); return; }
        const number = Number(trimmed.replace(',', '.'));
        onChange(kind === 'number' && Number.isFinite(number) ? number : kind === 'dice' ? toDice(trimmed) : trimmed);
      }} />
  );
}
