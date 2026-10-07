import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { matchTagQuery } from './tag-suggest.tsx';
import { fieldPaths } from './paths.ts';
import { DESK_ID } from '@vtt/engine/engine/owners';
import { fieldsOf, fieldOf, hasField, ROW } from '@vtt/engine/model/sheet-columns';
import { rowTables } from '@vtt/engine/model/tables';
import { tagWords } from '@vtt/engine/engine/roll-tags';

const plainLabel = (system: System, tag: string, extra?: Map<string, string>): string =>
  fieldOf(system, tag)?.label ?? extra?.get(tag) ?? fieldPaths(system).get(tag)
  ?? system.effects?.[tag]?.label ?? tag;

const statesOf = (system: System): { tag: string; label: string }[] =>
  Object.entries(system.effects ?? {})
    .filter(([, effect]) => effect.activation === 'passive')
    .map(([tag, effect]) => ({ tag, label: effect.label ?? tag }));

export type SheetNames = ReadonlyMap<string, string>;

export function lookupNames(system: System, value: string): Map<string, string> {
  const out = new Map<string, string>();
  const call = /таблица\(\s*"([^"]+)"/gu;
  for (const found of value.matchAll(call)) {
    const table = system.tables?.[found[1]!];
    if (!table) continue;
    out.set(found[1]!, table.label || found[1]!);
    for (const column of table.columns ?? []) out.set(column.key, column.label || column.key);
  }
  for (const found of value.matchAll(/,\s*"([^"]+)"\s*\)/gu)) {
    if (out.has(found[1]!)) continue;
    const column = Object.values(system.tables ?? {}).flatMap(table => table.columns ?? []).find(one => one.key === found[1]);
    if (column) out.set(found[1]!, column.label || found[1]!);
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
  return owned ? plainLabel(system, owned.rest, extra) : plainLabel(system, tag, extra);
};

const knownSheetName = (system: System, tag: string, paths: Map<string, string>): boolean =>
  hasField(system, tag) || paths.has(tag) || Boolean(system.effects?.[tag]);

export type Part = { text: string } | { tag: string; lit?: boolean };

const OPS: { label: string; hint: string; open: string; close?: string; word?: boolean }[] = [
  { label: '+', hint: 'сложить', open: ' + ' },
  { label: '−', hint: 'вычесть', open: ' - ' },
  { label: '×', hint: 'умножить', open: ' * ' },
  { label: '÷', hint: 'поделить', open: ' / ' },
  { label: '( )', hint: 'скобки: что внутри — считается первым', open: '(', close: ')' },
  { label: 'округлить вниз', hint: 'отбросить дробную часть: 7,9 → 7', open: 'округлить вниз(', close: ')', word: true },
  { label: 'округлить вверх', hint: 'добить до целого: 7,1 → 8', open: 'округлить вверх(', close: ')', word: true },
  { label: 'округлить', hint: 'по школьным правилам: 7,5 → 8, 7,4 → 7', open: 'округлить(', close: ')', word: true },
  { label: 'модуль', hint: 'число без минуса: −3 → 3', open: 'модуль(', close: ')', word: true },
  { label: 'большее из', hint: 'самое большое из перечисленного через запятую', open: 'большее из(', close: ', )', word: true },
  { label: 'меньшее из', hint: 'самое маленькое из перечисленного через запятую', open: 'меньшее из(', close: ', )', word: true },
  { label: 'если', hint: 'если условие верно — первое, иначе второе', open: 'если(', close: ', , )', word: true },
  { label: 'или', hint: 'первое заданное: если класс не выбран — берётся второе', open: 'или(', close: ', )', word: true },
  { label: 'есть в списке', hint: 'да, если в списке есть значение: спасброски класса — «сила»', open: 'есть(', close: ', "")', word: true },
];

const LOOKUP = 'таблица';

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
    const pool = owner ? [owner] : Object.values(system.tables ?? {});
    const hit = pool.flatMap(one => one.columns ?? []).find(one => one.key === column.id);
    if (hit) out.set(column.at, hit.label || column.id);
  }
  return out;
}

