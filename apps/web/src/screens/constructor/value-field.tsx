import { useMemo, useState } from 'react';
import type { SlotRef } from '@vtt/schema';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { BarOption } from '../../store/formula-bar.ts';
import { outputRefs, inputBadges } from './slots.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';
import { writeTableCall, readableFields, rowTables, walkColumns } from '@vtt/engine';

export function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return String(value);
  const r = value as Record<string, unknown>;
  return 'expr' in r ? String(r.expr) : null;
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
  return `${m[1] ? Number(m[1]) : 1}d${Number(m[2])}`;
}

export interface SlotOption {
  group: string;
  label: string;
  name?: string;
  formula?: string;
  synthetic?: boolean;
  onPick?: () => void;
}

const tableOptions = (ctx: SlotContext, table: string, column: string): (Pick<SlotOption, 'name' | 'formula'> & { label?: string })[] => {
  const props = ctx.recordKind?.columns ?? [];
  const chosen = props.filter(p => (p as { kind?: string }).kind === 'choice' && (p as { from?: string }).from === table);
  if (chosen.length) {
    const said = walkColumns(ctx.system, table, [column]);
    const label = said.ok ? said.label : column;
    return chosen.map(prop => ({ name: `${prop.key}.${column}`, label: `${prop.label ?? prop.key} → ${label}` }));
  }
  const by = props[0];
  if (!by) return [];
  return [{ formula: writeTableCall({ table, arg: `@${by.key}`, column }) }];
};

export function optionsFor(ctx: SlotContext, allow: SlotKind[] | undefined): SlotOption[] {
  const ok = (kind: SlotKind) => !allow || allow.includes(kind);
  const out: SlotOption[] = [];
  if (ok('prop')) {
    for (const p of ctx.recordKind?.columns ?? []) out.push({ group: 'Свойства записи', label: p.label ?? p.key, name: p.key });
  }
  if (ok('param')) {
    for (const p of ctx.effect.params ?? []) out.push({ group: 'Входы эффекта', label: p.label ?? p.key, name: p.key });
  }
  if (ok('table')) {
    for (const [key, table] of rowTables(ctx.system)) {
      const name = table.label || key;
      for (const column of table.columns ?? []) {
        for (const found of tableOptions(ctx, key, column.key)) out.push({ group: 'По таблице', ...found, label: found.label ?? `«${name}» → ${column.label || column.key}` });
      }
    }
  }
  if (ok('ref')) {
    for (const o of outputRefs(ctx.earlier)) out.push({ group: 'Результаты шагов', label: o.label, name: o.ref });
  }
  if (ok('tag')) {
    const sheets = [...(ctx.sheets ?? new Map<string, string>())];
    for (const f of readableFields(ctx.system)) {
      if (!sheets.length) { out.push({ group: 'Поля', label: f.label ?? f.tag, name: f.tag }); continue; }
      for (const [name, label] of sheets) out.push({ group: `Поля: ${label}`, label: f.label ?? f.tag, name: `${name}.${f.tag}` });
    }
  }
  return out;
}

export function ValueField({ value, onChange, context, allow, placeholder, extraOptions, dice, onCreateParam, where = 'значение' }: {
  value: unknown;
  onChange: (next: SlotRef | null) => void;
  context: SlotContext;
  allow?: SlotKind[];
  placeholder?: string;
  extraOptions?: SlotOption[];
  dice?: boolean;
  onCreateParam?: () => string;
  where?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const options = useMemo(() => {
    const base = [...(extraOptions ?? []), ...optionsFor(context, allow)];
    return onCreateParam ? [{ group: 'Входы эффекта', label: 'новый вход…', synthetic: true } as SlotOption, ...base] : base;
  }, [context, allow, extraOptions, onCreateParam]);

  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const option of options) if (option.name && !out.has(option.name)) out.set(option.name, option.label);
    for (const [key, label] of context.names ?? []) if (!out.has(key)) out.set(key, label);
    return out;
  }, [options, context.names]);

  const menu = useMemo((): BarOption[] => options.map(option => ({
    group: option.group,
    label: option.label,
    ...(option.name ? { name: option.name } : {}),
    onPick: (insert, bar) => {
      if (option.onPick) { setDraft(null); bar.dismiss(); option.onPick(); return; }
      if (option.synthetic && onCreateParam) { bar.write(insert(`@${onCreateParam()}`)); return; }
      if (option.formula) { bar.write(insert(option.formula)); return; }
      if (option.name) bar.write(insert(`@${option.name}`));
    },
  })), [options, onCreateParam]);

  const initial = asText(value) ?? '';

  const commitTyped = (text: string) => {
    setDraft(null);
    const trimmed = text.trim();
    if (!trimmed) { onChange(null); return; }
    const grown = grownFrom(value, text);
    if (grown) { onChange(grown); return; }
    const diced = dice ? normalizeDice(trimmed) : null;
    onChange({ expr: diced !== null ? `"${diced}"` : trimmed });
  };

  return (
    <div className="slot">
      <FormulaField
        value={draft ?? initial}
        system={context.system}
        where={where}
        {...(context.sheets ? { sheets: context.sheets } : {})}
        extraNames={names}
        badges={inputBadges(context)}
        options={menu}
        placeholder={placeholder ?? 'число или формула — начните набирать название'}
        barValue={draft ?? initial}
        onChange={next => setDraft(next)}
        onCommit={commitTyped}
        onCancel={() => setDraft(null)}
      />
    </div>
  );
}
