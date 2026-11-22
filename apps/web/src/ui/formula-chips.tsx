import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { matchTagQuery } from './tag-suggest.tsx';
import { fieldPaths, sheetPathLabel } from './paths.ts';
import { DESK_ID, fieldsOf, readableFields, hasField, fieldLinkOf, ROW, tagWords, typeColumns, callAt, partAt, functionSpec, FUNCTION_SPECS, AND, OR, NOT, BOOLEANS } from '@vtt/engine';
import type { FunctionSpec } from '@vtt/engine';
import { plainLabel, pickTail } from './formula-labels.ts';
import { tablesOf, choiceTableOf, rowLabelOf, picksOf } from './formula-words.ts';
import { resolveNames, plain, NO_NAME } from './formula-resolve.ts';

function Signature({ at }: { at: { spec: FunctionSpec; index: number } }) {
  const { spec, index } = at;
  const current = partAt(spec, index);
  const lastMany = spec.parts[spec.parts.length - 1]?.many;
  return (
    <div className="chips__sig" aria-live="polite">
      <span className="chips__sig-call">
        {spec.name}(
        {spec.parts.map((part, at) => (
          <span key={at}>
            {at ? ', ' : ''}
            <span className={`chips__sig-part${part === current && (at === index || (part.many && index >= at)) ? ' is-on' : ''}${part.optional ? ' is-optional' : ''}`}>{part.label}</span>
          </span>
        ))}
        {lastMany ? ', …' : ''})
      </span>
      {current ? <span className="chips__sig-hint">{current.label} — {current.hint}</span> : <span className="chips__sig-hint">{spec.hint}</span>}
    </div>
  );
}


const statesOf = (system: System): { tag: string; label: string }[] =>
  Object.entries(system.effects ?? {})
    .filter(([, effect]) => effect.activation === 'passive')
    .map(([tag, effect]) => ({ tag, label: effect.label ?? tag }));

export type SheetNames = ReadonlyMap<string, string>;

function shortOf(label: string, base: string): string {
  const head = `${base.replace(/_/g, ' ')} — `;
  return label.startsWith(head) ? label.slice(head.length) : label;
}

function typedPath(text: string, caret: number): { base: string; at: number; needle: string } | null {
  const found = text.slice(0, caret).match(/@([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)\.([\p{L}\p{N}_]*)$/u);
  if (!found) return null;
  return { base: found[1]!, at: caret - found[0].length, needle: found[2]!.trim().toLowerCase() };
}

export function lookupNames(system: System, value: string): Map<string, string> {
  const out = new Map<string, string>();
  const call = /таблица\(\s*"([^"]+)"/gu;
  for (const found of value.matchAll(call)) {
    const table = system.tables?.[found[1]!];
    if (!table) continue;
    out.set(found[1]!, table.label || found[1]!);
    for (const column of typeColumns(system, found[1]!)) out.set(column.key, column.label || column.key);
  }
  return out;
}

const spoken = (text: string, names: Map<string, string>): string =>
  names.size ? text.replace(/"([^"]+)"/gu, (whole, key: string) => (names.has(key) ? `«${names.get(key)}»` : whole)) : text;

const onSheet = (tag: string, sheets?: SheetNames): { head: string; rest: string } | null => {
  const dot = tag.indexOf('.');
  if (dot <= 0) return null;
  const head = tag.slice(0, dot);
  return head === DESK_ID || sheets?.has(head) ? { head, rest: tag.slice(dot + 1) } : null;
};

const labelOfTag = (system: System, tag: string, extra?: Map<string, string>, sheets?: SheetNames): string => {
  const owned = onSheet(tag, sheets);
  const label = owned ? plainLabel(system, owned.rest, extra) : plainLabel(system, tag, extra);
  return !owned && label === tag && sheets?.has(tag) ? sheets.get(tag)! : label;
};

const knownSheetName = (system: System, tag: string): boolean =>
  hasField(system, tag) || sheetPathLabel(system, tag) !== null || Boolean(system.effects?.[tag]);

export type Part = { text: string } | { tag: string; lit?: boolean; label?: string; by?: string; rest?: string };

