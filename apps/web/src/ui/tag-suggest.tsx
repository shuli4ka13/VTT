export function matchTagQuery(text: string, caret: number): { at: number; needle: string } | null {
  const head = text.slice(0, caret);
  const m = head.match(/@([\p{L}\p{N}_ ]*)$/u);
  if (m) return { at: caret - m[0].length, needle: m[1]!.trim().toLowerCase() };
  if ((head.match(/"/g) ?? []).length % 2) return null;
  const word = head.match(/(?<![\p{L}\p{N}_.#@])([\p{L}_][\p{L}\p{N}_]*)$/u);
  if (!word || /^\u043a$/u.test(word[1]!)) return null;
  return { at: caret - word[0].length, needle: word[1]!.toLowerCase() };
}

export function applyTag(text: string, at: number, caret: number, tag: string): { next: string; caretTo: number } {
  const inserted = `@${tag}`;
  return { next: text.slice(0, at) + inserted + text.slice(caret), caretTo: at + inserted.length };
}
