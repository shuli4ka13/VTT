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

import { useMemo } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { Verdict } from './primitives.tsx';
import { FormulaChips } from './formula-chips.tsx';

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
  const parsed = useMemo(() => parseFormula(value), [value]);

  // Поля вставляются автокомплитом прямо в строке (@название) — отдельная
  // панель «Вставить поле» больше не нужна: фишки и есть та панель.
  return (
    <div className="stack stack--tight">
      <FormulaChips
        value={value}
        system={system}
        placeholder={placeholder ?? 'например: floor((@Сила - 10) / 2)'}
        onChange={onChange}
      />

      {value.trim() ? (
        parsed.ok
          ? <Verdict tone="ok">правило верное · зависит от {parsed.deps.length}</Verdict>
          : <Verdict tone="bad">
              {parsed.error}
              {parsed.pos === undefined ? null : <span className="faint"> · позиция {parsed.pos}</span>}
            </Verdict>
      ) : null}
    </div>
  );
}
