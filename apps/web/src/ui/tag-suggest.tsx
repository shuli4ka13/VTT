// Автокомплит тегов: человек печатает «@бон» или «#бон» — подсказка
// предлагает поля по их ЧЕЛОВЕЧЕСКИМ названиям, а в текст встаёт тег.
// Собаку и решётку принимаем одинаково: в формуле живёт только #тег,
// но угадывать его никто не обязан — набирается название.
//
// Идиома старого PoC (suggest.js): лейбл → тег ровно один раз, по выбору
// человека — не при каждом вычислении.

import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { System } from '@vtt/schema';

/** Незакрытый запрос тега слева от каретки: позиция сигила и набранное. */
export function matchTagQuery(text: string, caret: number): { at: number; needle: string } | null {
  const head = text.slice(0, caret);
  const m = head.match(/[#@]([\p{L}\p{N}_ ]*)$/u);
  if (!m) return null;
  return { at: caret - m[0].length, needle: m[1]!.trim().toLowerCase() };
}

/** Замена запроса выбранным тегом; каретка встаёт сразу за ним. */
export function applyTag(text: string, at: number, caret: number, tag: string): { next: string; caretTo: number } {
  const inserted = `#${tag}`;
  return { next: text.slice(0, at) + inserted + text.slice(caret), caretTo: at + inserted.length };
}

export function TagInput({ value, onChange, system, placeholder, onKeyDown, onBlur, inputRef }: {
  value: string;
  onChange: (next: string) => void;
  system: System;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const [query, setQuery] = useState<{ at: number; needle: string } | null>(null);

  const fields = useMemo(
    () => system.fields.map(f => ({ tag: f.tag, label: f.label ?? f.tag })),
    [system],
  );
  const matches = query
    ? fields.filter(f => !query.needle
      || f.label.toLowerCase().includes(query.needle)
      || f.tag.toLowerCase().includes(query.needle)).slice(0, 8)
    : [];

  const refresh = () => {
    const el = ref.current;
    if (!el) return;
    setQuery(matchTagQuery(el.value, el.selectionStart ?? el.value.length));
  };

  const pick = (tag: string) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const q = matchTagQuery(value, caret);
    if (!q) return;
    const { next, caretTo } = applyTag(value, q.at, caret, tag);
    onChange(next);
    setQuery(null);
    queueMicrotask(() => { el.focus(); el.setSelectionRange(caretTo, caretTo); });
  };

  return (
    <div className="slot">
      <input
        ref={ref}
        className="input input--mono"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={e => { onChange(e.target.value); queueMicrotask(refresh); }}
        onKeyUp={refresh}
        onClick={refresh}
        onBlur={() => { setTimeout(() => setQuery(null), 120); onBlur?.(); }}
        onKeyDown={e => { if (e.key === 'Escape') setQuery(null); onKeyDown?.(e); }}
      />
      {matches.length ? (
        <div className="slot__menu">
          {matches.map(f => (
            <button
              key={f.tag} type="button" className="slot__option"
              onMouseDown={e => { e.preventDefault(); pick(f.tag); }}
            >
              <span className="slot__group">поле</span>
              {f.label}
              <span className="faint">&nbsp;#{f.tag}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
