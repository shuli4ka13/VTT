import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { matchTagQuery } from './tag-suggest.tsx';
import { fieldPaths } from './paths.ts';
import { ownerOf, OWNERS, SENDER, RECEIVER, DESK } from '@vtt/engine/engine/owners';

const plainLabel = (system: System, tag: string, extra?: Map<string, string>): string =>
  system.fields.find(f => f.tag === tag)?.label ?? extra?.get(tag) ?? fieldPaths(system).get(tag) ?? tag;

const labelOfTag = (system: System, tag: string, extra?: Map<string, string>): string => {
  const owned = ownerOf(tag);
  return owned ? plainLabel(system, owned.rest, extra) : plainLabel(system, tag, extra);
};

const knownSheetName = (system: System, tag: string, paths: Map<string, string>): boolean =>
  system.fields.some(field => field.tag === tag) || paths.has(tag);

export type Part = { text: string } | { tag: string };

const OPS: { label: string; hint: string; open: string; close?: string; word?: boolean }[] = [
  { label: '+', hint: 'сложить', open: ' + ' },
  { label: '−', hint: 'вычесть', open: ' - ' },
  { label: '×', hint: 'умножить', open: ' * ' },
  { label: '÷', hint: 'поделить', open: ' / ' },
  { label: '( )', hint: 'скобки: что внутри — считается первым', open: '(', close: ')' },
  { label: 'округлить вниз', hint: 'отбросить дробную часть: 7,9 → 7', open: 'floor(', close: ')', word: true },
  { label: 'округлить вверх', hint: 'добить до целого: 7,1 → 8', open: 'ceil(', close: ')', word: true },
  { label: 'округлить', hint: 'по школьным правилам: 7,5 → 8, 7,4 → 7', open: 'round(', close: ')', word: true },
  { label: 'модуль', hint: 'число без минуса: −3 → 3', open: 'abs(', close: ')', word: true },
  { label: 'большее из', hint: 'самое большое из перечисленного через запятую', open: 'max(', close: ', )', word: true },
  { label: 'меньшее из', hint: 'самое маленькое из перечисленного через запятую', open: 'min(', close: ', )', word: true },
  { label: 'или', hint: 'первое заданное: если класс не выбран — берётся второе', open: 'или(', close: ', )', word: true },
  { label: 'есть в списке', hint: 'да, если в списке есть значение: спасброски класса — «сила»', open: 'есть(', close: ', "")', word: true },
];

