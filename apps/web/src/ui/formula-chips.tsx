// Формула фишками: текст хранится тегами («1d20 + #бонус_атаки»), а
// показывается по-человечески — тег рисуется неделимой фишкой с лейблом.
//
// Почему фишка, а не маска текста: внутри фишки каретка не ходит, её можно
// только стереть целиком и вставить другую через @. Хранимое — всегда тег,
// лейбл подставляется при отрисовке, поэтому переименование поля мгновенно
// обновляет все формулы и не ломает ни одной (критерий №2).

import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { matchTagQuery, applyTag } from './tag-suggest.tsx';

// Локальная копия «тег → лейбл», чтобы не заводить цикл импортов с formula.tsx.
const labelOfTag = (system: System, tag: string): string =>
  system.fields.find(f => f.tag === tag)?.label ?? tag;

export type Part = { text: string } | { tag: string };

/** Разбивка формулы: текстовые куски и теги, текст всегда по краям и между тегами. */
export function partsOf(value: string): Part[] {
  const out: Part[] = [];
  let rest = value;
  for (;;) {
    const m = rest.match(/#([\p{L}\p{N}_]+)/u);
    if (!m || m.index === undefined) break;
    out.push({ text: rest.slice(0, m.index) });
    out.push({ tag: m[1]! });
    rest = rest.slice(m.index + m[0].length);
  }
  out.push({ text: rest });
  return out;
}

export function joinParts(parts: Part[]): string {
  return parts.map(p => ('tag' in p ? `#${p.tag}` : p.text)).join('');
}

export function FormulaChips({ value, onChange, system, placeholder, onKeyDown, onBlur, onFocus, prefix, suffix, names, extraOptions }: {
  value: string;
  onChange: (next: string) => void;
  system: System;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;
  /** Фокус вошёл в поле — слоту это нужно, чтобы показать свои варианты. */
  onFocus?: () => void;
  /** Есть незакрытый запрос тега: слот прячет своё меню, чтобы не спорить. */
  onQuery?: (active: boolean) => void;
  /**
   * Фишка перед строкой — то, что живёт не в тексте формулы, а отдельным
   * слотом: кость из записи, например. В строке она выглядит как все
   * остальные, но правится не текстом.
   */
  prefix?: ReactNode;
  /** То же, но ПОСЛЕ строки: закрывающая скобка группы, например. */
  suffix?: ReactNode;
  /**
   * Чем подписать имя, которое не поле листа: «#dmg» — это число, посчитанное
   * шагом выше, и в строке оно обязано читаться тем, чем оно является
   * («Кость урона + Мод Силы»), а не машинным именем.
   */
  names?: Record<string, string>;
  /**
   * Что ещё предложить в подсказке по «@» помимо полей листа. Такой пункт
   * не вставляется в текст (формула умеет ссылаться только на поля) —
   * он сам знает, куда себя записать.
   */
  extraOptions?: { group: string; label: string; onPick: () => void }[];
}) {
  const parts = useMemo(() => partsOf(value), [value]);
  const host = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [active, setActive] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);

  const fields = useMemo(
    () => system.fields.map(f => ({ tag: f.tag, label: f.label ?? f.tag })),
    [system],
  );

  const commitParts = (next: Part[], focusAt?: { index: number; caret: number }) => {
    onChange(joinParts(next));
    if (focusAt) {
      queueMicrotask(() => {
        const el = inputs.current.get(focusAt.index);
        el?.focus();
        el?.setSelectionRange(focusAt.caret, focusAt.caret);
      });
    }
  };

  // Живой запрос тега в активном текстовом куске.
  const query = active !== null && 'text' in (parts[active] ?? {})
    ? matchTagQuery((parts[active] as { text: string }).text, caret)
    : null;
  const matches = query
    ? fields.filter(f => !query.needle
      || f.label.toLowerCase().includes(query.needle)
      || f.tag.toLowerCase().includes(query.needle)).slice(0, 8)
    : [];
  const extras = query
    ? (extraOptions ?? []).filter(o => !query.needle || o.label.toLowerCase().includes(query.needle))
    : [];

  /** Чужой пункт сам знает, куда записаться; из текста запрос «@…» убираем. */
  const pickExtra = (onPick: () => void) => {
    if (active === null || !query) return;
    const part = parts[active] as { text: string };
    const next = parts.map((p, i) => (i === active
      ? { text: part.text.slice(0, query.at) + part.text.slice(caret) }
      : p));
    onChange(joinParts(next));
    onPick();
  };

  const pick = (tag: string) => {
    if (active === null || !query) return;
    const part = parts[active] as { text: string };
    // Запрос заменяется пустотой в тексте, тег встаёт отдельной фишкой.
    const before = part.text.slice(0, query.at);
    const after = part.text.slice(caret);
    const next = [
      ...parts.slice(0, active),
      { text: before }, { tag }, { text: after },
      ...parts.slice(active + 1),
    ];
    commitParts(next, { index: active + 2, caret: 0 });
  };

  const editText = (index: number, text: string, at: number) => {
    const next = parts.map((p, i) => (i === index ? { text } : p));
    setCaret(at);
    commitParts(next);
  };

  const dropChip = (chipIndex: number) => {
    // Сливаем соседние текстовые куски вокруг удалённой фишки.
    const before = parts[chipIndex - 1] as { text: string } | undefined;
    const after = parts[chipIndex + 1] as { text: string } | undefined;
    const merged = { text: `${before?.text ?? ''}${after?.text ?? ''}` };
    const next = [
      ...parts.slice(0, Math.max(0, chipIndex - 1)),
      merged,
      ...parts.slice(chipIndex + 2),
    ];
    commitParts(next, { index: Math.max(0, chipIndex - 1), caret: (before?.text ?? '').length });
  };

  const leave = () => {
    // Фокус ушёл из всего контейнера — доложить наверх (коммит строки броска).
    setTimeout(() => {
      if (host.current && !host.current.contains(document.activeElement)) {
        setActive(null);
        onBlur?.();
      }
    }, 120);
  };

  const empty = parts.length === 1 && !(parts[0] as { text: string }).text;

  return (
    <div className="chips" ref={host} onKeyDown={onKeyDown}>
      <div className="chips__row" onMouseDown={e => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputs.current.get(parts.length - 1)?.focus();
        }
      }}>
        {prefix}
        {parts.map((part, index) => 'tag' in part ? (
          <span key={index} className="chips__chip" title={`#${part.tag}`}>
            {names?.[part.tag] ?? labelOfTag(system, part.tag)}
            <button
              type="button" className="chips__x" aria-label="убрать поле"
              onMouseDown={e => { e.preventDefault(); dropChip(index); }}
            >×</button>
          </span>
        ) : (
          <input
            key={index}
            ref={el => { if (el) inputs.current.set(index, el); else inputs.current.delete(index); }}
            className="chips__text"
            value={part.text}
            placeholder={empty ? placeholder : undefined}
            size={Math.max(1, part.text.length || (empty ? (placeholder?.length ?? 8) : 1))}
            spellCheck={false}
            onFocus={e => { setActive(index); setCaret(e.currentTarget.selectionStart ?? 0); onFocus?.(); }}
            onBlur={leave}
            onChange={e => editText(index, e.target.value, e.currentTarget.selectionStart ?? e.target.value.length)}
            onKeyUp={e => setCaret(e.currentTarget.selectionStart ?? 0)}
            onClick={e => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={e => {
              // Backspace в начале куска съедает фишку слева — целиком.
              if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0
                && e.currentTarget.selectionEnd === 0 && index > 0) {
                e.preventDefault();
                dropChip(index - 1);
              }
            }}
          />
        ))}
        {suffix}
      </div>
      {matches.length || extras.length ? (
        <div className="slot__menu">
          {extras.map((option, i) => (
            <button
              key={`extra-${i}`} type="button" className="slot__option"
              onMouseDown={e => { e.preventDefault(); pickExtra(option.onPick); }}
            >
              <span className="slot__group slot__group--record">{option.group}</span>
              {option.label}
            </button>
          ))}
          {matches.map(f => (
            <button
              key={f.tag} type="button" className="slot__option"
              onMouseDown={e => { e.preventDefault(); pick(f.tag); }}
            >
              <span className="slot__group">поле</span>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
