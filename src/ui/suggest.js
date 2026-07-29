// Подсказка при наборе формулы.
//
// Человек набирает ЛЕЙБЛАМИ — «Сил» — и выбирает из списка. В строку ложится ТЕГ.
//
// Это не тот же механизм, что в черновике, хотя выглядит похоже. Там лейбл
// разрешался в значение ЗАНОВО ПРИ КАЖДОМ ВЫЧИСЛЕНИИ, регулярной заменой
// (reference/index.html:1096-1102) — потому переименование рвало формулу,
// а «Сила» внутри «Сила воли» тихо портила результат.
//
// Здесь разрешение происходит РОВНО ОДИН РАЗ, в момент выбора из списка,
// и выбор делает человек. Дальше в строке живёт тег, и переименование
// поля на неё уже никак не влияет.

import { FUNCTION_NAMES } from '../formula/index.js';
import { targets } from '../engine/targets.js';

const MAX = 8;

// Слово, которое сейчас набирают: от ближайшей границы слева до курсора.
// Границей считается всё, кроме букв, цифр, подчёркивания и пробела —
// пробел нужен, потому что лейблы бывают из двух слов («Модификатор Ловкости»).
const WORD = /[\p{L}\p{N}_ ]*$/u;

export function suggest(expr, caret, system, excludeTag) {
  const source = String(expr ?? '');
  const at = Math.max(0, Math.min(caret ?? source.length, source.length));
  const head = source.slice(0, at);

  const raw = (WORD.exec(head) || [''])[0];
  // «2 + 10 Сил» — число слева к слову не приклеивается.
  const query = raw.replace(/^.*\d\s+/u, '').trimStart();

  const from = at - query.length;
  const empty = { query, from, to: at, matches: [] };

  if (!query.trim()) return empty;
  // Уже набранный тег переспрашивать нечего.
  if (source[from - 1] === '#') return empty;

  const needle = query.trim().toLowerCase();

  const fields = targets(system)
    .filter(t => t.kind === 'value' && t.tag !== excludeTag)
    .map(t => ({ kind: 'field', tag: t.tag, label: t.label }));

  const functions = FUNCTION_NAMES.map(name => ({ kind: 'function', name }));

  const matches = [...fields, ...functions]
    .map(item => ({ item, rank: rankOf(item.label || item.name, needle) }))
    .filter(m => m.rank >= 0)
    // Совпадение с начала важнее совпадения в середине, дальше — по алфавиту.
    .sort((a, b) => a.rank - b.rank || (a.item.label || a.item.name).localeCompare(b.item.label || b.item.name))
    .slice(0, MAX)
    .map(m => m.item);

  return { query, from, to: at, matches };
}

function rankOf(text, needle) {
  const lower = String(text).toLowerCase();
  if (lower.startsWith(needle)) return 0;
  if (lower.includes(needle)) return 1;
  return -1;
}

// Подставляет выбранное вместо набранного куска.
// Возвращает новую строку и позицию курсора — иначе после перерисовки
// каретка прыгала бы в начало.
export function applySuggestion(expr, range, item) {
  const source = String(expr ?? '');
  if (!item) return { expr: source, caret: range.to };

  const insert = item.kind === 'function' ? `${item.name}(` : `#${item.tag}`;
  return {
    expr: source.slice(0, range.from) + insert + source.slice(range.to),
    caret: range.from + insert.length,
  };
}
