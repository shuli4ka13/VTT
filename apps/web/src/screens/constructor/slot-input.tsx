import { useMemo, useState } from 'react';
import type { System, SlotRef } from '@vtt/schema';
import { labelOfTag } from '../../ui/formula.tsx';
import { dieWord, readingWord } from './readback.ts';
import { FormulaChips } from '../../ui/formula-chips.tsx';
import { outputRefs, outputLabel, declaredProps } from './slots.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';
import { asDice } from '../../words.ts';
import { SENDER, RECEIVER } from '@vtt/engine/engine/owners';

const WORD_OF: Record<SlotKind, string> = {
  const: 'число',
  expr: 'формулу',
  tag: 'поле листа',
  constant: 'константу системы',
  prop: 'свойство записи',
  param: 'значение из записи',
  ref: 'результат шага',
  table: 'значение по таблице',
  empty: 'пусто',
};

export function asText(value: unknown, ctx: SlotContext): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return String(value);
  const r = value as Record<string, unknown>;
  if ('tag' in r) return `@${String(r.tag)}`;
  if ('prop' in r || 'item' in r) return `@${String(r.prop ?? r.item)}`;
  if ('param' in r) return `@${String(r.param)}`;
  if ('ref' in r) return `@${String(r.ref)}`;
  if ('const' in r) return String(r.const);
  if ('expr' in r) return String(r.expr);
  void ctx;
  return null;
}

export function grownFrom(value: unknown, typed: string, ctx: SlotContext): SlotRef | null {
  const added = typed.trim();
  if (!added || !/^[+\-*/]/.test(added)) return null;
  const already = asText(value, ctx);
  if (!already) return null;
  return { expr: `${already} ${added}`.replace(/\s+/g, ' ').trim() } as SlotRef;
}

export function parseTyped(text: string): SlotRef | null {
  const t = text.trim();
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return { const: Number(t) };
  return { expr: t };
}

export function singleTag(text: string, system: System): SlotRef | null {
  const m = /^[#@]([\p{L}\p{N}_]+)$/u.exec(text.trim());
  if (!m) return null;
  const tag = m[1]!;
  return system.fields.some(f => f.tag === tag) ? { tag } : null;
}

export function normalizeDice(text: string): string | null {
  const m = /^(\d+)?\s*[dдк]\s*(\d+)$/i.exec(text.trim());
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  return `${count}d${sides}`;
}

export function displayOf(ref: unknown, ctx: SlotContext): string {
  if (ref === null || ref === undefined) return '';
  if (typeof ref !== 'object') return String(ref);
  const r = ref as Record<string, unknown>;
  if ('const' in r) return asDice(String(r.const ?? ''));
  if ('expr' in r) return String(r.expr ?? '');
  if ('tag' in r) return `поле: ${labelOfTag(ctx.system, String(r.tag))}`;
  if ('param' in r) {
    const declared = ctx.effect.params?.find(p => p.key === r.param);
    return `из записи: ${declared?.label ?? String(r.param)}`;
  }
  if ('prop' in r || 'item' in r) return `из записи: ${String(r.prop ?? r.item)}`;
  if ('ref' in r) return outputLabel(String(r.ref), ctx.earlier);
  if ('constant' in r) return `кость: ${dieWord(ctx.system, String(r.constant))}`;
  return '';
}

export function chipOf(ref: unknown, ctx: SlotContext): { label: string; record: boolean } | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Record<string, unknown>;
  if ('tag' in r) return { label: labelOfTag(ctx.system, String(r.tag)), record: false };
  if ('param' in r) {
    const declared = ctx.effect.params?.find(p => p.key === r.param);
    return { label: declared?.label ?? String(r.param), record: true };
  }
  if ('prop' in r || 'item' in r) {
    const key = String(r.prop ?? r.item);
    const own = ctx.recordKind?.props?.find(p => p.key === key);
    return { label: own?.label ?? declaredProps(ctx.system).get(key) ?? key, record: true };
  }
  if ('ref' in r) return { label: outputLabel(String(r.ref), ctx.earlier), record: false };
  if ('table' in r) {
    const table = ctx.system.tables?.[String(r.table)];
    const column = (table?.columns ?? []).find(c => c.key === String(r.column ?? 'value'));
    const name = table?.label || String(r.table);
    return { label: column ? `«${name}» → ${column.label || column.key}` : `по таблице «${name}»`, record: false };
  }
  if ('constant' in r) {
    const name = String(r.constant);
    const reading = readingWord(ctx.system, name);
    const die = dieWord(ctx.system, name);
    return { label: reading ? `${die} (${reading})` : die, record: false };
  }
  return null;
}

export interface SlotOption {
  group: string;
  label: string;
  ref: SlotRef;
  synthetic?: boolean;

  onPick?: () => void;
}

