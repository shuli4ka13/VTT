import type { System, Modifier } from '@vtt/schema';
import { useState } from 'react';
import { Card, CardHead, Field, Input, Select, Button, Empty } from '../../ui/primitives.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { targets } from '@vtt/engine/engine/targets';

const OPS = [
  ['add', 'прибавить'],
  ['mul', 'умножить'],
  ['set', 'задать'],
] as const;

const STACKING = [
  ['sum', 'складываются'],
  ['max', 'берётся наибольший'],
  ['override', 'последний перебивает'],
] as const;

export function ModifiersEditor({ system, modifiers, onEdit, title, empty }: {
  system: System;
  modifiers: Modifier[];
  onEdit: (change: (draft: Modifier[]) => void) => void;

  title?: string;

  empty?: { title: string; hint: string };
}) {
  const all = targets(system) as { tag: string; label: string; kind: string; group?: string }[];
  const valueTargets = all.filter(t => t.kind === 'value' || t.kind === 'incoming');
  const rollTargets = all.filter(t => t.kind === 'roll');
  const edits = Object.entries(system.roll_edits ?? {});

  return (
    <>
      <div className="inline">
        {}
        {title === '' ? null : (
          <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>{title ?? 'Что правит'}</span>
        )}
        <span className="spacer" />
        <Button size="sm" onClick={() => onEdit(draft => {
          draft.push({ kind: 'value', target: valueTargets[0]?.tag ?? '', op: 'add', value: 1, stacking: 'sum', condition: null });
        })}>
          + правит значение
        </Button>
        <Button
          size="sm"
          onClick={() => onEdit(draft => {
            draft.push({
              kind: 'roll', target: rollTargets[0]?.tag ?? '',
              edit: edits[0]?.[0] ?? '', condition: null,
            });
          })}
          disabled={rollTargets.length === 0 || edits.length === 0}
          title={edits.length === 0 ? 'Сначала заведите правку в словаре «Правки броска»' : undefined}
        >
          + правит бросок
        </Button>
      </div>

      {modifiers.length === 0 ? (
        <Empty
          title={empty?.title ?? 'Эффект пока ничего не делает'}
          hint={empty?.hint ?? 'Пассивный эффект правит цифры: даёт бонус к полю или вешает преимущество на бросок.'}
        />
      ) : null}

      {modifiers.map((modifier, index) => (
        <Card key={index}>
          <CardHead
            title={modifier.kind === 'value' ? 'Правит значение' : 'Правит бросок'}
            actions={
              <Button size="sm" variant="danger" onClick={() => onEdit(draft => { draft.splice(index, 1); })}>×</Button>
            }
          />

          {modifier.kind === 'value' ? (
            <div className="row">
              <Field label="Что правим" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите, что правим —'],
                    ...valueTargets.map(t => [t.tag, t.kind === 'incoming' ? `${t.label}` : t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as Modifier).target = target; })}
                />
              </Field>
              <Field label="Как">
                <Select
                  value={String(modifier.op)}
                  options={OPS}
                  onChange={op => onEdit(draft => { (draft[index] as { op: string }).op = op; })}
                />
              </Field>
              <Field label="На сколько">
                <DraftValue
                  value={modifier.value}
                  onCommit={next => onEdit(draft => {
                    (draft[index] as { value: unknown }).value = next;
                  })}
                />
              </Field>
              <Field label="Если таких несколько">
                <Select
                  value={String(modifier.stacking ?? 'sum')}
                  options={STACKING}
                  onChange={stacking => onEdit(draft => { (draft[index] as { stacking?: string }).stacking = stacking; })}
                />
              </Field>
            </div>
          ) : (
            <div className="row">
              <Field label="На какой бросок" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите бросок —'],
                    ...rollTargets.map(t => [t.tag, t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as Modifier).target = target; })}
                />
              </Field>
              <Field label="Какая правка" needed={!modifier.edit}>
                <Select
                  value={String(modifier.edit ?? '')}
                  options={[['', '— выберите правку —'],
                    ...edits.map(([key, e]) => [key, e.label || key] as const)] as never}
                  onChange={edit => onEdit(draft => { (draft[index] as { edit: string }).edit = edit; })}
                />
              </Field>
            </div>
          )}

          <Field
            label="Только когда"
            hint="Условие на листе владельца. Пусто — всегда."
          >
            <FormulaInput
              system={system}
              value={modifier.condition ?? ''}
              onChange={condition => onEdit(draft => {
                (draft[index] as { condition?: string | null }).condition = condition || null;
              })}
              placeholder="например: @тяжёлая броня"
            />
          </Field>
        </Card>
      ))}
    </>
  );
}

function DraftValue({ value, onCommit }: { value: unknown; onCommit: (next: unknown) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      value={draft ?? String(value ?? '')}
      onChange={text => {
        setDraft(text);
        if (/^-?\d+(\.\d+)?$/.test(text)) onCommit(Number(text));
        else if (text === 'true' || text === 'false') onCommit(text === 'true');
        else if (text.trim() !== '' && text !== '-') onCommit(text);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