const LONE_REF = /^\s*[@#]([\p{L}\p{N}_.]+)\s*$/u;

export function pickWords(system: System, part: { tag: string; by?: string; rest?: string }, table?: string, extra?: Map<string, string>, sheets?: SheetNames): string {
  const lone = LONE_REF.exec(part.by ?? '');
  const inner = lone?.[1];
  const own = inner?.startsWith(`${ROW}.`) && table
    ? (system.tables?.[table]?.columns ?? []).find(c => c.key === inner.slice(ROW.length + 1))
    : undefined;
  const by = own ? own.label || own.key : inner ? shortLabel(labelOfTag(system, inner, extra, sheets)) : (part.by ?? '').trim();
  return `${shortLabel(labelOfTag(system, part.tag, extra, sheets))} · колонка по [${by}]${part.rest ? ` · ${pickTail(system, part.tag, part.rest)}` : ''}`;
}

export function pickOptions(system: System, table: string | undefined): { tag: string; label: string; group: string }[] {
  const own = table ? system.tables?.[table]?.columns ?? [] : [];
  return own.filter(c => c.kind === 'column' && c.from).flatMap(column => fieldsOf(system)
    .filter(field => fieldLinkOf(system, field) === column.from)
    .map(field => ({
      tag: `${field.tag}.[@${ROW}.${column.key}]`,
      label: `${field.label ?? field.tag} · колонка по [${column.label || column.key}]`,
      group: 'колонка по значению',
    })));
}

const fn = (name: string, open: string, close: string) => ({ label: name, hint: functionSpec(name)?.hint ?? '', open, close, word: true });

const OPS: { label: string; hint: string; open: string; close?: string; word?: boolean }[] = [
  { label: '+', hint: 'сложить', open: ' + ' },
  { label: '−', hint: 'вычесть', open: ' - ' },
  { label: '×', hint: 'умножить', open: ' * ' },
  { label: '÷', hint: 'поделить', open: ' / ' },
  { label: '( )', hint: 'скобки: что внутри — считается первым', open: '(', close: ')' },
  fn('округлить вниз', 'округлить вниз(', ')'),
  fn('округлить вверх', 'округлить вверх(', ')'),
  fn('большее из', 'большее из(', ', )'),
  fn('меньшее из', 'меньшее из(', ', )'),
  fn('если', 'если(', ', , )'),
  { label: 'и', hint: 'верно, только если верны обе части', open: ' и ', word: true },
  { label: 'или', hint: 'первая часть, если она задана, иначе вторая: «класс или 1к8», «бой или реакция»', open: ' или ', word: true },
  { label: 'не', hint: 'наоборот: «не пусто(…)» — задано', open: 'не ', word: true },
  { ...fn('есть', 'есть(', ', "")'), label: 'есть в списке' },
];

const LOOKUP = 'таблица';

const PICK = '[@#]([\\p{L}\\p{N}_]+(?:\\.[\\p{L}\\p{N}_]+)*)\\.\\[([^\\[\\]]*)\\]((?:\\.[\\p{L}\\p{N}_]+)*)';

const PART = new RegExp(`${PICK}|[@#]([\\p{L}\\p{N}_.]+)|"([^"]*)"`, 'u');

function lookupArgs(value: string, open: number): { start: number; text: string }[] {
  const args: { start: number; text: string }[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = open + 1;
  for (let i = open; i < value.length; i++) {
    const ch = value[i]!;
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"') { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth === 0) { args.push({ start, text: value.slice(start, i) }); return args; } }
    if (ch === ',' && depth === 1) { args.push({ start, text: value.slice(start, i) }); start = i + 1; }
  }
  return args;
}

const quoted = (arg: { start: number; text: string } | undefined): { at: number; id: string } | null => {
  if (!arg) return null;
  const lead = arg.text.length - arg.text.trimStart().length;
  const m = /^"([^"]+)"$/u.exec(arg.text.trim());
  return m ? { at: arg.start + lead, id: m[1]! } : null;
};

export function lookupLits(system: System, value: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const found of value.matchAll(new RegExp(`${LOOKUP}\\(`, 'gu'))) {
    const args = lookupArgs(value, found.index! + LOOKUP.length);
    const table = quoted(args[0]);
    const owner = table ? system.tables?.[table.id] : undefined;
    if (table && owner) out.set(table.at, owner.label || table.id);
    const column = quoted(args[2]);
    if (!column) continue;
    const hit = owner && table ? typeColumns(system, table.id).find(one => one.key === column.id) : undefined;
    if (hit) out.set(column.at, hit.label || column.id);
  }
  return out;
}