export function optionsFor(ctx: SlotContext, allow?: SlotKind[]): SlotOption[] {
  const ok = (kind: SlotKind) => !allow || allow.includes(kind);
  const out: SlotOption[] = [];
  if (ok('prop')) {
    const own = ctx.recordKind?.props ?? [];
    for (const p of own) out.push({ group: 'Свойства записи', label: p.label ?? p.key, ref: { prop: p.key } });
    if (!ctx.recordKind) {
      for (const [key, label] of declaredProps(ctx.system)) out.push({ group: 'Свойства записи', label, ref: { prop: key } });
    }
  }
  if (ok('param')) {
    for (const p of ctx.effect.params ?? []) out.push({ group: 'Из записи', label: p.label ?? p.key, ref: { param: p.key } });
  }
  if (ok('table')) {
    for (const [key, table] of Object.entries(ctx.system.tables ?? {})) {
      const columns = table.columns ?? [];
      if (!columns.length) continue;
      const props = ctx.recordKind?.props ?? [];
      const by = props.find(p => (p as { from?: string }).from === key) ?? props[0];
      const name = table.label || key;
      for (const column of columns) {
        out.push({
          group: 'По таблице',
          label: `«${name}» → ${column.label || column.key}`,
          ref: { table: key, column: column.key, ...(by ? { by: { prop: by.key } } : {}) } as SlotRef,
        });
      }
    }
  }
  if (ok('ref')) {
    for (const o of outputRefs(ctx.earlier)) {
      out.push({ group: 'Результаты шагов', label: o.label, ref: { ref: o.ref } });
    }
  }
  if (ok('tag')) for (const f of ctx.system.fields) out.push({ group: 'Поля цели', label: f.label ?? f.tag, ref: { tag: f.tag } });
  if (ok('constant')) {
    for (const [key, c] of Object.entries(ctx.system.constants ?? {})) out.push({ group: 'Кости', label: c.label ?? key, ref: { constant: key } });
  }
  return out;
}

const nameOf = (ref: SlotRef): string | null => {
  const r = ref as Record<string, unknown>;
  if ('prop' in r && r.prop) return String(r.prop);
  if ('ref' in r) return String(r.ref);
  if ('tag' in r) return String(r.tag);
  if ('table' in r && r.column && r.by && typeof r.by === 'object' && 'prop' in (r.by as object)) {
    return `${String((r.by as { prop: unknown }).prop)}.${String(r.column)}`;
  }
  return null;
};

export function SlotInput({ value, onChange, context, allow, placeholder, extraOptions, dice, side, onCreateFromRecord }: {
  value: unknown;
  onChange: (next: SlotRef | null) => void;
  context: SlotContext;
  allow?: SlotKind[];
  placeholder?: string;

  extraOptions?: SlotOption[];

  dice?: boolean;

  side?: 'self' | 'target';

  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const options = useMemo(() => {
    const base = [...(extraOptions ?? []), ...optionsFor(context, allow)];
    if (!onCreateFromRecord) return base;
    const born: SlotOption = { group: 'Из записи', label: 'из записи → новая потребность…', ref: { param: '' }, synthetic: true };
    return [born, ...base];
  }, [context, allow, extraOptions, onCreateFromRecord]);

  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const option of options) {
      const name = option.synthetic ? null : nameOf(option.ref);
      if (name && !out.has(name)) out.set(name, option.label);
    }
    return out;
  }, [options]);

  const menu = useMemo(() => options.map(option => ({
    group: option.group,
    label: option.label,
    ...(option.synthetic ? {} : { name: nameOf(option.ref) ?? undefined }),
    onPick: (insert: (piece: string) => string) => {
      const rest = insert('').trim();
      const name = option.synthetic ? null : nameOf(option.ref);
      if (!rest || !name) {
        setDraft(null);
        setTrouble(null);
        if (option.onPick) option.onPick();
        else onChange(option.synthetic && onCreateFromRecord ? onCreateFromRecord() : option.ref);
        return;
      }
      setDraft(insert(`@${name}`));
    },
  })), [options, onChange, onCreateFromRecord]);

  const chip = draft === null ? chipOf(value, context) : null;
  const shown = chip ? '' : (draft ?? displayOf(value, context));

  const commitTyped = () => {
    if (draft === null) return;
    const grown = grownFrom(value, draft, context);
    if (grown) {
      onChange(grown);
      setDraft(null);
      setTrouble(null);
      return;
    }
    const diced = dice ? normalizeDice(draft) : null;
    const tagged = singleTag(draft, context.system);
    const candidate: SlotRef | null = tagged
      ?? (diced !== null ? { const: diced } : parseTyped(draft));
    if (candidate !== null && allow) {
      const kind: SlotKind = tagged ? 'tag' : 'const' in candidate ? 'const' : 'expr';
      if (!allow.includes(kind)) {
        setTrouble(`сюда нельзя ${WORD_OF[kind]} — только ${allow.map(k => WORD_OF[k]).join(', ')}`);
        setDraft(null);
        return;
      }
    }
    onChange(candidate);
    setDraft(null);
    setTrouble(null);
  };

  return (
    <div className="slot">
      <FormulaChips
        value={shown}
        system={context.system}
        owners
        extraNames={names}
        extraOptions={menu}
        placeholder={chip ? undefined : (placeholder ?? 'число или формула — @ подскажет')}
        prefix={chip ? (
          <span className={`chips__chip${chip.record ? ' chips__chip--record' : ''}`}>
            {chip.label}
            {side ? <span className={`chips__side chips__side--${side === 'self' ? 'sender' : 'receiver'}`}>{side === 'self' ? SENDER : RECEIVER}</span> : null}
            <button
              type="button" className="chips__x" aria-label="убрать"
              onMouseDown={e => { e.preventDefault(); onChange(null); }}
            >×</button>
          </span>
        ) : null}
        onFocus={() => setTrouble(null)}
        onChange={next => setDraft(next)}
        onBlur={commitTyped}
        onKeyDown={e => {
          if (e.key === 'Enter') commitTyped();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </div>
  );
}
