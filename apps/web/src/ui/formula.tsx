// Панель формулы. Лучшее, что было в черновике тимлида, — и единственное,
// что оттуда взято целиком: поле ввода, живой приговор и строка «зависит от»
// с кликабельными чипсами, вставляющими зависимость В ПОЗИЦИЮ КУРСОРА.
//
// Три отличия от черновика, ради которых PoC и затевался:
//
//  1. Чипс вставляет ТЕГ, а на экране формула читается лейблами. В черновике
//     подставлялось отображаемое имя — и переименование поля молча ломало
//     формулу, а совпадение подстрок ломало её тоже («Сила» затирала кусок
//     «Силы воли»).
//  2. Формула не исполняется Function() — её разбирает собственный парсер.
//  3. Приговор о разборе есть всегда: «правило верное · зависит от 3» либо
//     ошибка с позицией. В режиме автора значений нет и быть не может —
//     персонажа там нет, считать не по чему.

import { useMemo, useRef } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { targets } from '@vtt/engine/engine/targets';
import { Verdict } from './primitives.tsx';

export interface Parsed {
  ok: boolean;
  deps: string[];
  error?: string;
  pos?: number;
}

/** Разбор без вычисления: в конструкторе значений нет, есть только форма. */
export function parseFormula(source: string): Parsed {
  const text = source.trim();
  if (!text) return { ok: false, deps: [], error: 'формула пуста' };
  try {
    const formula = compile(text);
    return { ok: true, deps: [...formula.deps] };
  } catch (err) {
    const error = err as { raw?: string; message: string; pos?: number };
    return { ok: false, deps: [], error: error.raw ?? error.message, pos: error.pos };
  }
}

/** Тег → лейбл. Обратного преобразования нет и быть не должно. */
export function labelOfTag(system: System, tag: string): string {
  const field = system.fields.find(f => f.tag === tag);
  return field?.label ?? tag;
}

/**
 * Формула лейблами: на экран тег не попадает.
 * Замена идёт по границам ссылок `#тег`, а не подстрокой — иначе
 * повторилась бы ровно та ошибка черновика, от которой мы уходим.
 */
export function formulaAsLabels(system: System, source: string): string {
  return source.replace(/#([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(system, tag));
}

export function FormulaInput({ system, value, onChange, placeholder }: {
  system: System;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseFormula(value), [value]);
  const available = useMemo(() => targets(system) as { tag: string; label: string; kind: string }[], [system]);

  // Вставка в позицию курсора, а не в конец: это то самое решение черновика,
  // ради которого панель и берётся целиком.
  const insert = (tag: string) => {
    const element = input.current;
    const at = element?.selectionStart ?? value.length;
    const next = `${value.slice(0, at)}#${tag}${value.slice(at)}`;
    onChange(next);
    queueMicrotask(() => {
      element?.focus();
      const to = at + tag.length + 1;
      element?.setSelectionRange(to, to);
    });
  };

  const used = new Set(parsed.deps);
  const fields = available.filter(t => t.kind === 'value');

  return (
    <div className="stack stack--tight">
      <input
        ref={input}
        className="input input--mono"
        value={value}
        placeholder={placeholder ?? 'например: floor((#str - 10) / 2)'}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
      />

      {value.trim() ? (
        parsed.ok
          ? <Verdict tone="ok">правило верное · зависит от {parsed.deps.length}</Verdict>
          : <Verdict tone="bad">
              {parsed.error}
              {parsed.pos === undefined ? null : <span className="faint"> · позиция {parsed.pos}</span>}
            </Verdict>
      ) : null}

      {parsed.ok && parsed.deps.length ? (
        <div className="inline inline--tight">
          <span className="field__label">зависит от:</span>
          {parsed.deps.map(tag => (
            <span key={tag} className="chip chip--on" title={`#${tag}`}>{labelOfTag(system, tag)}</span>
          ))}
        </div>
      ) : null}

      <details className="fold">
        <summary className="fold__head">
          <span className="fold__title">Вставить поле</span>
          <span className="fold__count num">{fields.length}</span>
        </summary>
        <div className="fold__body">
          {fields.length === 0
            ? <span className="faint">В системе ещё нет полей — заведите их на вкладке «Лист».</span>
            : (
              <div className="inline inline--tight">
                {fields.map(target => (
                  <button
                    key={target.tag}
                    type="button"
                    className={`chip chip--action ${used.has(target.tag) ? 'chip--on' : ''}`}
                    onClick={() => insert(target.tag)}
                    title={`#${target.tag}`}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            )}
        </div>
      </details>
    </div>
  );
}
