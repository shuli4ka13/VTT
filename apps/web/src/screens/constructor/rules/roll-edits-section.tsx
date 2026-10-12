import { BoundField } from '../bound-field.tsx';
import type { Bound } from '../bound-field.tsx';
import { useState } from 'react';
import { editPalette, paletteKeyOf } from '@vtt/engine/engine/roll-edits';
import { ADVANTAGE_METHODS, installMethod } from '@vtt/engine/model/advantage-methods';
import { editNotation, editReadback, joinReadback } from '../readback.ts';
import { Card, CardHead, Input, Button, Select } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { DICE_BAR_OPTION, DICE_HINT } from '../value-field.tsx';
import { newRollEdit } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System, RollEdit, RollEditOp } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const PART_ABLE = ['addDie', 'keepBest', 'keepWorst', 'dieStep', 'explode', 'flip', 'reroll'];

const PLUS = 'plus';

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

const templateOf = (op: Record<string, unknown>): Record<string, unknown> =>
  (editPalette().find(entry => entry.key === paletteKeyOf(op as RollEditOp))?.op ?? {}) as Record<string, unknown>;

export const numberKeyOf = (op: Record<string, unknown>): string | null =>
  NUMBER_KEYS.find(key => key in op) ?? NUMBER_KEYS.find(key => key in templateOf(op)) ?? null;

const exprOf = (value: unknown): string =>
  (value && typeof value === 'object' && 'expr' in value ? String((value as { expr: unknown }).expr ?? '') : '');