const CHOICE_LITS = [
  /@([\p{L}\p{N}_.]+)\s*(?:==|!=)\s*(")/gu,
  /есть\(\s*@([\p{L}\p{N}_.]+)\s*,\s*(")/gu,
];

export function choiceLits(system: System, value: string, tables?: ReadonlyMap<string, string>): Map<number, string> {
  const out = new Map<number, string>();
  const put = (tag: string, at: number) => {
    const end = value.indexOf('"', at + 1);
    if (end < 0) return;
    const label = rowLabelOf(system, choiceTableOf(system, tag, tables), value.slice(at + 1, end));
    if (label) out.set(at, label);
  };
  for (const pattern of CHOICE_LITS) for (const found of value.matchAll(pattern)) put(found[1]!, found.index! + found[0].length - 1);
  for (const found of value.matchAll(/"([^"]*)"\s*(?:==|!=)\s*@([\p{L}\p{N}_.]+)/gu)) {
    const label = rowLabelOf(system, choiceTableOf(system, found[2]!, tables), found[1]!);
    if (label) out.set(found.index!, label);
  }
  return out;
}

export function partsOf(value: string, known?: (tag: string) => boolean, lits?: Map<number, string>): Part[] {
  const out: Part[] = [];
  let text = '';
  let rest = value;
  let offset = 0;
  for (;;) {
    const m = rest.match(PART);
    if (!m || m.index === undefined) break;
    const cut = m.index + m[0].length;
    const lit = m[5] !== undefined;
    const picked = m[1] !== undefined;
    const keep = lit ? Boolean(lits?.has(offset + m.index)) : !known || known(picked ? m[1]! : m[4]!);
    if (!keep) {
      text += rest.slice(0, cut);
      rest = rest.slice(cut);
      offset += cut;
      continue;
    }
    out.push({ text: text + rest.slice(0, m.index) });
    out.push(lit ? { tag: m[5]!, lit: true, ...(lits?.get(offset + m.index) ? { label: lits.get(offset + m.index)! } : {}) }
      : picked ? { tag: m[1]!, by: m[2]!, ...(m[3] ? { rest: m[3].slice(1) } : {}) }
        : { tag: m[4]! });
    text = '';
    rest = rest.slice(cut);
    offset += cut;
  }
  out.push({ text: text + rest });
  return out;
}

const KEYWORDS: string[] = [...FUNCTION_SPECS.map(spec => spec.name), AND, OR, NOT, ...Object.keys(BOOLEANS)];

const rankOf = (f: { tag: string; label: string }, needle: string): number => {
  if (!needle) return 0;
  const label = f.label.toLowerCase();
  const tag = f.tag.toLowerCase();
  if (label === needle || tag === needle) return -1;
  if (label.startsWith(needle) || tag.startsWith(needle)) return 0;
  if (label.split(' → ').some((part, at) => at > 0 && part.startsWith(needle))) return 0;
  if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(label)) return 1;
  if (label.includes(needle) || tag.includes(needle)) return 2;
  return 3;
};

export const shortLabel = (label: string): string => label.split(',')[0]!.trim();

export function joinParts(parts: Part[]): string {
  return parts.map(p => ('tag' in p
    ? (p.lit ? `"${p.tag}"` : p.by !== undefined ? `@${p.tag}.[${p.by}]${p.rest ? `.${p.rest}` : ''}` : `@${p.tag}`)
    : p.text)).join('');
}

const LONE_NUMBER = /^\s*-?\d+(?:[.,]\d+)?\s*$/;

export type NameOption = { tag: string; label: string; group: string };

export function namesOf(system: System, scope: { extraNames?: Map<string, string> | undefined; extraOptions?: { name?: string }[] | undefined; sheets?: SheetNames | undefined; table?: string | undefined }): NameOption[] {
  const { extraNames, extraOptions, sheets, table } = scope;
  const paths = fieldPaths(system);
  const desk = readableFields(system).filter(f => f.lives === 'desk').map(f => ({ tag: `${DESK_ID}.${f.tag}`, label: f.label ?? f.tag, group: 'стол' }));
  const sheet = [
    ...readableFields(system).filter(f => f.lives !== 'desk').map(f => ({ tag: f.tag, label: f.label ?? f.tag, via: false })),
    ...[...paths].map(([tag, label]) => ({ tag, label, via: true })),
  ];
  const offered = new Set((extraOptions ?? []).map(o => o.name).filter(Boolean));
  const viaSheet = (tag: string) => [...(sheets?.keys() ?? [])].some(name => extraNames?.has(`${name}.${tag}`));
  const ownerOf = (tag: string): string | undefined => {
    const head = tag.split('.')[0]!;
    return tag.includes('.') ? sheets?.get(head) : undefined;
  };
  const local = [...(extraNames ?? [])].filter(([tag]) => !offered.has(tag) && !viaSheet(tag) && !sheets?.has(tag)).map(([tag, label]) => {
    const owner = ownerOf(tag);
    return owner
      ? { tag, label: label.endsWith(` (${owner})`) ? label.slice(0, -` (${owner})`.length) : label, group: `у «${owner}»` }
      : { tag, label, group: 'в этом эффекте' };
  }).sort((a, b) => a.label.split(' → ').length - b.label.split(' → ').length);
  const states = statesOf(system);
  if (!sheets?.size) {
    return [
      ...local, ...pickOptions(system, table), ...sheet.map(f => ({ tag: f.tag, label: f.label, group: f.via ? 'по ссылке' : 'поле листа' })),
      ...states.map(s => ({ ...s, group: 'висит на листе' })), ...desk,
    ];
  }
  const named = [...sheets];
  return [
    ...local,
    ...named.map(([name, label]) => ({ tag: name, label, group: 'лист целиком' })),
    ...named.flatMap(([name, label]) => sheet.map(f => ({ tag: `${name}.${f.tag}`, label: f.label, group: `у «${label}»` }))),
    ...named.flatMap(([name, label]) => states.map(s => ({ tag: `${name}.${s.tag}`, label: s.label, group: `висит у «${label}»` }))),
    ...desk,
  ];
}

export function FormulaChips({ value, onChange, onFinal, system, table, placeholder, onKeyDown, onBlur, onFocus, prefix, suffix, names, extraNames, badges, sheets, extraOptions, calculator, readOnly, autoFocus, onChipPick, whole, notes = true }: {
  value: string;
  onChange: (next: string) => void;
  system: System;
  table?: string;
  placeholder?: string;
  onFinal?: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;

  onFocus?: () => void;

  onQuery?: (active: boolean) => void;

  prefix?: ReactNode;

  suffix?: ReactNode;

  names?: Record<string, ReactNode>;

  extraNames?: Map<string, string>;

  sheets?: SheetNames;

  extraOptions?: { group: string; label: string; name?: string; onPick: (insert: (piece: string) => string) => void }[];

  calculator?: boolean;

  readOnly?: boolean;

  autoFocus?: boolean;

  badges?: Map<string, string>;

  onChipPick?: (tag: string, label: string) => void;
  whole?: boolean;
  notes?: boolean;
}) {
  const paths = useMemo(() => fieldPaths(system), [system]);
  const marks = useMemo(() => tagWords(system), [system]);
  const lits = useMemo(() => new Map([...lookupLits(system, value), ...choiceLits(system, value, tablesOf(extraNames))]), [system, value, extraNames]);
  const parts = useMemo(
    () => partsOf(value, tag => {
      const owned = onSheet(tag, sheets);
      if (owned) return knownSheetName(system, owned.rest) || Boolean(extraNames?.has(owned.rest));
      return knownSheetName(system, tag) || Boolean(names?.[tag]) || Boolean(extraNames?.has(tag)) || Boolean(sheets?.has(tag)) || marks.has(tag);
    }, lits),
    [value, system, names, extraNames, paths, sheets, marks, lits],
  );
  const host = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaving.current) clearTimeout(leaving.current); }, []);
  const [active, setActive] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [closed, setClosed] = useState(false);
  const [dot, setDot] = useState<{ index: number; text: string; offered?: boolean; base?: string; typed?: boolean } | null>(null);
  const signature = useMemo(() => {
    if (active === null || !parts[active] || !('text' in parts[active]!)) return null;
    const own = dot?.index === active ? dot.text : (parts[active] as { text: string }).text;
    return callAt(`${joinParts(parts.slice(0, active))}${own.slice(0, caret)}`);
  }, [active, caret, parts, dot]);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnce = useRef(Boolean(autoFocus));
  const sideOf = (tag: string) => {
    const owned = onSheet(tag, sheets);
    if (!owned) return null;
    return (
      <span className={`chips__side chips__side--${owned.head === DESK_ID ? 'desk' : 'sheet'}`} title={owned.head === DESK_ID ? 'поле стола' : `поле листа «${sheets?.get(owned.head) ?? owned.head}»`}>
        {owned.head === DESK_ID ? 'стол' : sheets?.get(owned.head) ?? owned.head}
      </span>
    );
  };
  const badge = (tag: string) => (badges?.has(tag)
    ? <span className="chips__side chips__side--input" title="вход эффекта: значение приносит тот, кто вызывает">{badges.get(tag)}</span>
    : marks.has(tag) && !hasField(system, tag) && !extraNames?.has(tag)
      ? <span className="chips__side chips__side--mark" title={`метка броска из таблицы «${marks.get(tag)}»: по ней бросок находят правки — преимущество, «Благословение», «Щит»`}>метка</span>
      : null);

  const fields = useMemo(() => namesOf(system, { extraNames, extraOptions, sheets, table }), [system, extraNames, extraOptions, paths, sheets, table]);

  const pendingFocus = useRef<{ index: number; caret: number; value: string; offer?: boolean | 'dot' } | { offset: number; skip: string[]; offer?: boolean | 'dot' } | null>(null);
  useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    let index = -1;
    let at = 0;
    if ('offset' in want) {
      if (want.skip.includes(value)) return;
      let start = 0;
      for (const [i, part] of parts.entries()) {
        const length = 'tag' in part ? joinParts([part]).length : part.text.length;
        if (!('tag' in part) && want.offset <= start + length) { index = i; at = Math.max(0, want.offset - start); break; }
        start += length;
      }
    } else {
      if (want.value !== value) return;
      index = want.index;
      at = want.caret;
    }
    const el = inputs.current.get(index);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    el.setSelectionRange(at, at);
    const formed = want.offer && at === 0 ? chipBefore(index) : null;
    if (formed && (deeper(formed).fields.length || deeper(formed).extras.length)) {
      const preferred = whole ? undefined : picksOf(extraNames)?.get(formed);
      setDot({ index, text: '', offered: true, ...(want.offer === 'dot' ? { typed: true } : {}) });
      setCaret(0);
      setHighlight(Math.max(0, [formed, ...deeper(formed).fields.map(f => f.tag)].indexOf(preferred ?? formed)));
      setClosed(false);
    }
  });

  const commitParts = (next: Part[], focusAt?: { index: number; caret: number }) => {
    const joined = joinParts(next);
    if (focusAt) pendingFocus.current = { ...focusAt, value: joined };
    onChange(joined);
    onFinal?.(resolveNames(joined, fields, { final: true }).text);
  };

  const chipBefore = (index: number): string | null => {
    const before = parts[index - 1];
    return index > 0 && before && 'tag' in before && !before.lit && before.by === undefined ? before.tag : null;
  };
  const deeper = (base: string) => {
    const prefix = `${base}.`;
    const through = [...(sheets?.keys() ?? [])].filter(name => name !== base).map(name => `${name}.${base}.`);
    return {
      fields: fields.filter(f => f.tag.startsWith(prefix) || through.some(via => f.tag.startsWith(via))),
      extras: (extraOptions ?? []).filter(o => o.name?.startsWith(prefix)),
    };
  };
  const tail = (label: string): string => label.split(' · ').pop() ?? label;
  const dotted = dot && active === dot.index ? dot.base ?? chipBefore(dot.index) : null;

  const bareQuery = (text: string, at: number): { at: number; needle: string } | null => {
    const found = matchTagQuery(text, at);
    if (!found || text[found.at] === '@') return found;
    const words = (/(?:[\p{L}\p{N}_]+ )+$/u.exec(text.slice(0, found.at))?.[0] ?? '').split(' ').filter(Boolean);
    const labels = [...fields.map(f => f.label), ...(extraOptions ?? []).map(o => o.label)].map(plain);
    for (let size = words.length; size >= 1; size -= 1) {
      const lead = `${words.slice(-size).join(' ')} `;
      if (labels.some(label => label.startsWith(plain(`${lead}${found.needle}`)))) return { at: found.at - lead.length, needle: `${lead}${found.needle}`.toLowerCase() };
    }
    return found;
  };

  const typed = !dotted && active !== null && 'text' in (parts[active] ?? {})
    ? typedPath((parts[active] as { text: string }).text, caret)
    : null;
  const through = typed && (deeper(typed.base).fields.length || deeper(typed.base).extras.length) ? typed : null;
  const query = dotted
    ? { at: 0, needle: dot!.offered ? '' : dot!.text.slice(1, caret).trim().toLowerCase() }
    : through
      ? { at: through.at, needle: through.needle }
      : active !== null && 'text' in (parts[active] ?? {})
        ? bareQuery((parts[active] as { text: string }).text, caret)
        : null;
  const tags = new Set(fields.map(f => f.tag));
  const inside = (tag: string): string | null => {
    const at = tag.indexOf('.');
    const base = at > 0 ? tag.slice(0, at) : '';
    return base && tags.has(base) ? base : null;
  };
  const below = (base: string): number => fields.filter(f => inside(f.tag) === base).length;
  const hidden = (f: { tag: string }, needle: string): boolean => {
    const base = inside(f.tag);
    if (!base) return false;
    const label = (fields.find(one => one.tag === base)?.label ?? '').toLowerCase();
    return !needle || base.toLowerCase().startsWith(needle) || label.startsWith(needle);
  };
  const wholeRow = dotted && dot!.offered ? fields.filter(f => f.tag === dotted).slice(0, 1) : [];
  const matches = dotted || through
    ? [...wholeRow, ...deeper(dotted ?? through!.base).fields
      .filter(f => !query!.needle || rankOf({ tag: '', label: tail(f.label) }, query!.needle) < 3)
      .sort((a, b) => rankOf({ tag: '', label: tail(a.label) }, query!.needle) - rankOf({ tag: '', label: tail(b.label) }, query!.needle))
      .slice(0, 12)]
    : query
      ? fields.filter(f => (!query.needle || rankOf(f, query.needle) < 3) && !hidden(f, query.needle))
        .sort((a, b) => rankOf(a, query.needle) - rankOf(b, query.needle))
        .slice(0, 12)
      : [];
  const extras = dotted || through
    ? deeper(dotted ?? through!.base).extras
      .filter(o => !query!.needle || rankOf({ tag: '', label: tail(o.label) }, query!.needle) < 3)
      .sort((a, b) => rankOf({ tag: '', label: tail(a.label) }, query!.needle) - rankOf({ tag: '', label: tail(b.label) }, query!.needle))
    : query
      ? (extraOptions ?? [])
        .filter(o => (!query.needle || rankOf({ tag: '', label: o.label }, query.needle) < 3) && !(o.name && hidden({ tag: o.name }, query.needle)))
        .sort((a, b) => rankOf({ tag: '', label: a.label }, query.needle) - rankOf({ tag: '', label: b.label }, query.needle))
      : [];
  const bare = query && active !== null && 'text' in (parts[active] ?? {})
    ? (parts[active] as { text: string }).text[query.at] !== '@'
    : false;
  const words = query && bare && !dotted && !through
    ? KEYWORDS.filter(word => query.needle !== '' && rankOf({ tag: '', label: word }, query.needle) < 1)
      .sort((a, b) => rankOf({ tag: '', label: a }, query.needle) - rankOf({ tag: '', label: b }, query.needle))
      .slice(0, 8)
    : [];
  const shownMenu = !closed && (words.length > 0 || matches.length > 0 || extras.length > 0);
  const total = words.length + extras.length + matches.length;
  const lit = total ? Math.min(highlight, total - 1) : 0;
  const pickDotted = (tag: string) => {
    if (!dot) return;
    const rest = dot.offered ? (parts[dot.index] as { text: string }).text : dot.text.slice(caret);
    const next = parts.map((p, i) => (i === dot.index - 1 ? { tag } : i === dot.index ? { text: rest } : p));
    setDot(null);
    commitParts(next, { index: dot.index, caret: 0 });
  };
  const baseOf = (tag: string): string | null => {
    for (let base = tag; base; base = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : '') {
      if (fields.some(f => f.tag === base) && (deeper(base).fields.length || deeper(base).extras.length)) return base;
    }
    return null;
  };
  const offerAt = (chipIndex: number, tag: string): void => {
    const base = baseOf(tag);
    const input = inputs.current.get(chipIndex + 1);
    if (!base || !input) return;
    input.focus();
    input.setSelectionRange(0, 0);
    const list = [base, ...deeper(base).fields.map(f => f.tag)];
    setDot({ index: chipIndex + 1, text: '', offered: true, base });
    setCaret(0);
    setHighlight(Math.max(0, list.indexOf(tag)));
    setClosed(false);
  };
  const chooseExtra = (option: (typeof extras)[number]) => {
    if (dotted && option.name) pickDotted(option.name); else if (through && option.name) pick(option.name); else pickExtra(option.onPick);
  };
  const chooseField = (tag: string) => {
    if (dotted) pickDotted(tag); else pick(tag);
  };
  const pickAt = (index: number) => {
    if (index < extras.length) chooseExtra(extras[index]!);
    else if (index < extras.length + matches.length) chooseField(matches[index - extras.length]!.tag);
    else pickWord(words[index - extras.length - matches.length]!);
  };

  const pickWord = (word: string) => {
    if (active === null || !query) return;
    const part = parts[active] as { text: string };
    const before = part.text.slice(0, query.at);
    const after = part.text.slice(caret);
    const piece = functionSpec(word) ? `${word}(` : `${word} `;
    const text = before + piece + after;
    commitParts(parts.map((p, i) => (i === active ? { text } : p)), { index: active, caret: before.length + piece.length });
  };

  const pickExtra = (onPick: (insert: (piece: string) => string) => void) => {
    if (active === null || !query) return;
    const part = parts[active] as { text: string };
    const before = part.text.slice(0, query.at);
    const after = part.text.slice(caret);
    const start = joinParts(parts.slice(0, active)).length + before.length;
    const emptied = joinParts(parts.map((p, i) => (i === active ? { text: before + after } : p)));
    const insert = (piece: string) => {
      pendingFocus.current = { offset: start + piece.length, skip: [value, emptied] };
      return joinParts(parts.map((p, i) => (i === active
        ? { text: before + piece + after }
        : p)));
    };
    onChange(emptied);
    setClosed(true);
    onPick(insert);
  };

  const pick = (tag: string) => {
    if (active === null || !query) return;
    const part = parts[active] as { text: string };

    const before = part.text.slice(0, query.at);
    const after = part.text.slice(caret);
    const next = [
      ...parts.slice(0, active),
      { text: before }, { tag }, { text: after },
      ...parts.slice(active + 1),
    ];
    commitParts(next, { index: active + 2, caret: 0 });
    if (pendingFocus.current && baseOf(tag) === tag) pendingFocus.current = { ...pendingFocus.current, offer: true };
  };

  const insertOp = (open: string, close = '') => {
    const index = active !== null && 'text' in (parts[active] ?? {}) ? active : parts.length - 1;
    const part = parts[index] as { text: string };
    const at = index === active ? Math.min(caret, part.text.length) : part.text.length;
    const text = part.text.slice(0, at) + open + close + part.text.slice(at);
    const next = parts.map((p, i) => (i === index ? { text } : p));
    setCaret(at + open.length);
    commitParts(next, { index, caret: at + open.length });
  };


  const opButton = (op: typeof OPS[number]) => (
    <button
      key={op.label} type="button"
      className={op.word ? 'chips__op chips__op--word' : 'chips__op'}
      title={op.hint}
      onMouseDown={e => { e.preventDefault(); insertOp(op.open, op.close); }}
    >{op.label}</button>
  );

  const editText = (index: number, entered: string, enteredAt: number) => {
    const continued = dot?.index === index && dot.offered && dot.typed && /^[\p{L}\p{N}_]/u.test(entered);
    const typed = continued ? `.${entered}` : entered;
    const typedAt = continued ? enteredAt + 1 : enteredAt;
    const base = chipBefore(index);
    if (base && typed.startsWith('.') && (dot?.index === index || !(parts[index] as { text: string }).text.startsWith('.'))) {
      const below = deeper(base);
      if (below.fields.length || below.extras.length) {
        setDot({ index, text: typed });
        setCaret(typedAt);
        setHighlight(0);
        setClosed(false);
        return;
      }
    }
    if (dot?.index === index) setDot(null);
    const glued = index > 0 && 'tag' in (parts[index - 1] ?? {}) && /^[\p{L}\p{N}_.]/u.test(typed);
    const text = glued ? ` ${typed}` : typed;
    const at = glued ? typedAt + 1 : typedAt;
    setHighlight(0);
    setClosed(false);
    const seen = text.includes('@') ? { text, caret: at } : resolveNames(text, fields, { caret: at });
    const opened = text.includes('@') ? null : /@([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)\.$/u.exec(seen.text.slice(0, seen.caret));
    if (opened && (deeper(opened[1]!).fields.length || deeper(opened[1]!).extras.length)) {
      const split = [
        ...parts.slice(0, index),
        { text: seen.text.slice(0, opened.index) }, { tag: opened[1]! }, { text: seen.text.slice(seen.caret) },
        ...parts.slice(index + 1),
      ];
      commitParts(split, { index: index + 2, caret: 0 });
      if (pendingFocus.current) pendingFocus.current = { ...pendingFocus.current, offer: 'dot' };
      return;
    }
    const next = parts.map((p, i) => (i === index ? { text: seen.text } : p));
    setCaret(seen.caret);
    if (seen.text.includes('@')) pendingFocus.current = { offset: joinParts(parts.slice(0, index)).length + seen.caret, skip: [], offer: true };
    commitParts(next);
  };

  const dropChip = (chipIndex: number) => {

    const before = parts[chipIndex - 1] as { text: string } | undefined;
    const after = parts[chipIndex + 1] as { text: string } | undefined;
    const merged = { text: `${before?.text ?? ''}${after?.text ?? ''}` };
    const next = [
      ...parts.slice(0, Math.max(0, chipIndex - 1)),
      merged,
      ...parts.slice(chipIndex + 2),
    ];
    commitParts(next, { index: Math.max(0, chipIndex - 1), caret: (before?.text ?? '').length });
  };

  const leave = () => {
    setDot(null);

    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = setTimeout(() => {
      leaving.current = null;
      if (host.current && !host.current.contains(document.activeElement)) {
        setActive(null);
        onBlur?.();
      }
    }, 120);
  };

  const chipText = (part: { tag: string; by?: string; rest?: string }): string => (part.by !== undefined
    ? pickWords(system, part, table, extraNames, sheets)
    : shortLabel(labelOfTag(system, part.tag, extraNames, sheets)));

  const unknownLine = notes && !readOnly
    ? (() => {
      const own = active !== null && 'text' in (parts[active] ?? {}) ? joinParts(parts.slice(0, active)).length + Math.min(caret, (parts[active] as { text: string }).text.length) : undefined;
      const found = resolveNames(value, fields, own === undefined ? { final: true } : { caret: own }).unknown[0];
      return found ? NO_NAME(found) : null;
    })()
    : null;

  const empty = parts.length === 1 && !(parts[0] as { text: string }).text;

  const lookups = lookupNames(system, value);
  if (readOnly) {
    return (
      <span className="chips chips--read" data-value={value}>
        {prefix}
        {empty ? <span className="chips__placeholder">{placeholder}</span> : parts.map((part, index) => ('tag' in part ? (
          part.lit ? (
            <span key={index} className="chips__chip chips__chip--lookup" title="из таблицы">{part.label ?? lookups.get(part.tag) ?? part.tag}</span>
          ) : names?.[part.tag] !== undefined ? (
            <span key={index} className="chips__group">{names[part.tag]}</span>
          ) : (
            <span
              key={index}
              className={`chips__chip${onChipPick ? ' chips__chip--pick' : ''}`}
              title={onChipPick ? 'откуда это и где видно' : undefined}
              onClick={onChipPick ? e => { e.stopPropagation(); onChipPick(part.tag, labelOfTag(system, part.tag, extraNames, sheets)); } : undefined}
            >
              {sideOf(part.tag)}
              <span>{chipText(part)}</span>
              {badge(part.tag)}
            </span>
          )
        ) : <span key={index} className="chips__word">{spoken(part.text, lookups)}</span>))}
      </span>
    );
  }

  return (
    <div className="chips" ref={host} onKeyDown={onKeyDown} data-value={value}>
      <div className="chips__row" onMouseDown={e => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputs.current.get(parts.length - 1)?.focus();
        }
      }}>
        {prefix}
        {parts.map((part, index) => 'tag' in part ? (
          part.lit ? (
            <span key={index} className="chips__chip chips__chip--lookup" title="из таблицы">
              <span>{part.label ?? lookups.get(part.tag) ?? part.tag}</span>
              <button type="button" className="chips__x" aria-label="убрать"
                onMouseDown={e => { e.preventDefault(); dropChip(index); }}>×</button>
            </span>
          ) : names?.[part.tag] !== undefined ? (
            <span key={index} className="chips__group">{names[part.tag]}</span>
          ) : (
          <span key={index} className="chips__chip">
            {sideOf(part.tag)}
            <span
              title={onChipPick ? `${labelOfTag(system, part.tag, extraNames, sheets)} — откуда это и где видно` : labelOfTag(system, part.tag, extraNames, sheets)}
              className={onChipPick || (part.by === undefined && baseOf(part.tag)) ? 'chips__name--pick' : undefined}
              onMouseDown={e => {
                if (part.by !== undefined) { if (onChipPick) { e.preventDefault(); onChipPick(part.tag, labelOfTag(system, part.tag, extraNames, sheets)); } return; }
                if (!onChipPick && !baseOf(part.tag)) return;
                e.preventDefault();
                offerAt(index, part.tag);
                onChipPick?.(part.tag, labelOfTag(system, part.tag, extraNames, sheets));
              }}
            >
              {chipText(part)}
            </span>
            {badge(part.tag)}
            <button
              type="button" className="chips__x" aria-label="убрать поле"
              onMouseDown={e => { e.preventDefault(); dropChip(index); }}
            >×</button>
          </span>
          )
        ) : (
          <input
            key={index}
            ref={el => {
              if (!el) { inputs.current.delete(index); return; }
              inputs.current.set(index, el);
              if (focusOnce.current && index === parts.length - 1) {
                focusOnce.current = false;
                el.focus();
                el.setSelectionRange(parts.length === 1 && LONE_NUMBER.test(el.value) ? 0 : el.value.length, el.value.length);
              }
            }}

            className={`chips__text ${!part.text && index !== parts.length - 1 ? 'chips__text--ghost' : ''}`}
            value={dot?.index === index && !dot.offered ? dot.text : part.text}
            placeholder={empty ? placeholder : undefined}
            size={Math.max(1, (dot?.index === index && !dot.offered ? dot.text : part.text).length || (empty ? (placeholder?.length ?? 8) : 1))}
            spellCheck={false}
            onFocus={e => { setActive(index); setCaret(e.currentTarget.selectionStart ?? 0); onFocus?.(); }}
            onBlur={leave}
            onChange={e => { setCaret(e.currentTarget.selectionStart ?? e.target.value.length); editText(index, e.target.value, e.currentTarget.selectionStart ?? e.target.value.length); }}
            onKeyUp={e => setCaret(e.currentTarget.selectionStart ?? 0)}
            onClick={e => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={e => {
              if (shownMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                const next = (lit + step + total) % total;
                setHighlight(next);
                menuRef.current?.children[next]?.scrollIntoView?.({ block: 'nearest' });
                return;
              }
              if (shownMenu && (e.key === 'Enter' || e.key === 'Tab') && wholeRow.length && lit === extras.length && chipBefore(dot!.index) === dotted) {
                setDot(null);
              } else if (shownMenu && (e.key === 'Enter' || e.key === 'Tab')) {
                e.preventDefault();
                e.stopPropagation();
                pickAt(lit);
                return;
              }
              if (shownMenu && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setClosed(true);
                return;
              }
              const el = e.currentTarget;
              const hop = (to: number, at: 'start' | 'end') => {
                const next = inputs.current.get(to);
                if (!next) return;
                e.preventDefault();
                next.focus();
                const where = at === 'end' ? next.value.length : 0;
                next.setSelectionRange(where, where);
              };
              if (e.key === 'ArrowLeft' && el.selectionStart === 0 && el.selectionEnd === 0 && index > 1) { hop(index - 2, 'end'); return; }
              if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && index < parts.length - 2) { hop(index + 2, 'start'); return; }
              if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0
                && e.currentTarget.selectionEnd === 0 && index > 0) {
                e.preventDefault();
                dropChip(index - 1);
              }
            }}
          />
        ))}
        {suffix}
      </div>
      {signature ? <Signature at={signature} /> : null}
      {unknownLine ? <div className="chips__note" role="status">{unknownLine}</div> : null}
      {calculator && active !== null ? (
        <div className="chips__ops">
          {OPS.filter(op => !op.word).map(opButton)}
          <span className="chips__ops-split" aria-hidden />
          {OPS.filter(op => op.word).map(opButton)}
        </div>
      ) : null}
      {shownMenu ? (
        <div className="slot__menu" ref={menuRef} role="listbox">
          {extras.map((option, i) => (
            <button
              key={`extra-${i}`} type="button" role="option" aria-selected={i === lit}
              className={`slot__option${i === lit ? ' slot__option--lit' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={e => { e.preventDefault(); chooseExtra(option); }}
            >
              <span className="slot__group slot__group--record">{option.group}</span>
              {option.label}
            </button>
          ))}
          {matches.map((f, j) => (
            <button
              key={f.tag} type="button" role="option" aria-selected={extras.length + j === lit}
              className={`slot__option${extras.length + j === lit ? ' slot__option--lit' : ''}`}
              onMouseEnter={() => setHighlight(extras.length + j)}
              onMouseDown={e => { e.preventDefault(); chooseField(f.tag); }}
            >
              <span className="slot__group">{f.group}</span>
              {dotted && f.tag === dotted ? `${f.label} целиком` : dotted || through ? shortOf(f.label, dotted ?? through!.base) : f.label}
              {!dotted && !through && below(f.tag) ? <span className="slot__more" title="наберите точку после имени — откроется список">. ещё {below(f.tag)}</span> : null}
            </button>
          ))}
          {words.map((word, k) => (
            <button
              key={`word-${word}`} type="button" role="option" aria-selected={extras.length + matches.length + k === lit}
              className={`slot__option${extras.length + matches.length + k === lit ? ' slot__option--lit' : ''}`}
              onMouseEnter={() => setHighlight(extras.length + matches.length + k)}
              onMouseDown={e => { e.preventDefault(); pickWord(word); }}
            >
              <span className="slot__group slot__group--record">формула</span>
              {word}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
