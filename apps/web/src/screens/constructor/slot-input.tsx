import { useMemo, useState } from 'react';
import type { SlotRef } from '@vtt/schema';
import { labelOfTag } from '../../ui/formula.tsx';
import { dieWord, readingWord } from './readback.ts';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { BarOption } from '../../store/formula-bar.ts';
import { outputRefs, declaredProps, inputBadges } from './slots.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';
import { asDice } from '../../words.ts';
import { SENDER, RECEIVER, owned } from '@vtt/engine/engine/owners';
import { writeTableCall } from '@vtt/engine/model/amounts';
import { fieldsOf, hasField } from '@vtt/engine/model/sheet-columns';
import { rowTables } from '@vtt/engine/model/tables';

export type Keep = 'const' | 'param' | 'prop' | 'tag' | 'constant';

export function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return String(value);
  const r = value as Record<string, unknown>;
  if ('expr' in r) return String(r.expr);
  if ('const' in r) return String(r.const);
  if ('tag' in r) return `@${String(r.tag)}`;
  if ('prop' in r) return `@${String(r.prop)}`;
  if ('param' in r) return `@${String(r.param)}`;
  return null;
}

export function grownFrom(value: unknown, typed: string): SlotRef | null {
  const added = typed.trim();
  if (!added || !/^[+\-*/]/.test(added)) return null;
  const already = asText(value);
  if (!already) return null;
  return { expr: `${already} ${added}`.replace(/\s+/g, ' ').trim() };
}

export function normalizeDice(text: string): string | null {
  const m = /^(\d+)?\s*[dдк]\s*(\d+)$/i.exec(text.trim());
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  return `${count}d${sides}`;
}

export function chipOf(ref: unknown, ctx: SlotContext): { label: string; record: boolean } | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Record<string, unknown>;
  if ('tag' in r) return { label: labelOfTag(ctx.system, String(r.tag)), record: false };
  if ('param' in r) {
    const declared = ctx.effect.params?.find(p => p.key === r.param);
    return { label: declared?.label ?? String(r.param), record: true };
  }
  if ('prop' in r) {
    const key = String(r.prop);
    const own = ctx.recordKind?.columns?.find(p => p.key === key);
    return { label: own?.label ?? declaredProps(ctx.system).get(key) ?? key, record: true };
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

  name?: string;

  ref?: SlotRef;
  synthetic?: boolean;

  onPick?: () => void;
}

const tableOption = (ctx: SlotContext, table: string, column: string): Pick<SlotOption, 'name' | 'ref'> | null => {
  const props = ctx.recordKind?.columns ?? [];
  const chosen = props.find(p => (p as { kind?: string }).kind === 'choice' && (p as { from?: string }).from === table);
  if (chosen) return { name: `${chosen.key}.${column}` };
  const by = props[0];
  if (!by) return null;
  return { ref: { expr: writeTableCall({ table, arg: `@${by.key}`, column }) } };
};

export function optionsFor(ctx: SlotContext, allow: SlotKind[] | undefined, keep: readonly Keep[], side?: 'self' | 'target'): SlotOption[] {
  const ok = (kind: SlotKind) => !allow || allow.includes(kind);
  const out: SlotOption[] = [];
  if (ok('prop')) {
    for (const p of ctx.recordKind?.columns ?? []) {
      out.push({ group: 'Свойства записи', label: p.label ?? p.key, name: p.key, ...(keep.includes('prop') ? { ref: { prop: p.key } } : {}) });
    }
  }
  if (ok('param')) {
    for (const p of ctx.effect.params ?? []) {
      out.push({ group: 'Входы эффекта', label: p.label ?? p.key, name: p.key, ...(keep.includes('param') ? { ref: { param: p.key } } : {}) });
    }
  }
  if (ok('table')) {
    for (const [key, table] of rowTables(ctx.system)) {
      const name = table.label || key;
      for (const column of table.columns ?? []) {
        const found = tableOption(ctx, key, column.key);
        if (found) out.push({ group: 'По таблице', label: `«${name}» → ${column.label || column.key}`, ...found });
      }
    }
  }
  if (ok('ref')) {
    for (const o of outputRefs(ctx.earlier)) out.push({ group: 'Результаты шагов', label: o.label, name: o.ref });
  }
  if (ok('tag')) {
    for (const f of fieldsOf(ctx.system)) {
      out.push(keep.includes('tag')
        ? { group: 'Поля листа', label: f.label ?? f.tag, name: f.tag, ref: { tag: f.tag } }
        : { group: side === 'target' ? 'Поля цели' : 'Поля листа', label: f.label ?? f.tag, name: side === 'target' ? owned(RECEIVER, f.tag) : f.tag });
    }
  }
  if (ok('constant')) {
    for (const [key, c] of Object.entries(ctx.system.constants ?? {})) {
      out.push({ group: 'Кости', label: c.label ?? key, name: key, ...(keep.includes('constant') ? { ref: { constant: key } } : {}) });
    }
  }
  return out;
}

