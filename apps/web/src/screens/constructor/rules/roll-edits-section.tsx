import { BoundField } from '../bound-field.tsx';
import type { Bound } from '../bound-field.tsx';
import { useState } from 'react';
import { editPalette, paletteKeyOf, fitsPlace, dieKindsOf as kindsOf, placesOf, ROLL_KIND_WORDS, ADVANTAGE_METHODS, installMethod, cancels } from '@vtt/engine';
import { editNotation, editReadback, joinReadback } from '../readback.ts';
import { Card, CardHead, Input, Button, Select } from '../../../ui/primitives.tsx';
import { RollsPick } from '../rolls-pick.tsx';
import { AddendPick } from '../effects/cards/die-pick.tsx';
import { newRollEdit } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System, RollEdit, RollEditOp } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';
import { useT, t } from '../../../i18n/author.ts';

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

function addOptions(system: System): (readonly [string, string] | readonly [string, string, string])[] {
  const palette = editPalette();
  const places = placesOf(system).filter(place => place.kind !== null);
  const kinds = kindsOf(system);
  if (!places.length) return palette.map(p => [p.key, p.label] as const);
  const out: (readonly [string, string, string])[] = [];
  const placed = new Set<string>();
  for (const kind of kinds) {
    for (const entry of palette) {
      if (!places.some(place => place.kind === kind && fitsPlace(entry.op, place))) continue;
      placed.add(entry.key);
      out.push([`${kind}:${entry.key}`, entry.label, ROLL_KIND_WORDS[kind]] as const);
    }
  }
  for (const entry of palette) if (!placed.has(entry.key)) out.push([`other:${entry.key}`, entry.label, t('rolls:edits.other')] as const);
  return out;
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
  const t = useT('rolls');
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
            title={t('edits.palette.title')}
            onClick={() => { addFromCatalog(editSystem, method.id); onAdded(); }}
          >
            <span className="card__title">{method.label}</span>
            <span className="card__sub">
              {!method.implemented ? t('edits.palette.none')
                : already ? t('edits.palette.already')
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

function OpChip({ op, system, parts, onNumber, onCount, onPart, onChange, onRemove }: {
  op: Record<string, unknown>;
  system: System;
  parts: { name: string; label: string }[];
  onNumber: (value: number) => void;
  onCount: (value: Bound | null) => void;
  onPart: (part: string) => void;
  onChange: (change: (it: Record<string, unknown>) => void) => void;
  onRemove: () => void;
}) {
  const t = useT('rolls');
  if (op.op === PLUS) {
    return (
      <span className="chip chip--formula">
        {t('edits.chip.plus')}
        <span className="chip__formula">
          <AddendPick source={op} system={system} where={t('edits.chip.plusWhere')} dieOnly onChange={onChange} />
        </span>
        <button className="chip__x" type="button" title={t('common:removeLower')} onClick={onRemove}>×</button>
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
        <span className="chip__count"><BoundField value={op.count ?? 1} placeholder={t('edits.chip.howMany')} onChange={onCount} /></span>
      ) : null}
      {op.op === 'explode' ? (
        <select
          className="chip__part"
          aria-label={t('edits.chip.howManyTimes')}
          value={Number(op.limit) === 1 ? 'once' : 'chain'}
          onChange={e => onChange(it => { if (e.target.value === 'once') it.limit = 1; else delete it.limit; })}
        >
          <option value="chain">{t('edits.chip.untilFalls')}</option>
          <option value="once">{t('edits.chip.once')}</option>
        </select>
      ) : null}
      {askPart ? (
        <select
          className="chip__part"
          aria-label={t('edits.chip.whichPart')}
          value={String(op.part ?? '')}
          onChange={e => onPart(e.target.value)}
        >
          <option value="">{t('edits.chip.wholeRoll')}</option>
          {parts.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
        </select>
      ) : null}
      <button className="chip__x" type="button" title={t('common:removeLower')} onClick={onRemove}>×</button>
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
  const t = useT('rolls');
  const ops = (edit.ops ?? []) as Record<string, unknown>[];
  const narrowed = Boolean(edit.tags?.length || edit.anyTags?.length);
  const said = ops.length ? (narrowed ? null : editNotation({ ops }, system)) ?? joinReadback(editReadback({ ops }, system)) : t('edits.word.empty');
  const opAt = (i: number) => (draft: System) => draft.roll_edits?.[wordKey]?.ops?.[i] as Record<string, unknown> | undefined;
  return (
    <div className="dict-block roll-word">
      <div className="dict-row">
        <span className="roll-word__name">
          <Input
            value={edit.label ?? ''}
            placeholder={t('edits.word.namePlaceholder')}
            onChange={label => editSystem(draft => {
              const cur = draft.roll_edits?.[wordKey];
              if (cur) cur.label = label;
            })}
          />
        </span>
        <span className={ops.length ? 'roll-word__said' : 'roll-word__said roll-word__said--hole'}>{said}</span>
        <Button
          size="sm" variant="danger" disabled={used}
          title={used ? t('edits.word.usedTitle') : undefined}
          onClick={() => editSystem(draft => {
            delete draft.roll_edits?.[wordKey];
            for (const other of Object.values(draft.roll_edits ?? {})) unlinkFrom(other, wordKey);
          })}
        >
          {t('common:remove')}
        </Button>
      </div>
      <Cancels wordKey={wordKey} edit={edit} system={system} editSystem={editSystem} />
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
            onChange={change => editSystem(draft => {
              const target = opAt(i)(draft);
              if (target) change(target);
            })}
            onRemove={() => editSystem(draft => {
              draft.roll_edits?.[wordKey]?.ops?.splice(i, 1);
            })}
          />
        ))}
        <Select
          value=""
          options={[['', t('edits.word.add')], ...addOptions(system)] as never}
          onChange={pick => {
            const chosen = editPalette().find(p => p.key === pick.slice(pick.indexOf(':') + 1));
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
      <div className="dict-row dict-row--wrap roll-line">
        <RollsPick
          system={system}
          tips
          value={{ tags: edit.tags, anyTags: edit.anyTags, notTags: edit.notTags }}
          onChange={(key, list) => editSystem(draft => {
            const cur = draft.roll_edits?.[wordKey];
            if (!cur) return;
            if (list.length) cur[key] = list; else delete cur[key];
          })}
        />
      </div>
    </div>
  );
}

function unlinkFrom(edit: RollEdit, key: string): void {
  if (!edit.cancels) return;
  edit.cancels = edit.cancels.filter(one => one !== key);
  if (!edit.cancels.length) delete edit.cancels;
}

function Cancels({ wordKey, edit, system, editSystem }: { wordKey: string; edit: RollEdit; system: System; editSystem: EditSystem }) {
  const t = useT('rolls');
  const stackWords = [['', t('edits.cancels.stackOne')], ['yes', t('edits.cancels.stackEach')]] as const;
  const onceWords = [['', t('edits.cancels.onceAll')], ['yes', t('edits.cancels.onceOne')]] as const;
  const dict = system.roll_edits ?? {};
  const name = (key: string): string => dict[key]?.label || key;
  const linked = Object.keys(dict).filter(other => cancels(dict, wordKey, other));
  const dangling = (edit.cancels ?? []).filter(other => !dict[other]);
  const free = Object.keys(dict).filter(other => other !== wordKey && !linked.includes(other));
  const unlink = (other: string) => editSystem(draft => {
    const all = draft.roll_edits ?? {};
    if (all[wordKey]) unlinkFrom(all[wordKey]!, other);
    if (all[other]) unlinkFrom(all[other]!, wordKey);
  });
  const link = (other: string) => editSystem(draft => {
    const all = draft.roll_edits ?? {};
    if (!all[wordKey] || !all[other]) return;
    all[wordKey]!.cancels = [...new Set([...(all[wordKey]!.cancels ?? []), other])];
    all[other]!.cancels = [...new Set([...(all[other]!.cancels ?? []), wordKey])];
  });
  return (
    <div className="dict-row dict-row--wrap roll-line">
      <span className="dict-row__label">{t('edits.cancels.label')}</span>
      {linked.map(other => (
        <span key={other} className="chip">
          {name(other)}
          <button className="chip__x" type="button" title={t('edits.cancels.unlink')} onClick={() => unlink(other)}>×</button>
        </span>
      ))}
      {dangling.map(other => (
        <span key={other} className="chip chip--bad">
          {t('edits.cancels.missing', { name: other })}
          <button className="chip__x" type="button" title={t('edits.cancels.dropLink')} onClick={() => unlink(other)}>×</button>
        </span>
      ))}
      {free.length ? (
        <Select value="" options={[['', t('edits.cancels.addWord')], ...free.map(other => [other, name(other)] as const)] as never}
          onChange={(other: string) => { if (other) link(other); }} />
      ) : null}
      <Select value={edit.stacks ? 'yes' : ''} options={stackWords as never} title={t('edits.cancels.stackTip')}
        onChange={(next: string) => editSystem(draft => {
          const cur = draft.roll_edits?.[wordKey];
          if (!cur) return;
          if (next) cur.stacks = true; else delete cur.stacks;
        })} />
      <Select value={edit.once ? 'yes' : ''} options={onceWords as never} title={t('edits.cancels.onceTip')}
        onChange={(next: string) => editSystem(draft => {
          const cur = draft.roll_edits?.[wordKey];
          if (!cur) return;
          if (next) cur.once = true; else delete cur.once;
        })} />
    </div>
  );
}

export function RollEditsSection({ system, editSystem, usage }: Props) {
  const t = useT('rolls');
  const entries = Object.entries(system.roll_edits ?? {});
  const parts = partsOf(system);

  return (
    <Card>
      <CardHead
        title={t('edits.section.title')}
        sub={t('edits.section.sub')}
        actions={<Button size="sm" onClick={() => addRollEdit(editSystem)}>{t('edits.section.add')}</Button>}
      />
      {entries.length === 0 ? (
        <span className="faint">{t('edits.section.empty')}</span>
      ) : (
        <div className="stack">
          {entries.map(([key, edit]) => (
            <WordRow
              key={key} wordKey={key} edit={edit} system={system} editSystem={editSystem}
              parts={parts} used={isUsed(usage, 'rollEdit', key)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ChipNum({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const t = useT('rolls');
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="chip__num"
      aria-label={t('edits.chip.howMany')}
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
