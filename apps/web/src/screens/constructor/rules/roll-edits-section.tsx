import { BoundField } from '../bound-field.tsx';
import type { Bound } from '../bound-field.tsx';
import { useState } from 'react';
import { editPalette, paletteKeyOf } from '@vtt/engine/engine/roll-edits';
import { ADVANTAGE_METHODS, installMethod } from '@vtt/engine/model/advantage-methods';
import { Readback } from '../effects/cards/group-card.tsx';
import { editReadback } from '../readback.ts';
import { Card, CardHead, Input, Button, Fold, Select } from '../../../ui/primitives.tsx';
import { newRollEdit } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const PART_ABLE = ['addDie', 'keepBest', 'keepWorst', 'dieStep', 'explode', 'flip', 'reroll'];

const addRollEdit = (editSystem: EditSystem) => editSystem(draft => {
  const made = newRollEdit(draft);
  (draft.roll_edits ??= {})[made.key] = made.value;
});

const addFromCatalog = (editSystem: EditSystem, methodId: string) => editSystem(draft => {
  installMethod(draft, methodId);
});

function opWord(op: { op: string; [k: string]: unknown }): string {
  const key = paletteKeyOf(op);
  return editPalette().find(p => p.key === key)?.label ?? op.op;
}

function partsOf(system: System): { name: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const constant of Object.values(system.constants ?? {})) {
    for (const term of constant.dice ?? []) {
      if (term.name && !seen.has(term.name)) seen.set(term.name, term.label || term.name);
    }
  }
  return [...seen].map(([name, label]) => ({ name, label }));
}