export function partsOf(value: string, known?: (tag: string) => boolean, lits?: Map<number, string>): Part[] {
  const out: Part[] = [];
  let text = '';
  let rest = value;
  let offset = 0;
  for (;;) {
    const m = rest.match(/[@#]([\p{L}\p{N}_.]+)|"([^"]*)"/u);
    if (!m || m.index === undefined) break;
    const cut = m.index + m[0].length;
    const lit = m[2] !== undefined;
    const keep = lit ? Boolean(lits?.has(offset + m.index)) : !known || known(m[1]!);
    if (!keep) {
      text += rest.slice(0, cut);
      rest = rest.slice(cut);
      offset += cut;
      continue;
    }
    out.push({ text: text + rest.slice(0, m.index) });
    out.push(lit ? { tag: m[2]!, lit: true } : { tag: m[1]! });
    text = '';
    rest = rest.slice(cut);
    offset += cut;
  }
  out.push({ text: text + rest });
  return out;
}

const rankOf = (f: { tag: string; label: string }, needle: string): number => {
  if (!needle) return 0;
  const label = f.label.toLowerCase();
  const tag = f.tag.toLowerCase();
  if (label.startsWith(needle) || tag.startsWith(needle)) return 0;
  if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(label)) return 1;
  if (label.includes(needle) || tag.includes(needle)) return 2;
  return 3;
};

export const shortLabel = (label: string): string => label.split(',')[0]!.trim();

export function joinParts(parts: Part[]): string {
  return parts.map(p => ('tag' in p ? (p.lit ? `"${p.tag}"` : `@${p.tag}`) : p.text)).join('');
}

export function FormulaChips({ value, onChange, system, table, placeholder, onKeyDown, onBlur, onFocus, prefix, suffix, names, extraNames, badges, sheets, extraOptions, calculator, readOnly, autoFocus, onChipPick }: {
  value: string;
  onChange: (next: string) => void;
  system: System;
  table?: string;
  placeholder?: string;
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
}) {
  const paths = useMemo(() => fieldPaths(system), [system]);
  const marks = useMemo(() => tagWords(system), [system]);
  const lits = useMemo(() => lookupLits(system, value), [system, value]);
  const parts = useMemo(
    () => partsOf(value, tag => {
      const owned = onSheet(tag, sheets);
      if (owned) return knownSheetName(system, owned.rest, paths) || Boolean(extraNames?.has(owned.rest));
      return knownSheetName(system, tag, paths) || Boolean(names?.[tag]) || Boolean(extraNames?.has(tag)) || Boolean(sheets?.has(tag)) || marks.has(tag);
    }, lits),
    [value, system, names, extraNames, paths, sheets, marks, lits],
  );
  const host = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [active, setActive] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [closed, setClosed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnce = useRef(Boolean(autoFocus));
  const [lookup, setLookup] = useState<{ table: string; column: string } | null>(null);
  const pending = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pending.current === null) return;
    let left = pending.current;
    pending.current = null;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const size = joinParts([part]).length;
      if ('text' in part && left <= size) {
        const el = inputs.current.get(i);
        el?.focus();
        el?.setSelectionRange(left, left);
        setActive(i);
        setCaret(left);
        return;
      }
      left -= size;
    }
  }, [parts]);
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

  const fields = useMemo(() => {
    const desk = fieldsOf(system).filter(f => f.lives === 'desk').map(f => ({ tag: `${DESK_ID}.${f.tag}`, label: f.label ?? f.tag, group: 'стол' }));
    const sheet = [
      ...fieldsOf(system).filter(f => f.lives !== 'desk').map(f => ({ tag: f.tag, label: f.label ?? f.tag, via: false })),
      ...[...paths].map(([tag, label]) => ({ tag, label, via: true })),
    ];
    const offered = new Set((extraOptions ?? []).map(o => o.name).filter(Boolean));
    const local = [...(extraNames ?? [])].filter(([tag]) => !offered.has(tag)).map(([tag, label]) => ({ tag, label, group: 'здесь же' }));
    const states = statesOf(system);
    if (!sheets?.size) {
      return [
        ...local, ...sheet.map(f => ({ tag: f.tag, label: f.label, group: f.via ? 'по ссылке' : 'поле' })),
        ...states.map(s => ({ ...s, group: 'висит на листе' })), ...desk,
      ];
    }
    const named = [...sheets];
    return [
      ...local,
      ...named.map(([name, label]) => ({ tag: name, label, group: 'листы' })),
      ...named.flatMap(([name, label]) => sheet.map(f => ({ tag: `${name}.${f.tag}`, label: f.label, group: `поле: ${label}` }))),
      ...named.flatMap(([name, label]) => states.map(s => ({ tag: `${name}.${s.tag}`, label: s.label, group: `висит: ${label}` }))),
      ...desk,
    ];
  }, [system, extraNames, extraOptions, paths, sheets]);

  const commitParts = (next: Part[], focusAt?: { index: number; caret: number }) => {
    onChange(joinParts(next));
    if (focusAt) {
      queueMicrotask(() => {
        const el = inputs.current.get(focusAt.index);
        el?.focus();
        el?.setSelectionRange(focusAt.caret, focusAt.caret);
      });
    }
  };

  const query = active !== null && 'text' in (parts[active] ?? {})
    ? matchTagQuery((parts[active] as { text: string }).text, caret)
    : null;
  const matches = query
    ? fields.filter(f => !query.needle || rankOf(f, query.needle) < 3)
      .sort((a, b) => rankOf(a, query.needle) - rankOf(b, query.needle))
      .slice(0, 12)
    : [];
  const extras = query
    ? (extraOptions ?? [])
      .filter(o => !query.needle || rankOf({ tag: '', label: o.label }, query.needle) < 3)
      .sort((a, b) => rankOf({ tag: '', label: a.label }, query.needle) - rankOf({ tag: '', label: b.label }, query.needle))
    : [];
  const shownMenu = !closed && (matches.length > 0 || extras.length > 0);
  const total = extras.length + matches.length;
  const lit = total ? Math.min(highlight, total - 1) : 0;
  const pickAt = (index: number) => {
    if (index < extras.length) pickExtra(extras[index]!.onPick);
    else pick(matches[index - extras.length]!.tag);
  };

  const pickExtra = (onPick: (insert: (piece: string) => string) => void) => {
    if (active === null || !query) return;
    const part = parts[active] as { text: string };
    const before = part.text.slice(0, query.at);
    const after = part.text.slice(caret);
    const insert = (piece: string) => joinParts(parts.map((p, i) => (i === active
      ? { text: before + piece + after }
      : p)));
    onChange(insert(''));
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

  const insertAt = (open: string, close: string) => {
    const index = active !== null && 'text' in (parts[active] ?? {}) ? active : parts.length - 1;
    const part = parts[index] as { text: string };
    const at = index === active ? Math.min(caret, part.text.length) : part.text.length;
    pending.current = joinParts(parts.slice(0, index)).length + at + open.length;
    const text = part.text.slice(0, at) + open + close + part.text.slice(at);
    onChange(joinParts(parts.map((p, i) => (i === index ? { text } : p))));
  };
  const tables = rowTables(system);
  const columnsFor = (table: string): [string, string][] => (table
    ? (system.tables?.[table]?.columns ?? []).map(c => [c.key, c.label || c.key])
    : tables.flatMap(([id, t]) => (t.columns ?? []).map(c => [c.key, `${c.label || c.key} · ${t.label || id}`] as [string, string])));
  const linkColumns: [string, string][] = (table ? system.tables?.[table]?.columns ?? [] : [])
    .filter(c => c.kind === 'column').map(c => [c.key, c.label || c.key]);
  const placeLookup = () => {
    if (!lookup?.column) return;
    const column = lookup.column === ROW || lookup.column.startsWith(`${ROW}.`) ? `@${lookup.column}` : `"${lookup.column}"`;
    if (lookup.table) insertAt(`${LOOKUP}("${lookup.table}", `, `, ${column})`);
    else insertAt(`${LOOKUP}(`, `, , ${column})`);
    setLookup(null);
  };

  const opButton = (op: typeof OPS[number]) => (
    <button
      key={op.label} type="button"
      className={op.word ? 'chips__op chips__op--word' : 'chips__op'}
      title={op.hint}
      onMouseDown={e => { e.preventDefault(); insertOp(op.open, op.close); }}
    >{op.label}</button>
  );

  const editText = (index: number, typed: string, typedAt: number) => {
    const glued = index > 0 && 'tag' in (parts[index - 1] ?? {}) && /^[\p{L}\p{N}_.]/u.test(typed);
    const text = glued ? ` ${typed}` : typed;
    const at = glued ? typedAt + 1 : typedAt;
    setHighlight(0);
    setClosed(false);
    const next = parts.map((p, i) => (i === index ? { text } : p));
    setCaret(at);
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

    setTimeout(() => {
      if (host.current && !host.current.contains(document.activeElement)) {
        setActive(null);
        onBlur?.();
      }
    }, 120);
  };

  const empty = parts.length === 1 && !(parts[0] as { text: string }).text;

  const lookups = lookupNames(system, value);
  if (readOnly) {
    return (
      <span className="chips chips--read" data-value={value}>
        {prefix}
        {empty ? <span className="chips__placeholder">{placeholder}</span> : parts.map((part, index) => ('tag' in part ? (
          part.lit ? (
            <span key={index} className="chips__chip chips__chip--lookup" title="из таблицы">{lookups.get(part.tag) ?? part.tag}</span>
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
              <span>{shortLabel(labelOfTag(system, part.tag, extraNames, sheets))}</span>
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
              <span>{lookups.get(part.tag) ?? part.tag}</span>
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
              className={onChipPick ? 'chips__name--pick' : undefined}
              onMouseDown={onChipPick ? e => { e.preventDefault(); onChipPick(part.tag, labelOfTag(system, part.tag, extraNames, sheets)); } : undefined}
            >
              {shortLabel(labelOfTag(system, part.tag, extraNames, sheets))}
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
                el.setSelectionRange(el.value.length, el.value.length);
              }
            }}

            className={`chips__text ${!part.text && index !== parts.length - 1 ? 'chips__text--ghost' : ''}`}
            value={part.text}
            placeholder={empty ? placeholder : undefined}
            size={Math.max(1, part.text.length || (empty ? (placeholder?.length ?? 8) : 1))}
            spellCheck={false}
            onFocus={e => { setActive(index); setCaret(e.currentTarget.selectionStart ?? 0); onFocus?.(); }}
            onBlur={leave}
            onChange={e => editText(index, e.target.value, e.currentTarget.selectionStart ?? e.target.value.length)}
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
              if (shownMenu && (e.key === 'Enter' || e.key === 'Tab')) {
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
      {calculator && active !== null ? (
        <div className="chips__ops">
          {OPS.filter(op => !op.word).map(opButton)}
          <span className="chips__ops-split" aria-hidden />
          {OPS.filter(op => op.word).map(opButton)}
          {tables.length ? (
            <button type="button" className="chips__op chips__op--word" title="взять значение из таблицы: какая таблица, по чему искать строку, какая колонка"
              onMouseDown={e => { e.preventDefault(); setLookup(lookup ? null : { table: tables[0]![0], column: '' }); }}>из таблицы</button>
          ) : null}
        </div>
      ) : null}
      {calculator && active !== null && lookup ? (
        <div className="chips__lookup">
          <span>Взять из таблицы</span>
          <select aria-label="из какой таблицы" value={lookup.table} onChange={e => setLookup({ table: e.target.value, column: '' })}>
            {tables.map(([id, t]) => <option key={id} value={id}>{t.label || id}</option>)}
            <option value="">другой — по формуле (например, таблица класса)</option>
          </select>
          <span>колонку</span>
          <select aria-label="какую колонку" value={lookup.column} onChange={e => setLookup({ ...lookup, column: e.target.value })}>
            <option value="">— выберите</option>
            {columnsFor(lookup.table).map(([key, label]) => <option key={`${key}|${label}`} value={key}>{label}</option>)}
            {linkColumns.map(([key, label]) => <option key={`ссылка|${key}`} value={`${ROW}.${key}`}>{`на которую ссылается строка: «${label}»`}</option>)}
            <option value={ROW}>как у этой строки</option>
          </select>
          <button type="button" className="chips__op" disabled={!lookup.column} onMouseDown={e => { e.preventDefault(); placeLookup(); }}>Вставить</button>
          <span className="chips__lookup-hint">{lookup.table ? 'потом впишите, по чему искать строку: например, [Уровень]' : 'потом впишите таблицу формулой и по чему искать строку'}</span>
        </div>
      ) : null}
      {shownMenu ? (
        <div className="slot__menu" ref={menuRef} role="listbox">
          {extras.map((option, i) => (
            <button
              key={`extra-${i}`} type="button" role="option" aria-selected={i === lit}
              className={`slot__option${i === lit ? ' slot__option--lit' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={e => { e.preventDefault(); pickExtra(option.onPick); }}
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
              onMouseDown={e => { e.preventDefault(); pick(f.tag); }}
            >
              <span className="slot__group">{f.group}</span>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
