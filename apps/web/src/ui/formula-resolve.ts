import { lex, FUNCTION_NAMES, BOOLEANS, AND, OR, NOT } from '@vtt/engine';
import type { Token } from '@vtt/engine';

export interface KnownName { tag: string; label: string }

export interface Unknown { at: number; word: string; near: string | null; several: boolean }

export interface Resolved { text: string; caret: number; unknown: Unknown[] }

const WORDS = new Set<string>([...FUNCTION_NAMES, ...Object.keys(BOOLEANS), AND, OR, NOT]);

export const plain = (text: string): string => text.toLowerCase().replace(/ё/gu, 'е').replace(/_/gu, ' ').replace(/\s+/gu, ' ').trim();

interface Index { byLabel: Map<string, Set<string>>; byTag: Map<string, string>; all: readonly KnownName[] }

const indexOf = (known: readonly KnownName[]): Index => {
  const byLabel = new Map<string, Set<string>>();
  const byTag = new Map<string, string>();
  for (const one of known) {
    byTag.set(plain(one.tag), one.tag);
    for (const label of new Set([plain(one.label), plain(one.label.split(' → ').pop() ?? one.label)])) {
      if (!label) continue;
      const tags = byLabel.get(label) ?? new Set<string>();
      tags.add(one.tag);
      byLabel.set(label, tags);
    }
  }
  return { byLabel, byTag, all: known };
};

type Found = { tag: string } | { several: true } | null;

const findIn = (index: Index, word: string, under?: string): Found => {
  const want = plain(word);
  if (!want) return null;
  const inside = (tag: string): boolean => !under || tag.startsWith(`${under}.`);
  const exact = index.byTag.get(under ? plain(`${under}.${word}`) : want);
  if (exact && inside(exact)) return { tag: exact };
  const tags = [...(index.byLabel.get(want) ?? [])].filter(inside).filter(tag => (under ? !tag.slice(under.length + 1).includes('.') || true : true));
  const top = under ? tags : tags.filter(tag => !tag.includes('.')).length ? tags.filter(tag => !tag.includes('.')) : tags;
  if (top.length === 1) return { tag: top[0]! };
  return top.length > 1 ? { several: true } : null;
};

const nearest = (index: Index, word: string): string | null => {
  const want = plain(word);
  if (want.length < 2) return null;
  const rank = (label: string): number => (label.startsWith(want) ? 0 : label.split(' ').some(part => part.startsWith(want)) ? 1 : label.includes(want) ? 2 : 3);
  const best = [...index.all].map(one => ({ one, rank: rank(plain(one.label)) })).filter(found => found.rank < 3).sort((a, b) => a.rank - b.rank)[0];
  return best ? best.one.label : null;
};

const resolvePath = (index: Index, word: string): Found => {
  const whole = findIn(index, word);
  if (whole || !word.includes('.')) return whole;
  const segments = word.split('.');
  let base: string | null = null;
  for (let at = 0; at < segments.length; at += 1) {
    const found: Found = base === null ? findIn(index, segments[at]!) : findIn(index, segments[at]!, base);
    if (!found || 'several' in found) return found;
    base = found.tag;
  }
  return base === null ? null : { tag: base };
};

interface Run { from: number; to: number; words: Token[] }

const runsOf = (text: string, tokens: readonly Token[]): Run[] => {
  const out: Run[] = [];
  let run: Token[] = [];
  const close = () => {
    if (run.length) out.push({ from: run[0]!.pos, to: run.at(-1)!.pos + run.at(-1)!.text.length, words: run });
    run = [];
  };
  tokens.forEach((token, at) => {
    const next = tokens[at + 1];
    const call = token.type === 'ident' && next?.type === 'lparen';
    if (token.type !== 'ident' || call || WORDS.has(token.text.toLowerCase())) { close(); return; }
    const last = run.at(-1);
    if (last && !/^ +$/u.test(text.slice(last.pos + last.text.length, token.pos))) close();
    run.push(token);
  });
  close();
  return out;
};

export function resolveNames(text: string, known: readonly KnownName[], options: { caret?: number; final?: boolean } = {}): Resolved {
  const caret = options.caret ?? text.length;
  let tokens: Token[];
  try { tokens = lex(text); } catch { return { text, caret, unknown: [] }; }
  const index = indexOf(known);
  const edits: { from: number; to: number; put: string }[] = [];
  const unknown: Unknown[] = [];
  for (const run of runsOf(text, tokens)) {
    const typing = !options.final && caret >= run.from && caret <= run.to + (/^ *$/u.test(text.slice(run.to, caret)) ? caret - run.to : 0);
    let at = 0;
    while (at < run.words.length) {
      let taken = 0;
      let found: Found = null;
      for (let size = run.words.length - at; size >= 1; size -= 1) {
        const phrase = run.words.slice(at, at + size).map(word => word.text).join(' ');
        const got = resolvePath(index, phrase.replace(/\.$/u, ''));
        if (got) { found = got; taken = size; break; }
      }
      const first = run.words[at]!;
      const last = run.words[at + Math.max(taken, 1) - 1]!;
      const end = last.pos + last.text.length;
      const dotted = last.text.endsWith('.');
      const open = typing && end >= caret - (text.slice(end, caret).length) && caret <= end + text.slice(end, caret).length && !dotted && at + Math.max(taken, 1) === run.words.length;
      if (found && 'tag' in found && !open) {
        edits.push({ from: first.pos, to: end, put: `@${found.tag}${dotted ? '.' : ''}` });
      } else if (!open) {
        const word = run.words.slice(at, at + Math.max(taken, 1)).map(one => one.text).join(' ');
        unknown.push({ at: first.pos, word, near: found && 'several' in found ? null : nearest(index, word), several: Boolean(found && 'several' in found) });
      }
      at += Math.max(taken, 1);
    }
  }
  let out = text;
  let moved = caret;
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.put + out.slice(edit.to);
    if (caret >= edit.to) moved += edit.put.length - (edit.to - edit.from);
    else if (caret > edit.from) moved = edit.from + edit.put.length;
  }
  return { text: out, caret: moved, unknown };
}

export const unknownWords = (text: string, known: readonly KnownName[]): Unknown[] => resolveNames(text, known, { final: true }).unknown;

export const NO_NAME = (one: Unknown): string => (one.several
  ? `«${one.word}» есть у нескольких — выберите в списке, чьё`
  : one.near ? `нет имени «${one.word}» — ближайшее: «${one.near}»` : `нет имени «${one.word}»`);
