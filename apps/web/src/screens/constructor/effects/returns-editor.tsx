import { useState } from 'react';
import { STEP_WORDS, kindWord, choiceTables, resultsOf } from '@vtt/engine';
import type { StepWords } from '@vtt/engine';
import { freeId, useWorld } from '../../../store/world.ts';
import { followKey } from '../keys.ts';
import { Card, CardHead, Field, Input, Select, Button, LabelInput } from '../../../ui/primitives.tsx';
import { KeyField } from '../../../ui/key-field.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { formulaAsLabels } from '../../../ui/formula.tsx';
import { ColumnList } from './column-list.tsx';
import { namesOf, inputBadges, fieldedOf } from '../slots.tsx';
import type { SlotContext, EarlierStep } from '../slots.tsx';
import { sheetsAt } from './names.ts';
import type { Effect, Step, System, ValueKind } from '@vtt/schema';
import { focusNew } from '../../../ui/focus-new.ts';
import { dataT, useT } from '../../../i18n/author.ts';
import { KEYS } from '../factory.ts';

type Return = NonNullable<Effect['returns']>[number];

const BY_FORMULA = ':formula';

interface Source { expr: string; label: string; kind: string }

function sourcesOf(system: System, effect: Effect): Source[] {
  const out: Source[] = [];
  for (const step of [...(effect.cost ?? []), ...(effect.steps ?? [])] as Step[]) {
    if (!step.id) continue;
    const words = (STEP_WORDS as Record<string, StepWords>)[step.type];
    const called = (step as { effect?: unknown }).effect;
    const callee = step.type === 'emit' && typeof called === 'string' ? system.effects?.[called] : undefined;
    const title = callee?.label ?? words?.label ?? step.type;
    for (const column of callee?.returns ?? []) out.push({ expr: `@${step.id}.${column.key}`, label: `${title} — ${column.label ?? column.key}`, kind: String(column.kind ?? 'number') });
    for (const output of resultsOf(system, effect.params ?? [], step).filter(one => one.kind !== 'roll')) out.push({ expr: `@${step.id}${output.path}`, label: `${title} — ${output.label.replace(/^да или нет: /, '')}`, kind: String(output.kind ?? 'number') });
  }
  return out;
}

function contextOf(system: System, effect: Effect): SlotContext {
  const earlier: EarlierStep[] = [];
  for (const step of [...(effect.cost ?? []), ...(effect.steps ?? [])] as Step[]) {
    if (!step.id) continue;
    const called = (step as { effect?: unknown }).effect;
    const callee = step.type === 'emit' && typeof called === 'string' ? system.effects?.[called] : undefined;
    const words = (STEP_WORDS as Record<string, StepWords>)[step.type];
    const outputs = (callee?.returns ?? []).map(column => ({
      path: `.${column.key}`, label: column.label ?? column.key,
      ...(column.kind ? { kind: String(column.kind) } : {}),
      ...(column.no ? { no: column.no } : {}),
    }));
    const title = callee?.label ?? words?.label;
    earlier.push({ id: String(step.id), ...(step.label ? { label: step.label } : {}), type: step.type, ...fieldedOf(system, effect.params ?? [], step), ...(title ? { title } : {}), ...(outputs.length ? { outputs } : {}) });
  }
  return { system, effect, earlier };
}

const exprOf = (column: Return): string => String((column.expr as { expr?: unknown } | undefined)?.expr ?? '');

