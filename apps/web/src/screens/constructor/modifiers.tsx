import type { System, Modifier } from '@vtt/schema';
import { useState } from 'react';
import { Card, CardHead, Field, Input, Select, Button, Empty } from '../../ui/primitives.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { targets } from '@vtt/engine/engine/targets';
import { installMethod, recipesToInstall } from '@vtt/engine/model/advantage-methods';

const OPS = [
  ['add', 'прибавить'],
  ['mul', 'умножить'],
  ['set', 'задать'],
  ['floor', 'не меньше'],
  ['cap', 'не больше'],
] as const;

const RECIPE = 'recipe:';

const STACKING = [
  ['sum', 'складываются'],
  ['max', 'берётся наибольший'],
  ['override', 'последний перебивает'],
] as const;

export function ModifiersEditor({ system, modifiers, onEdit, title, empty, editSystem }: {
  system: System;
  modifiers: Modifier[];
  onEdit: (change: (draft: Modifier[]) => void) => void;

  title?: string;

  empty?: { title: string; hint: string };

  editSystem?: (change: (draft: System) => void) => void;
}) {
  const all = targets(system) as { tag: string; label: string; kind: string; group?: string }[];
  const valueTargets = all.filter(t => t.kind === 'value' || t.kind === 'incoming' || t.kind === 'event');
  const isEvent = (tag: string) => all.find(t => t.tag === tag)?.kind === 'event';
  const listOf = (raw: unknown) => (Array.isArray(raw) ? raw.map(String).join(', ') : '');
  const parseList = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean);
  const rollTargets = all.filter(t => t.kind === 'roll');
  const edits = Object.entries(system.roll_edits ?? {});
  const recipes = editSystem ? recipesToInstall(system) : [];
  const pickEdit = (index: number, value: string) => {
    if (value.startsWith(RECIPE) && editSystem) {
      const [methodId, key] = value.slice(RECIPE.length).split(':');
      editSystem(draft => { installMethod(draft, String(methodId)); });
      onEdit(draft => { (draft[index] as { edit: string }).edit = String(key); });
      return;
    }
    onEdit(draft => { (draft[index] as { edit: string }).edit = value; });
  };

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
          disabled={rollTargets.length === 0 || (edits.length === 0 && !editSystem)}
          title={edits.length === 0 && !editSystem ? 'Сначала заведите правку в словаре «Правки броска»' : undefined}
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
                  options={modifier.op === 'mul'
                    ? STACKING.map(([key, label]) => [key, key === 'sum' ? 'перемножаются' : label] as const)
                    : STACKING}
                  onChange={stacking => onEdit(draft => { (draft[index] as { stacking?: string }).stacking = stacking; })}
                />
              </Field>
              {isEvent(modifier.target) ? (
                <>
                  <Field label="Если тег" hint="Через запятую. Пусто — любой.">
                    <Input
                      value={listOf((modifier as { tags?: unknown }).tags)}
                      onChange={text => onEdit(draft => {
                        const m = draft[index] as { tags?: string[] };
                        const list = parseList(text);
                        if (list.length) m.tags = list; else delete m.tags;
                      })}
                    />
                  </Field>
                  <Field label="Кроме тега">
                    <Input
                      value={listOf((modifier as { notTags?: unknown }).notTags)}
                      onChange={text => onEdit(draft => {
                        const m = draft[index] as { notTags?: string[] };
                        const list = parseList(text);
                        if (list.length) m.notTags = list; else delete m.notTags;
                      })}
                    />
                  </Field>
                </>
              ) : null}
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
              <Field
                label="Какая правка"
                needed={!modifier.edit}
                hint={recipes.length ? 'Готовые механизмы приедут в словарь «Правки броска» со всеми словами.' : undefined}
              >
                <Select
                  value={String(modifier.edit ?? '')}
                  options={[['', '— выберите правку —'],
                    ...edits.map(([key, e]) => [key, e.label || key] as const),
                    ...recipes.map(({ method, recipe }) =>
                      [`${RECIPE}${method.id}:${recipe.key}`, `+ ${recipe.label} · ${method.label}`] as const),
                  ] as never}
                  onChange={edit => pickEdit(index, edit)}
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