function OpChip({ op, system, parts, onNumber, onCount, onPart, onFormula, onRemove }: {
  op: Record<string, unknown>;
  system: System;
  parts: { name: string; label: string }[];
  onNumber: (value: number) => void;
  onCount: (value: Bound | null) => void;
  onPart: (part: string) => void;
  onFormula: (expr: string) => void;
  onRemove: () => void;
}) {
  if (op.op === PLUS) {
    return (
      <span className="chip chip--formula">
        прибавить
        <span className="chip__formula">
          <FormulaField
            value={exprOf(op.value)}
            system={system}
            where="правка броска · прибавить"
            placeholder={DICE_HINT}
            options={[DICE_BAR_OPTION]}
            onCommit={text => onFormula(text.trim())}
          />
        </span>
        <button className="chip__x" type="button" title="убрать" onClick={onRemove}>×</button>
      </span>
    );
  }
  const numeric = numberKeyOf(op);
  const askPart = parts.length > 0 && PART_ABLE.includes(String(op.op));
  return (
    <span className="chip">
      {opWord(op as { op: string })}
      {numeric ? (
        <ChipNum value={Number(op[numeric] ?? templateOf(op)[numeric] ?? 0)} onCommit={onNumber} />
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

function WordRow({ wordKey, edit, system, editSystem, parts, used }: {
  wordKey: string;
  edit: RollEdit;
  system: System;
  editSystem: EditSystem;
  parts: { name: string; label: string }[];
  used: boolean;
}) {
  const ops = (edit.ops ?? []) as Record<string, unknown>[];
  const said = ops.length ? editNotation({ ops }, system) ?? joinReadback(editReadback({ ops }, system)) : 'что она делает с броском?';
  const opAt = (i: number) => (draft: System) => draft.roll_edits?.[wordKey]?.ops?.[i] as Record<string, unknown> | undefined;
  return (
    <div className="dict-block roll-word">
      <div className="dict-row">
        <span className="roll-word__name">
          <Input
            value={edit.label ?? ''}
            placeholder="как это зовётся в вашем мире"
            onChange={label => editSystem(draft => {
              const cur = draft.roll_edits?.[wordKey];
              if (cur) cur.label = label;
            })}
          />
        </span>
        <span className={ops.length ? 'roll-word__said' : 'roll-word__said roll-word__said--hole'}>{said}</span>
        <Button
          size="sm" variant="danger" disabled={used}
          title={used ? 'правка используется эффектом' : undefined}
          onClick={() => editSystem(draft => {
            delete draft.roll_edits?.[wordKey];
            for (const other of Object.values(draft.roll_edits ?? {})) {
              if (other.canceledBy === wordKey) delete other.canceledBy;
            }
          })}
        >
          Убрать
        </Button>
      </div>
      <div className="dict-row dict-row--wrap roll-word__ops">
        {ops.map((op, i) => (
          <OpChip
            key={i}
            op={op}
            system={system}
            parts={parts}
            onNumber={value => editSystem(draft => {
              const target = opAt(i)(draft);
              const field = target ? numberKeyOf(target) : null;
              if (target && field) target[field] = value;
            })}
            onCount={value => editSystem(draft => {
              const target = opAt(i)(draft);
              if (!target) return;
              if (value === null || value === 1) delete target.count; else target.count = value;
            })}
            onPart={part => editSystem(draft => {
              const target = opAt(i)(draft);
              if (!target) return;
              if (part) target.part = part; else delete target.part;
            })}
            onFormula={expr => editSystem(draft => {
              const target = opAt(i)(draft);
              if (target) target.value = { expr };
            })}
            onRemove={() => editSystem(draft => {
              draft.roll_edits?.[wordKey]?.ops?.splice(i, 1);
            })}
          />
        ))}
        <Select
          value=""
          options={[['', '+ добавить…'], ...editPalette().map(p => [p.key, p.label] as const)] as never}
          onChange={pick => {
            const chosen = editPalette().find(p => p.key === pick);
            if (!chosen) return;
            editSystem(draft => {
              const cur = draft.roll_edits?.[wordKey];
              if (!cur) return;
              cur.ops ??= [];
              cur.ops.push(JSON.parse(JSON.stringify(chosen.op)));
            });
          }}
        />
      </div>
    </div>
  );
}

function Pairs({ entries, editSystem }: { entries: [string, RollEdit][]; editSystem: EditSystem }) {
  const name = (key: string): string => entries.find(([k]) => k === key)?.[1].label || key;
  const pairs = new Map<string, [string, string]>();
  for (const [key, edit] of entries) {
    if (!edit.canceledBy || !entries.some(([k]) => k === edit.canceledBy)) continue;
    const pair = [key, edit.canceledBy].sort() as [string, string];
    pairs.set(pair.join('\u0000'), pair);
  }
  const free = entries.filter(([key, edit]) => !edit.canceledBy && ![...pairs.values()].some(pair => pair.includes(key))).map(([key]) => key);
  const offers = free.flatMap((a, i) => free.slice(i + 1).map(b => [`${a}\u0000${b}`, `«${name(a)}» ⟷ «${name(b)}»`] as const));
  if (!pairs.size && !offers.length) return null;
  const link = (a: string, b: string | null) => editSystem(draft => {
    const dict = draft.roll_edits;
    if (!dict?.[a]) return;
    const was = dict[a]!.canceledBy;
    if (was && dict[was]?.canceledBy === a) delete dict[was]!.canceledBy;
    if (b && dict[b]) {
      dict[a]!.canceledBy = b;
      dict[b]!.canceledBy = a;
    } else {
      delete dict[a]!.canceledBy;
    }
  });
  return (
    <div className="dict-row dict-row--wrap roll-pairs">
      <span className="dict-row__label">Гасят друг друга</span>
      {[...pairs.values()].map(([a, b]) => (
        <span key={`${a}\u0000${b}`} className="chip">
          «{name(a)}» ⟷ «{name(b)}»
          <button className="chip__x" type="button" title="больше не гасят друг друга" onClick={() => link(a, null)}>×</button>
        </span>
      ))}
      {offers.length ? (
        <Select
          value=""
          options={[['', '+ пара…'], ...offers] as never}
          onChange={pick => {
            const [a, b] = pick.split('\u0000');
            if (a && b) link(a, b);
          }}
        />
      ) : null}
    </div>
  );
}

export function RollEditsSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.roll_edits ?? {});
  const parts = partsOf(system);

  return (
    <Card>
      <CardHead
        title="Правки броска"
        sub="Слова правил: что значит «с преимуществом», «с помехой». Включает их эффект или заявка за столом. Прибавку одного эффекта («+ к4») пишут в самом эффекте."
        actions={<Button size="sm" onClick={() => addRollEdit(editSystem)}>+ правка</Button>}
      />
      {entries.length === 0 ? (
        <span className="faint">
          Правок нет — броски идут как есть. Заведите своё слово: «Преимущество»,
          «Фора», «Ускорение» — как это зовётся в вашем мире. Или возьмите готовую пару справа.
        </span>
      ) : (
        <div className="stack">
          {entries.map(([key, edit]) => (
            <WordRow
              key={key} wordKey={key} edit={edit} system={system} editSystem={editSystem}
              parts={parts} used={isUsed(usage, 'rollEdit', key)}
            />
          ))}
          <Pairs entries={entries} editSystem={editSystem} />
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
