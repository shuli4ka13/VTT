// Формула на экране: хранится тегами, показывается лейблами.
//
// Это ядро требования «пользователь никогда не печатает тег руками и в норме
// его вообще не видит». Обратного преобразования — из лейбла в тег — здесь НЕТ
// и быть не должно: именно оно ломало формулы в черновике при переименовании
// поля и при совпадении подстрок («Сила» внутри «Сила воли»).
//
// Направление ровно одно: тег → лейбл, только для показа.
// Правки идут по позициям в исходной строке, лейблы в них не участвуют.

import { lex } from '../formula/index.js';
import { findTarget } from '../engine/targets.js';

// Формула, как её видит пользователь. Пробелы и скобки автора сохраняются.
export function toDisplay(expr, system) {
  const source = String(expr ?? '');
  let tokens;
  try {
    tokens = lex(source);
  } catch {
    // Недописанная формула — обычное состояние во время редактирования.
    // Показываем как есть, а не прячем под ошибкой.
    return source;
  }

  let out = '';
  let cursor = 0;
  for (const token of tokens) {
    if (token.type === 'eof') break;
    if (token.type !== 'ref') continue;
    out += source.slice(cursor, token.pos) + labelFor(token, system);
    cursor = token.pos + token.text.length;
  }
  return out + source.slice(cursor);
}

// Разбор на куски для полосы редактора: ссылки — чипсами, остальное — текстом.
export function toParts(expr, system) {
  return ranges(expr, system).map(part => part.kind === 'ref'
    ? { kind: 'ref', tag: part.tag, label: part.label }
    : { kind: 'text', text: part.text });
}

// Вставка зависимости в позицию курсора. Всегда вставляется ТЕГ.
// Возвращает и новую строку, и новую позицию курсора — иначе после перерисовки
// каретка прыгала бы в начало.
export function insertRefAt(expr, tag, pos) {
  const source = String(expr ?? '');
  const at = pos == null ? source.length : Math.max(0, Math.min(pos, source.length));
  const before = source.slice(0, at);
  const after = source.slice(at);

  // Пробелы ставятся по надобности с обеих сторон: слева — если там уже что-то
  // есть и это не пробел и не открывающая скобка; справа — если следующий символ
  // прижмётся к тегу вплотную. Курсор встаёт сразу за тегом, до правого пробела.
  const left = before && !/[\s(]$/.test(before) ? ' ' : '';
  const right = after && !/^[\s),]/.test(after) ? ' ' : '';
  const ref = '#' + tag;

  return {
    expr: before + left + ref + right + after,
    caret: at + left.length + ref.length,
  };
}

export function insertRef(expr, tag, pos) {
  return insertRefAt(expr, tag, pos).expr;
}

export function removePart(expr, system, index) {
  const source = String(expr ?? '');
  const part = ranges(source, system)[index];
  if (!part) return source;
  return source.slice(0, part.from) + source.slice(part.to);
}

function labelFor(token, system) {
  const target = findTarget(system, token.value);
  // Незнакомый тег показываем решёткой: поломку лучше видеть, чем прятать.
  return target ? target.label : token.text;
}

function ranges(expr, system) {
  const source = String(expr ?? '');
  if (!source) return [];

  let tokens;
  try {
    tokens = lex(source);
  } catch {
    return [{ kind: 'text', text: source, from: 0, to: source.length }];
  }

  const parts = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.type === 'eof') break;
    if (token.type !== 'ref') continue;
    if (token.pos > cursor) {
      parts.push({ kind: 'text', text: source.slice(cursor, token.pos), from: cursor, to: token.pos });
    }
    const to = token.pos + token.text.length;
    parts.push({ kind: 'ref', tag: token.value, label: labelFor(token, system), from: token.pos, to });
    cursor = to;
  }
  if (cursor < source.length) {
    parts.push({ kind: 'text', text: source.slice(cursor), from: cursor, to: source.length });
  }
  return parts;
}
