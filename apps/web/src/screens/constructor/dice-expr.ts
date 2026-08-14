// Состав кости одной строкой: «1d20», «#пул d6», «1d12 Надежда + 1d12 Страх».
//
// Тот же приём, что и строка броска в карточке шага (roll-expr.ts): автор
// пишет одну строку, разбор раскладывает её на структуру движка. Иначе под
// пул из листа и под составную кость пришлось бы городить отдельные контролы,
// а они нужны в двух мирах из десяти — и торчали бы у всех остальных.
//
// Что понимает:
//   1d20                     — обычная кость
//   #пул d6                  — столько костей, сколько скажет поле листа
//   1d12 Надежда + 1d12 Страх — составной бросок с именованными частями

import type { System, DiceTerm } from '@vtt/schema';
import { slugOf } from '../../store/world.ts';

export interface DiceParse {
  dice?: DiceTerm[];
  error?: string;
}

// [счёт] d [граней] [имя части]. Счёт — число или ссылка на поле «#тег».
const TERM = /^(?:(\d+)|#([\p{L}\p{N}_]+))?\s*[dдк]\s*(\d+)\s*(.*)$/iu;

export function parseDiceExpr(text: string, system: System): DiceParse {
  const parts = text.split('+').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return { error: 'пусто: напишите хотя бы «1d20»' };

  const dice: DiceTerm[] = [];
  for (const part of parts) {
    const m = TERM.exec(part);
    if (!m) return { error: `не разобрать «${part}» — нужно вроде «1d20», «#пул d6» или «1d12 Надежда»` };

    const [, literal, tag, sidesText, rest] = m;
    const sides = Number(sidesText);
    if (!Number.isInteger(sides) || sides < 2) {
      return { error: `у кости не бывает ${sides} граней` };
    }

    let count: DiceTerm['count'];
    if (tag) {
      // Пул из листа: поле обязано существовать, иначе ссылка в пустоту —
      // ровно тот дефект черновика, ради которого затевался словарь мишеней.
      if (!system.fields.some(f => f.tag === tag)) {
        return { error: `поля «#${tag}» в системе нет — заведите его на «Листе»` };
      }
      count = { tag } as DiceTerm['count'];
    } else {
      count = literal ? Number(literal) : 1;
    }

    const name = (rest ?? '').trim();
    dice.push({
      count, sides,
      ...(name ? { name: slugOf(name) || name, label: name } : {}),
    });
  }

  const named = dice.filter(d => d.name);
  if (named.length && named.length !== dice.length) {
    return { error: 'либо у всех частей есть имена, либо ни у одной' };
  }
  return { dice };
}

/** Обратно в строку. Null — состав, который строкой не выразить: правится в данных. */
export function formatDiceExpr(dice: DiceTerm[] | undefined): string | null {
  if (!dice?.length) return '';
  const parts: string[] = [];
  for (const term of dice) {
    const count = term.count ?? 1;
    let head: string;
    // После ссылки — пробел: «#пул d6» читается, «#пулd6» слипается.
    if (typeof count === 'number') head = String(count);
    else if (count && typeof count === 'object' && 'tag' in count) head = `#${String(count.tag)} `;
    else return null;
    parts.push(`${head}d${term.sides}${term.name ? ` ${term.label || term.name}` : ''}`);
  }
  return parts.join(' + ');
}

/**
 * Сколько костей в составе, если это известно заранее. Пул из листа —
 * неизвестно, и это отдельный ответ: там всякое чтение осмысленно.
 */
export function diceCount(dice: DiceTerm[] | undefined): number | null {
  let total = 0;
  for (const term of dice ?? []) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') return null;
    total += count;
  }
  return total;
}