const structuredName = (ref: unknown): string | null => {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Record<string, unknown>;
  for (const key of ['tag', 'param', 'prop', 'constant'] as const) if (key in r && r[key]) return String(r[key]);
  return null;
};

export function SlotInput({ value, onChange, context, allow, keep = [], placeholder, extraOptions, dice, side, onCreateFromRecord, where = 'значение' }: {
  value: unknown;
  onChange: (next: SlotRef | null) => void;
  context: SlotContext;
  allow?: SlotKind[];

  keep?: readonly Keep[];
  placeholder?: string;

  extraOptions?: SlotOption[];

  dice?: boolean;

  side?: 'self' | 'target';

  onCreateFromRecord?: () => SlotRef;

  where?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [picked] = useState(() => new Map<string, SlotRef>());
  const options = useMemo(() => {
    const base = [...(extraOptions ?? []), ...optionsFor(context, allow, keep, side)];
    if (!onCreateFromRecord) return base;
    const born: SlotOption = { group: 'Входы эффекта', label: 'новый вход…', synthetic: true };
    return [born, ...base];
  }, [context, allow, keep, side, extraOptions, onCreateFromRecord]);

  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const option of options) {
      if (option.synthetic || !option.name || out.has(option.name)) continue;
      out.set(option.name, option.label);
    }
    return out;
  }, [options]);

  const menu = useMemo((): BarOption[] => options.map(option => ({
    group: option.group,
    label: option.label,
    ...(option.synthetic || !option.name ? {} : { name: option.name }),
    onPick: (insert, bar) => {
      if (option.onPick) {
        setDraft(null);
        bar.dismiss();
        option.onPick();
        return;
      }
      const ref = option.synthetic && onCreateFromRecord ? onCreateFromRecord() : option.ref;
      const name = option.synthetic ? structuredName(ref) : option.name;
      if (!name) {
        setDraft(null);
        bar.dismiss();
        if (ref) onChange(ref);
        return;
      }
      if (ref) picked.set(name, ref);
      bar.write(insert(`@${name}`));
    },
  })), [options, onChange, onCreateFromRecord, picked]);

  const own = structuredName(value);
  const shownByName = own !== null && (names.has(own) || hasField(context.system, own));
  const chip = draft === null && !shownByName ? chipOf(value, context) : null;
  const initial = chip ? '' : value && typeof value === 'object' && 'const' in value && dice
    ? asDice(String((value as { const: unknown }).const ?? ''))
    : asText(value) ?? '';

  const commitTyped = (text: string) => {
    setDraft(null);
    const exact = /^\s*[@#]([\p{L}\p{N}_.]+)\s*$/u.exec(text)?.[1];
    const named = exact
      ? picked.get(exact) ?? options.find(option => option.ref && option.name === exact)?.ref
      : undefined;
    picked.clear();
    if (named) { onChange(named); return; }
    const trimmed = text.trim();
    if (!trimmed) { onChange(null); return; }
    const grown = grownFrom(value, text);
    if (grown) { onChange(grown); return; }
    const diced = dice ? normalizeDice(trimmed) : null;
    if (diced !== null) { onChange({ const: diced }); return; }
    if (keep.includes('const') && /^-?\d+(\.\d+)?$/.test(trimmed)) { onChange({ const: Number(trimmed) }); return; }
    if (keep.includes('const') && !trimmed.startsWith('@') && !/[()+\-*/<>=@#]/.test(trimmed)) { onChange({ const: trimmed }); return; }
    onChange({ expr: trimmed });
  };

  return (
    <div className="slot">
      <FormulaField
        value={draft ?? initial}
        system={context.system}
        where={where}
        owners
        extraNames={names}
        badges={inputBadges(context)}
        options={menu}
        placeholder={chip ? undefined : (placeholder ?? 'число или формула — @ подскажет')}
        prefix={chip ? (
          <span className={`chips__chip${chip.record ? ' chips__chip--record' : ''}`}>
            {chip.label}
            {side && 'tag' in (value as object) ? <span className={`chips__side chips__side--${side === 'self' ? 'sender' : 'receiver'}`}>{side === 'self' ? SENDER : RECEIVER}</span> : null}
            <button
              type="button" className="chips__x" aria-label="убрать"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onChange(null); }}
              onClick={e => e.stopPropagation()}
            >×</button>
          </span>
        ) : null}
        barValue={draft ?? initial}
        onChange={next => setDraft(next)}
        onCommit={commitTyped}
        onCancel={() => setDraft(null)}
      />
    </div>
  );
}
