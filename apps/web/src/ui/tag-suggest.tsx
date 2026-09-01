export function matchTagQuery(text: string, caret: number): { at: number; needle: string } | null {
  const head = text.slice(0, caret);
  const m = head.match(/@([\p{L}\p{N}_ ]*)$/u);
  if (!m) return null;
  return { at: caret - m[0].length, needle: m[1]!.trim().toLowerCase() };
}

export function applyTag(text: string, at: number, caret: number, tag: string): { next: string; caretTo: number } {
  const inserted = `#${tag}`;
  return { next: text.slice(0, at) + inserted + text.slice(caret), caretTo: at + inserted.length };
}