export function AdvantagePalette({ system, editSystem, onAdded }: {
  system: System;
  editSystem: EditSystem;
  onAdded: () => void;
}) {
  return (
    <div className="palette">
      {ADVANTAGE_METHODS.map(method => {
        const already = method.recipes.every(recipe => Boolean(system.roll_edits?.[recipe.key]));
        const first = method.examples[0];
        const shut = already || !method.implemented;
        return (
          <button
            key={method.id}
            type="button"
            className="card card--pick"
            disabled={shut}
            title="Готовая пара правок: приедет в раздел «Правки броска» со всеми словами"
            onClick={() => { addFromCatalog(editSystem, method.id); onAdded(); }}
          >
            <span className="card__title">{method.label}</span>
            <span className="card__sub">
              {!method.implemented ? 'пока нет'
                : already ? 'уже в системе'
                  : first ? `${first.system}: ${first.example}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const NUMBER_KEYS = ['n', 'by', 'sides', 'least'] as const;

export const numberKeyOf = (op: Record<string, unknown>): string | null =>
  NUMBER_KEYS.find(key => key in op) ?? (op.op === 'bonusDie' ? 'sides' : op.op === 'floorDie' ? 'least' : null);

function OpChip({ op, parts, onNumber, onCount, onPart, onRemove }: {
  op: Record<string, unknown>;
  parts: { name: string; label: string }[];
  onNumber: (value: number) => void;
  onCount: (value: Bound | null) => void;
  onPart: (part: string) => void;
  onRemove: () => void;
}) {
  const numeric = numberKeyOf(op);

  const askPart = parts.length > 0 && PART_ABLE.includes(String(op.op));
  return (
    <span className="chip">
      {opWord(op as { op: string })}
      {numeric ? (
        <ChipNum value={Number(op[numeric] ?? 0)} onCommit={onNumber} />
      ) : null}
      {op.op === 'addDie' ? (
        <span className="chip__count"><BoundField value={op.count ?? 1} placeholder="сколько" onChange={onCount} /></span>
      ) : null}
      {askPart ? (
        <select
          className="chip__part"
          aria-label="чему именно"
          value={String(op.part ?? '')}
          onChange={e => onPart(e.target.value)}
        >
          <option value="">всему броску</option>
          {parts.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
        </select>
      ) : null}
      <button className="chip__x" type="button" title="убрать" onClick={onRemove}>×</button>
    </span>
  );
}

export function RollEditsSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.roll_edits ?? {});
  const palette = editPalette();
  const parts = partsOf(system);

  return (
    <Card>
      <CardHead
        title="Правки броска"
        sub="Преимущество, помеха и всё, что меняет бросок. Здесь только ЧТО это значит; когда включается — говорит эффект."
        actions={<Button size="sm" onClick={() => addRollEdit(editSystem)}>+ правка</Button>}
      />
      {entries.length === 0 ? (
        <span className="faint">
          Правок нет — броски идут как есть. Заведите свою: «Преимущество»,
          «Фора», «Ускорение» — как это зовётся в вашем мире. Или возьмите готовую пару справа.
        </span>
      ) : (
        <div className="stack">
          {entries.map(([key, edit]) => {
            const inUse = isUsed(usage, 'rollEdit', key);
            const ops = edit.ops ?? [];
            const counter = edit.canceledBy ? entries.find(([k]) => k === edit.canceledBy)?.[1] : null;
            return (
              <div key={key} className="dict-block">
                <div className="dict-row">
                  <Input
                    value={edit.label ?? ''}
                    placeholder="как это зовётся в вашем мире"
                    onChange={label => editSystem(draft => {
                      const cur = draft.roll_edits?.[key];
                      if (cur) cur.label = label;
                    })}
                  />
                  <Button
                    size="sm" variant="danger" disabled={inUse}
                    title={inUse ? 'правка используется эффектом' : undefined}
                    onClick={() => editSystem(draft => {
                      delete draft.roll_edits?.[key];

                      for (const other of Object.values(draft.roll_edits ?? {})) {
                        if (other.canceledBy === key) delete other.canceledBy;
                      }
                    })}
                  >
                    Убрать
                  </Button>
                </div>

                <Readback segments={editReadback(edit, system)} />

                <div className="dict-row dict-row--wrap">
                  <span className="dict-row__label">Что делает</span>
                  {ops.map((op, i) => (
                    <OpChip
                      key={i}
                      op={op}
                      parts={parts}
                      onNumber={value => editSystem(draft => {
                        const target = draft.roll_edits?.[key]?.ops?.[i] as Record<string, unknown> | undefined;
                        const field = target ? numberKeyOf(target) : null;
                        if (target && field) target[field] = value;
                      })}
                      onCount={value => editSystem(draft => {
                        const target = draft.roll_edits?.[key]?.ops?.[i] as Record<string, unknown> | undefined;
                        if (!target) return;
                        if (value === null || value === 1) delete target.count; else target.count = value;
                      })}
                      onPart={part => editSystem(draft => {
                        const target = draft.roll_edits?.[key]?.ops?.[i];
                        if (!target) return;
                        if (part) target.part = part; else delete target.part;
                      })}
                      onRemove={() => editSystem(draft => {
                        draft.roll_edits?.[key]?.ops?.splice(i, 1);
                      })}
                    />
                  ))}
                  <Select
                    value=""
                    options={[['', '+ добавить…'],
                      ...palette.map(p => [p.key, p.label] as const)] as never}
                    onChange={pick => {
                      if (!pick) return;
                      const chosen = palette.find(p => p.key === pick);
                      if (!chosen) return;
                      editSystem(draft => {
                        const edit = draft.roll_edits?.[key];
                        if (!edit) return;
                        edit.ops ??= [];
                        edit.ops.push(JSON.parse(JSON.stringify(chosen.op)));
                      });
                    }}
                  />
                </div>

                <Fold
                  title="Гашение"
                  summary={counter ? `гасится: ${counter.label || edit.canceledBy}` : 'ничем — складывается'}
                >
                  <div className="dict-row">
                    <span className="dict-row__label">Гасится</span>
                    <Select
                      value={String(edit.canceledBy ?? '')}
                      options={[['', '— ничем, складывается —'],
                        ...entries.filter(([k]) => k !== key).map(([k, e]) => [k, e.label || k] as const),
                      ] as never}
                      onChange={other => editSystem(draft => {
                        const dict = draft.roll_edits;
                        const cur = dict?.[key];
                        if (!dict || !cur) return;

                        if (cur.canceledBy && dict[cur.canceledBy]?.canceledBy === key) {
                          delete dict[cur.canceledBy]!.canceledBy;
                        }
                        if (other) {
                          cur.canceledBy = other;
                          dict[other]!.canceledBy = key;
                        } else {
                          delete cur.canceledBy;
                        }
                      })}
                    />
                  </div>
                </Fold>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ChipNum({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="chip__num"
      aria-label="сколько"
      value={draft ?? String(value)}
      onChange={e => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (Number.isFinite(n) && e.target.value.trim() !== '') onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
