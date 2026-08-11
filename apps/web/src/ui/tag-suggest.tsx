// Разбор запроса тега при наборе: «@бон» или «#бон» слева от каретки.
// Человек печатает НАЗВАНИЕ поля, в текст встаёт тег — лейбл → тег ровно
// один раз, по выбору человека (идиома suggest старого PoC). Сам ввод
// с подсказкой и фишками живёт в formula-chips.tsx.

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
