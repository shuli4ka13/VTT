import { useState } from 'react';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import type { StepWords } from '@vtt/engine/words/steps';
import { kindWord } from '@vtt/engine/words/kinds';
import { freeId, useWorld } from '../../../store/world.ts';
import { followKey } from '../keys.ts';
import { Card, CardHead, Field, Input, Select, Button } from '../../../ui/primitives.tsx';
import { KeyField } from '../../../ui/key-field.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { formulaAsLabels } from '../../../ui/formula.tsx';
import { ColumnList } from './column-list.tsx';
import type { Effect, Step, System, ValueKind } from '@vtt/schema';

type Return = NonNullable<Effect['returns']>[number];

const KINDS = [['boolean', 'да или нет'], ['number', 'число'], ['text', 'текст']] as const;
const BY_FORMULA = ':формула';

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
    for (const output of words?.outputs ?? []) out.push({ expr: `@${step.id}${output.path}`, label: `${title} — ${output.label.replace(/^да или нет: /, '')}`, kind: String(output.kind ?? 'number') });
  }
  return out;
}

const exprOf = (column: Return): string => String((column.expr as { expr?: unknown } | undefined)?.expr ?? '');

export function ReturnsEditor({ id, effect, system, onEdit }: {
  id: string;
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
}) {
  const columns = (effect.returns ?? []) as Return[];
  const [opened, setOpened] = useState<string[]>([]);
  const sources = sourcesOf(system, effect);
  const keys = columns.map(column => column.key);
  const change = (key: string, fn: (target: Return) => void) => onEdit(draft => {
    const target = draft.returns?.find(column => column.key === key);
    if (target) fn(target);
  });
  const add = () => {
    const key = freeId(keys, 'итог');
    setOpened(now => [...now, key]);
    onEdit(draft => { (draft.returns ??= []).push({ key, label: 'Новый итог', kind: 'boolean' } as Return); });
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
    const key = followKey({ used, key: column.key, base: 'итог', before: column.label ?? '', after: next, taken: keys });
    if (key !== column.key) setOpened(now => now.map(one => (one === column.key ? key : one)));
    change(column.key, target => { target.key = key; target.label = next; });
  };
  const summary = (column: Return) => {
    const source = sources.find(one => one.expr === exprOf(column));
    const from = source ? source.label : exprOf(column) ? formulaAsLabels(system, exprOf(column)) : 'не сказано, откуда';
    const kind = column.kind === 'boolean' ? (column.no ? `да / «${column.no}»` : 'да или нет') : kindWord(String(column.kind ?? 'number'));
    return `${kind} ← ${from}`;
  };

  return (
    <Card>
      <CardHead title="Что получит тот, кто вызвал" />
      {columns.length === 0 ? (
        <div className="inline inline--tight">
          <span className="faint">Ничего не отдаёт.</span>
          <Button size="sm" onClick={add}>+ итог</Button>
        </div>
      ) : (
        <>
          <ColumnList
            items={columns}
            isOpen={key => opened.includes(key)}
            onToggle={key => setOpened(now => (now.includes(key) ? now.filter(one => one !== key) : [...now, key]))}
            onDrop={drop}
            onMove={move}
            dropTitle="убрать итог"
            summary={summary}
            form={column => (
              <ReturnForm column={column} sources={sources} system={system} where={`${id} · что отдаёт`}
                keys={keys} locked={isUsed(column)} onKey={next => rekey(column, next)}
                onLabel={next => relabel(column, next)} change={fn => change(column.key, fn)} />
            )}
          />
          <div className="inline inline--tight">
            <Button size="sm" onClick={add}>+ итог</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ReturnForm({ column, sources, system, where, keys, locked, onKey, onLabel, change }: {
  column: Return;
  keys: string[];
  locked: boolean;
  onKey: (next: string) => void;
  sources: Source[];
  system: System;
  where: string;
  onLabel: (next: string) => void;
  change: (fn: (target: Return) => void) => void;
}) {
  const kind = String(column.kind ?? 'number');
  const expr = exprOf(column);
  const fitting = sources.filter(one => one.kind === kind || kind === 'text');
  const known = fitting.some(one => one.expr === expr);
  const [formula, setFormula] = useState(Boolean(expr) && !known);
  const [more, setMore] = useState(false);
  return (
    <div className="param-form">
      <div className="param-form__row">
        <Field label="Название"><Input value={column.label ?? ''} onChange={onLabel} /></Field>
        <Field label="Вид">
          <Select<string>
            value={kind}
            options={KINDS as never}
            onChange={next => change(target => { target.kind = next as ValueKind; if (next !== 'boolean') delete (target as { no?: string }).no; })}
          />
        </Field>
        <Field label="Откуда">
          {formula ? (
            <FormulaField value={expr} system={system} where={where}
              onCommit={next => change(target => { if (next.trim()) target.expr = { expr: next.trim() }; else delete target.expr; })} />
          ) : (
            <Select<string>
              value={known ? expr : ''}
              options={[['', '— какой итог шага —'], ...fitting.map(one => [one.expr, one.label] as const), [BY_FORMULA, 'формулой…']]}
              onChange={next => {
                if (next === BY_FORMULA) { setFormula(true); return; }
                change(target => { if (next) target.expr = { expr: next }; else delete target.expr; });
              }}
            />
          )}
        </Field>
        {kind === 'boolean' ? (
          <Field label="Как назвать «нет»" hint="подпись второй ветки: «промах», «не спасся»">
            <Input value={(column as { no?: string }).no ?? ''} placeholder={`не ${column.label ?? ''}`}
              onChange={next => change(target => { const t = target as { no?: string }; if (next.trim()) t.no = next; else delete t.no; })} />
          </Field>
        ) : null}
      </div>
      {more ? (
        <div className="param-form__row">
          <Field label="Имя в формулах" hint="как итог зовётся у вызвавшего: @шаг.имя. Идёт за названием, пока на него никто не ссылается">
            <KeyField value={column.key} locked={locked} taken={keys} onChange={onKey} />
          </Field>
        </div>
      ) : null}
      <div className="inline inline--tight">
        <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? 'меньше' : 'ещё'}</Button>
      </div>
    </div>
  );
}
