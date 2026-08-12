// Слот без таксономии: одно поле. Печатаешь число или формулу — это они
// и есть; структурное (поле цели, «из записи», результат шага, кость) —
// выбирается из подсказки под полем. Человек не обязан знать слова
// «const», «expr» и «param»: вид определяется его жестом.

import { useMemo, useState } from 'react';
import type { System, Effect, SlotRef, Step } from '@vtt/schema';
import { Select } from '../../ui/primitives.tsx';
import { labelOfTag } from '../../ui/formula.tsx';
import { dieWord } from './readback.ts';
import type { SlotContext, SlotKind } from './slots.tsx';

export function parseTyped(text: string): SlotRef | null {
  const t = text.trim();
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return { const: Number(t) };
  return { expr: t };
}

// Движок понимает нотацию кубиков только как «NdM» (латинское d, счёт
// обязателен) — см. packages/engine/src/engine/dice.ts, /^(\d+)d(\d+)$/.
// Автор пишет по-русски и не обязан помнить это; здесь ручной ввод
// «1к8», «к8», «2 к 6» приводится к канонической записи движка.
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
  if ('const' in r) return String(r.const ?? '');
  if ('expr' in r) return String(r.expr ?? '');
  if ('tag' in r) return `поле: ${labelOfTag(ctx.system, String(r.tag))}`;
  if ('param' in r) {
    const declared = ctx.effect.params?.find(p => p.key === r.param);
    return `из записи: ${declared?.label ?? String(r.param)}`;
  }
  if ('prop' in r || 'item' in r) return `из записи: ${String(r.prop ?? r.item)}`;
  if ('ref' in r) return `результат «${String(r.ref)}»`;
  if ('constant' in r) return `кость: ${dieWord(ctx.system, String(r.constant))}`;
  return '';
}

export interface SlotOption { group: string; label: string; ref: SlotRef; synthetic?: boolean }

export function optionsFor(ctx: SlotContext, allow?: SlotKind[]): SlotOption[] {
  const ok = (kind: SlotKind) => !allow || allow.includes(kind);
  const out: SlotOption[] = [];
  if (ok('param')) {
    for (const p of ctx.effect.params ?? []) out.push({ group: 'Из записи', label: p.label ?? p.key, ref: { param: p.key } });
  }
  if (ok('ref')) for (const name of ctx.earlier) out.push({ group: 'Результаты шагов', label: `результат «${name}»`, ref: { ref: name } });
  if (ok('tag')) for (const f of ctx.system.fields) out.push({ group: 'Поля цели', label: f.label ?? f.tag, ref: { tag: f.tag } });
  if (ok('constant')) {
    for (const [key, c] of Object.entries(ctx.system.constants ?? {})) out.push({ group: 'Кости', label: c.label ?? key, ref: { constant: key } });
  }
  return out;
}

export function SlotInput({ value, onChange, context, allow, placeholder, extraOptions, dice, onCreateFromRecord }: {
  value: unknown;
  onChange: (next: SlotRef | null) => void;
  context: SlotContext;
  allow?: SlotKind[];
  placeholder?: string;
  /** Дополнительные строки подсказки (например, состояния для карточки «изменение»). */
  extraOptions?: SlotOption[];
  /** Слот костей: набранная нотация («1к8») приводится к каноническому виду движка. */
  dice?: boolean;
  /**
   * Потребность может родиться прямо тут: пункт «из записи → новая
   * потребность…» в конце группы «Из записи» заводит её на эффекте и
   * отдаёт готовый `{param}`-ref, который слот сразу и коммитит.
   */
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    const base = [...(extraOptions ?? []), ...optionsFor(context, allow)];
    if (!onCreateFromRecord) return base;
    let insertAt = 0;
    base.forEach((option, i) => { if (option.group === 'Из записи') insertAt = i + 1; });
    const born: SlotOption = { group: 'Из записи', label: 'из записи → новая потребность…', ref: { param: '' }, synthetic: true };
    return [...base.slice(0, insertAt), born, ...base.slice(insertAt)];
  }, [context, allow, extraOptions, onCreateFromRecord]);
  const shown = draft ?? displayOf(value, context);
  const needle = (draft ?? '').toLowerCase();
  const filtered = needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options;

  const commitTyped = () => {
    if (draft !== null) {
      const diced = dice ? normalizeDice(draft) : null;
      const candidate: SlotRef | null = diced !== null ? { const: diced } : parseTyped(draft);
      if (candidate !== null && allow) {
        const kind: SlotKind = 'const' in candidate ? 'const' : 'expr';
        if (!allow.includes(kind)) { setDraft(null); setOpen(false); return; }
      }
      onChange(candidate);
      setDraft(null);
    }
    setOpen(false);
  };

  return (
    <div className="slot">
      <input
        className="input input--mono"
        value={shown}
        placeholder={placeholder ?? 'число или формула'}
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onChange={e => { setDraft(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(commitTyped, 120)}
        onKeyDown={e => {
          if (e.key === 'Enter') commitTyped();
          if (e.key === 'Escape') { setDraft(null); setOpen(false); }
        }}
      />
      {open && filtered.length ? (
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