export function partsOf(value: string, known?: (tag: string) => boolean): Part[] {
  const out: Part[] = [];
  let rest = value;
  for (;;) {
    const m = rest.match(/[@#]([\p{L}\p{N}_.]+)/u);
    if (!m || m.index === undefined) break;
    if (known && !known(m[1]!)) {
      const cut = m.index + m[0].length;
      out.push({ text: rest.slice(0, cut) });
      rest = rest.slice(cut);
      continue;
    }
    out.push({ text: rest.slice(0, m.index) });
    out.push({ tag: m[1]! });
    rest = rest.slice(m.index + m[0].length);
  }
  out.push({ text: rest });
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
  return parts.map(p => ('tag' in p ? `@${p.tag}` : p.text)).join('');
}

export function FormulaChips({ value, onChange, system, placeholder, onKeyDown, onBlur, onFocus, prefix, suffix, names, extraNames, owners, extraOptions, calculator, readOnly, autoFocus }: {
  value: string;
  onChange: (next: string) => void;
  system: System;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;

  onFocus?: () => void;

  onQuery?: (active: boolean) => void;

  prefix?: ReactNode;

  suffix?: ReactNode;

  names?: Record<string, ReactNode>;

  extraNames?: Map<string, string>;

  owners?: boolean;

  extraOptions?: { group: string; label: string; name?: string; onPick: (insert: (piece: string) => string) => void }[];

  calculator?: boolean;

  readOnly?: boolean;

  autoFocus?: boolean;
}) {
  const paths = useMemo(() => fieldPaths(system), [system]);
  const parts = useMemo(
    () => partsOf(value, tag => {
      const owned = ownerOf(tag);
      if (owned) return knownSheetName(system, owned.rest, paths);
      return knownSheetName(system, tag, paths) || Boolean(names?.[tag]) || Boolean(extraNames?.has(tag));
    }),
    [value, system, names, extraNames, paths],
  );
  const host = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [active, setActive] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [closed, setClosed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fields = useMemo(() => {
    const desk = system.fields.filter(f => f.desk).map(f => ({ tag: `${DESK}.${f.tag}`, label: f.label ?? f.tag, group: 'стол' }));
    const sheet = [
      ...system.fields.filter(f => !f.desk).map(f => ({ tag: f.tag, label: f.label ?? f.tag, via: false })),
      ...[...paths].map(([tag, label]) => ({ tag, label, via: true })),
    ];
    const offered = new Set((extraOptions ?? []).map(o => o.name).filter(Boolean));
    const local = [...(extraNames ?? [])].filter(([tag]) => !offered.has(tag)).map(([tag, label]) => ({ tag, label, group: 'здесь же' }));
    if (!owners) {
      return [...local, ...sheet.map(f => ({ tag: f.tag, label: f.label, group: f.via ? 'по ссылке' : 'поле' })), ...desk];
    }
    return [
      ...local,
      ...OWNERS.flatMap(owner => sheet.map(f => ({ tag: `${owner}.${f.tag}`, label: f.label, group: `поле ${owner === SENDER ? 'отправителя' : 'получателя'}` }))),
      ...desk,
    ];
  }, [system, extraNames, extraOptions, paths, owners]);

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

  const opButton = (op: typeof OPS[number]) => (
    <button
      key={op.label} type="button"
      className={op.word ? 'chips__op chips__op--word' : 'chips__op'}
      title={op.hint}
      onMouseDown={e => { e.preventDefault(); insertOp(op.open, op.close); }}
    >{op.label}</button>
  );

  const editText = (index: number, text: string, at: number) => {
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

  if (readOnly) {
    return (
      <span className="chips chips--read">
        {prefix}
        {empty ? <span className="chips__placeholder">{placeholder}</span> : parts.map((part, index) => ('tag' in part ? (
          names?.[part.tag] !== undefined ? (
            <span key={index} className="chips__group">{names[part.tag]}</span>
          ) : (
            <span key={index} className="chips__chip">
              <span>{shortLabel(labelOfTag(system, part.tag, extraNames))}</span>
              {ownerOf(part.tag) ? (
                <span className={`chips__side chips__side--${ownerOf(part.tag)!.owner === DESK ? 'desk' : ownerOf(part.tag)!.owner === SENDER ? 'sender' : 'receiver'}`}>
                  {ownerOf(part.tag)!.owner}
                </span>
              ) : null}
            </span>
          )
        ) : <span key={index} className="chips__word">{part.text}</span>))}
      </span>
    );
  }

  return (
    <div className="chips" ref={host} onKeyDown={onKeyDown}>
      <div className="chips__row" onMouseDown={e => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputs.current.get(parts.length - 1)?.focus();
        }
      }}>
        {prefix}
        {parts.map((part, index) => 'tag' in part ? (

          names?.[part.tag] !== undefined ? (
            <span key={index} className="chips__group">{names[part.tag]}</span>
          ) : (
          <span key={index} className="chips__chip">
            <span title={labelOfTag(system, part.tag, extraNames)}>
              {shortLabel(labelOfTag(system, part.tag, extraNames))}
            </span>
            {ownerOf(part.tag)?.owner === DESK ? (
              <span className="chips__side chips__side--desk">стол</span>
            ) : ownerOf(part.tag) ? (
              <button
                type="button"
                className={`chips__side chips__side--pick chips__side--${ownerOf(part.tag)!.owner === SENDER ? 'sender' : 'receiver'}`}
                title={ownerOf(part.tag)!.owner === SENDER
                  ? 'поле отправителя: он считает его у себя и присылает числом. Щёлкните — взять у получателя'
                  : 'поле получателя: он досчитает его своим листом. Щёлкните — взять у отправителя'}
                onMouseDown={e => {
                  e.preventDefault();
                  const owned = ownerOf(part.tag)!;
                  const flipped = `${owned.owner === SENDER ? RECEIVER : SENDER}.${owned.rest}`;
                  commitParts(parts.map((p, i) => (i === index ? { tag: flipped } : p)));
                }}
              >{ownerOf(part.tag)!.owner}</button>
            ) : null}
            <button
              type="button" className="chips__x" aria-label="убрать поле"
              onMouseDown={e => { e.preventDefault(); dropChip(index); }}
            >×</button>
          </span>
          )
        ) : (
          <input
            key={index}
            ref={el => { if (el) inputs.current.set(index, el); else inputs.current.delete(index); }}

            className={`chips__text ${!part.text && index !== parts.length - 1 ? 'chips__text--ghost' : ''}`}
            autoFocus={autoFocus && index === parts.length - 1}
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
