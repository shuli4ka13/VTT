import { useMemo, useState } from 'react';
import type { System, SlotRef } from '@vtt/schema';
import { Select } from '../../ui/primitives.tsx';
import { labelOfTag } from '../../ui/formula.tsx';
import { dieWord, readingWord } from './readback.ts';
import { FormulaChips } from '../../ui/formula-chips.tsx';
import { matchTagQuery } from '../../ui/tag-suggest.tsx';
import { outputRefs, outputLabel } from './slots.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';
import { asDice } from '../../words.ts';

const WORD_OF: Record<SlotKind, string> = {
  const: 'число',
  expr: 'формулу',
  tag: 'поле листа',
  constant: 'константу системы',
  prop: 'свойство записи',
  param: 'значение из записи',
  ref: 'результат шага',
  empty: 'пусто',
};

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
  if ('prop' in r || 'item' in r) return { label: String(r.prop ?? r.item), record: true };
  if ('ref' in r) return { label: outputLabel(String(r.ref), ctx.earlier), record: false };
  if ('constant' in r) {
    const name = String(r.constant);
    const reading = readingWord(ctx.system, name);
    const die = dieWord(ctx.system, name);
    return { label: reading ? `${die} (${reading})` : die, record: false };
  }
  return null;
}

export interface SlotOption { group: string; label: string; ref: SlotRef; synthetic?: boolean }

export function optionsFor(ctx: SlotContext, allow?: SlotKind[]): SlotOption[] {
  const ok = (kind: SlotKind) => !allow || allow.includes(kind);
  const out: SlotOption[] = [];
  if (ok('param')) {
    for (const p of ctx.effect.params ?? []) out.push({ group: 'Из записи', label: p.label ?? p.key, ref: { param: p.key } });
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
  const [open, setOpen] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const options = useMemo(() => {
    const base = [...(extraOptions ?? []), ...optionsFor(context, allow)];
    if (!onCreateFromRecord) return base;
    let insertAt = 0;
    base.forEach((option, i) => { if (option.group === 'Из записи') insertAt = i + 1; });
    const born: SlotOption = { group: 'Из записи', label: 'из записи → новая потребность…', ref: { param: '' }, synthetic: true };
    return [...base.slice(0, insertAt), born, ...base.slice(insertAt)];
  }, [context, allow, extraOptions, onCreateFromRecord]);

  const chip = draft === null ? chipOf(value, context) : null;
  const shown = chip ? '' : (draft ?? displayOf(value, context));
  const needle = (draft ?? '').toLowerCase();
  const filtered = needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options;

  const typingTag = matchTagQuery(draft ?? '', (draft ?? '').length) !== null;

  const commitTyped = () => {
    if (draft !== null) {
      const diced = dice ? normalizeDice(draft) : null;
      const tagged = singleTag(draft, context.system);
      const candidate: SlotRef | null = tagged
        ?? (diced !== null ? { const: diced } : parseTyped(draft));
      if (candidate !== null && allow) {
        const kind: SlotKind = tagged ? 'tag' : 'const' in candidate ? 'const' : 'expr';
        if (!allow.includes(kind)) {
          setTrouble(`сюда нельзя ${WORD_OF[kind]} — только ${allow.map(k => WORD_OF[k]).join(', ')}`);
          setDraft(null);
          setOpen(false);
          return;
        }
      }
      onChange(candidate);
      setDraft(null);
      setTrouble(null);
    }
    setOpen(false);
  };

  return (
    <div className="slot">
      {}
      <FormulaChips
        value={shown}
        system={context.system}
        side={side}
        placeholder={chip ? undefined : (placeholder ?? 'число или формула')}
        prefix={chip ? (
          <span className={`chips__chip${chip.record ? ' chips__chip--record' : ''}`}>
            {chip.label}
            {side ? <span className="chips__side">{side === 'self' ? 'у себя' : 'у цели'}</span> : null}
            <button
              type="button" className="chips__x" aria-label="убрать"
              onMouseDown={e => { e.preventDefault(); onChange(null); }}
            >×</button>
          </span>
        ) : null}
        onFocus={() => { setOpen(true); setTrouble(null); }}
        onChange={next => { setDraft(next); setOpen(true); }}
        onBlur={commitTyped}
        onKeyDown={e => {
          if (e.key === 'Enter') commitTyped();
          if (e.key === 'Escape') { setDraft(null); setOpen(false); }
        }}
      />
      {open && filtered.length && !typingTag ? (
        <div className="slot__menu">
          {filtered.map((option, i) => (
            <button
              key={i} type="button" className="slot__option"
              onMouseDown={e => {
                e.preventDefault();
                onChange(option.synthetic && onCreateFromRecord ? onCreateFromRecord() : option.ref);
                setDraft(null); setOpen(false);
              }}
            >
              <span className={`slot__group${option.group === 'Из записи' ? ' slot__group--record' : ''}`}>
                {option.group}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {trouble ? <span className="field__error">{trouble}</span> : null}
      {value && typeof value === 'object' && 'expr' in (value as object) ? (
        <Select
          value={(value as { of?: string }).of ?? 'source'}
          options={[['source', 'считает отправитель'], ['target', 'считает цель — её листом']] as const}
          onChange={of => onChange({ ...(value as { expr: string }), of: of === 'source' ? undefined : 'target' } as SlotRef)}
        />
      ) : null}
    </div>
  );
}