export function ReturnsEditor({ id, effect, system, onEdit }: {
  id: string;
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
}) {
  const t = useT('params');
  const td = dataT(system);
  const columns = (effect.returns ?? []) as Return[];
  const [opened, setOpened] = useState<string[]>([]);
  const sources = sourcesOf(system, effect);
  const context = contextOf(system, effect);
  const names = namesOf(context);
  const sheets = sheetsAt(system, id, { part: 'steps', index: (effect.steps ?? []).length });
  const keys = columns.map(column => column.key);
  const change = (key: string, fn: (target: Return) => void) => onEdit(draft => {
    const target = draft.returns?.find(column => column.key === key);
    if (target) fn(target);
  });
  const add = () => {
    focusNew();
    const key = freeId(keys, KEYS.result);
    setOpened(now => [...now, key]);
    onEdit(draft => { (draft.returns ??= []).push({ key, label: td('params:new.result'), kind: 'boolean' } as Return); });
  };
  const drop = (key: string) => onEdit(draft => {
    draft.returns = (draft.returns ?? []).filter(column => column.key !== key);
    if (!draft.returns.length) delete draft.returns;
  });
  const move = (from: string, to: string, after: boolean) => onEdit(draft => {
    const list = draft.returns ?? [];
    const moving = list.find(column => column.key === from);
    if (!moving) return;
    const rest = list.filter(column => column !== moving);
    const at = rest.findIndex(column => column.key === to);
    if (at < 0) return;
    rest.splice(at + (after ? 1 : 0), 0, moving);
    draft.returns = rest;
  });
  const isUsed = (column: Return) => new RegExp(`\\.${column.key}(?![\\p{L}\\p{N}_])`, 'u').test(JSON.stringify(useWorld.getState().system.effects ?? {}));
  const rekey = (column: Return, next: string) => {
    setOpened(now => now.map(one => (one === column.key ? next : one)));
    change(column.key, target => { target.key = next; });
  };
  const relabel = (column: Return, next: string) => {
    const used = isUsed(column);
    const key = followKey({ used, key: column.key, base: KEYS.result, before: column.label ?? '', after: next, taken: keys });
    if (key !== column.key) setOpened(now => now.map(one => (one === column.key ? key : one)));
    change(column.key, target => { target.key = key; target.label = next; });
  };
  const summary = (column: Return) => {
    const source = sources.find(one => one.expr === exprOf(column));
    const from = source ? source.label : exprOf(column) ? formulaAsLabels(system, exprOf(column), names) : t('returns.unknown');
    const table = column.kind === 'choice' && column.from ? system.tables?.[column.from] : undefined;
    const kind = column.kind === 'boolean' ? (column.no ? t('returns.yesNo', { no: column.no }) : t('returns.kind.boolean'))
      : table ? t('returns.choiceFrom', { name: table.label || column.from }) : kindWord(String(column.kind ?? 'number'));
    return `${kind} ← ${from}`;
  };

  return (
    <Card>
      <CardHead title={t('card.returnsTitle')} />
      {columns.length === 0 ? (
        <div className="inline inline--tight">
          <span className="faint">{t('returns.empty')}</span>
          <Button size="sm" onClick={add}>{t('returns.add')}</Button>
        </div>
      ) : (
        <>
          <ColumnList
            items={columns}
            isOpen={key => opened.includes(key)}
            onToggle={key => setOpened(now => (now.includes(key) ? now.filter(one => one !== key) : [...now, key]))}
            onDrop={drop}
            onMove={move}
            dropTitle={t('returns.drop')}
            summary={summary}
            form={column => (
              <ReturnForm column={column} sources={sources} system={system} context={context} names={names} sheets={sheets} where={t('returns.where', { id })}
                keys={keys} locked={isUsed(column)} onKey={next => rekey(column, next)}
                onLabel={next => relabel(column, next)} change={fn => change(column.key, fn)} />
            )}
          />
          <div className="inline inline--tight">
            <Button size="sm" onClick={add}>{t('returns.add')}</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ReturnForm({ column, sources, system, context, names, sheets, where, keys, locked, onKey, onLabel, change }: {
  column: Return;
  keys: string[];
  locked: boolean;
  onKey: (next: string) => void;
  sources: Source[];
  system: System;
  context: SlotContext;
  names: Map<string, string>;
  sheets: ReturnType<typeof sheetsAt>;
  where: string;
  onLabel: (next: string) => void;
  change: (fn: (target: Return) => void) => void;
}) {
  const t = useT('params');
  const kind = String(column.kind ?? 'number');
  const kinds = [['boolean', t('returns.kind.boolean')], ['number', t('returns.kind.number')], ['text', t('returns.kind.text')], ['choice', t('returns.kind.choice')]] as const;
  const expr = exprOf(column);
  const fitting = sources.filter(one => one.kind === kind || kind === 'text');
  const tables = choiceTables(system).map(([key, list]) => [key, list.label || key] as const);
  const known = fitting.some(one => one.expr === expr);
  const [formula, setFormula] = useState(Boolean(expr) && !known);
  const [more, setMore] = useState(false);
  return (
    <div className="param-form">
      <div className="param-form__row">
        <Field label={t('field.name')}><LabelInput value={column.label ?? ''} onCommit={onLabel} /></Field>
        <Field label={t('field.kind')}>
          <Select<string>
            value={kind}
            options={kinds as never}
            onChange={next => change(target => { target.kind = next as ValueKind; if (next !== 'boolean') delete (target as { no?: string }).no; if (next !== 'choice') delete target.from; })}
          />
        </Field>
        <Field label={t('field.from')}>
          {formula ? (
            <FormulaField value={expr} system={system} where={where} extraNames={names} sheets={sheets} badges={inputBadges(context)}
              onCommit={next => change(target => { if (next.trim()) target.expr = { expr: next.trim() }; else delete target.expr; })} />
          ) : (
            <Select<string>
              value={known ? expr : ''}
              options={[['', t('returns.pickResult')], ...fitting.map(one => [one.expr, one.label] as const), [BY_FORMULA, t('returns.byFormula')]]}
              onChange={next => {
                if (next === BY_FORMULA) { setFormula(true); return; }
                change(target => { if (next) target.expr = { expr: next }; else delete target.expr; });
              }}
            />
          )}
        </Field>
        {kind === 'choice' ? (
          <Field label={t('field.table')}>
            <Select
              value={String(column.from ?? '')}
              options={[['', t('pick.which')], ...tables] as never}
              onChange={next => change(target => { if (next) target.from = next; else delete target.from; })}
            />
          </Field>
        ) : null}
        {kind === 'boolean' ? (
          <Field label={t('returns.no.label')} hint={t('returns.no.hint')}>
            <Input value={(column as { no?: string }).no ?? ''} placeholder={t('returns.no.placeholder', { label: column.label ?? '' })}
              onChange={next => change(target => { const t = target as { no?: string }; if (next.trim()) t.no = next; else delete t.no; })} />
          </Field>
        ) : null}
      </div>
      {more ? (
        <div className="param-form__row">
          <Field label={t('field.key')} hint={t('keyHint.result')}>
            <KeyField value={column.key} locked={locked} taken={keys} onChange={onKey} />
          </Field>
        </div>
      ) : null}
      <div className="inline inline--tight">
        <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? t('less') : t('common:more')}</Button>
      </div>
    </div>
  );
}
