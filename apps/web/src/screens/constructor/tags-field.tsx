import { useState } from 'react';
import type { System } from '@vtt/schema';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { Chip, Input, Button } from '../../ui/primitives.tsx';
import { focusNew } from '../../ui/focus-new.ts';

export type TagValue = string | { expr: string };

export interface TagTemplate { value: string; label: string }

const keyOf = (tag: TagValue): string => (typeof tag === 'string' ? tag : `=${tag.expr}`);

const OWN = ':своя';
const COMPUTED = ':формула';

export function TagsField({ system, value, onChange, known = [], templates = [], computed = false, empty = '+ метка…', boxed = false }: {
  system: System;
  value: readonly TagValue[] | undefined;
  onChange: (next: TagValue[]) => void;
  known?: readonly string[];
  templates?: readonly TagTemplate[];
  computed?: boolean;
  empty?: string;
  boxed?: boolean;
}) {
  const [typing, setTyping] = useState<'own' | 'formula' | null>(null);
  const [draft, setDraft] = useState('');
  const picked = [...(value ?? [])];
  const taken = new Set(picked.map(keyOf));
  const add = (tag: TagValue) => { if (!taken.has(keyOf(tag))) onChange([...picked, tag]); };
  const drop = (tag: TagValue) => onChange(picked.filter(other => keyOf(other) !== keyOf(tag)));

  const contracts = Object.entries(system.tags ?? {}).map(([key, tag]) => [key, tag.label ?? key] as const);
  const rows = [...tagWords(system)];
  const groups: [string, (readonly [string, string])[]][] = [
    ['шаблоны строки', templates.map(t => [t.value, t.label] as const)],
    ['метки с договором', contracts],
    ['метки вызова', known.map(word => [word, word] as const)],
    ...[...new Set(rows.map(([, table]) => table))].map(table => [
      `метки бросков · ${table}`, rows.filter(([, t]) => t === table).map(([word]) => [word, word] as const),
    ] as [string, (readonly [string, string])[]]),
  ];
  const dictionary = new Set(groups.flatMap(([, list]) => list.map(([word]) => word)));
  const free = groups
    .map(([title, list]) => [title, list.filter(([word]) => !taken.has(word))] as const)
    .filter(([, list]) => list.length);

  const commit = () => {
    const text = draft.trim();
    if (text) add(typing === 'formula' ? { expr: text } : text);
    setDraft('');
    setTyping(null);
  };

  return (
    <div className={boxed ? 'tagbox' : 'inline inline--tight'}>
      {picked.map(tag => (
        <Chip key={keyOf(tag)} active={typeof tag === 'string'} onRemove={() => drop(tag)}
          {...(typeof tag === 'string' ? {} : { title: 'метка вычисляется формулой при броске' })}>
          {typeof tag === 'string' ? (templates.find(t => t.value === tag)?.label ?? tag) : `= ${tag.expr}`}
          {typeof tag === 'string' && !dictionary.has(tag) ? <span className="faint tag-unknown" title="такой метки нет в словаре меток бросков"> · нет в словаре</span> : null}
        </Chip>
      ))}
      {typing ? (
        <>
          <Input
            value={draft}
            placeholder={typing === 'formula' ? 'например: если(рейтинг == 0, "нулевой", "")' : 'как назвать метку'}
            onChange={setDraft}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
          />
          <Button size="sm" variant="ghost" disabled={!draft.trim()} onClick={commit}>добавить</Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(''); setTyping(null); }}>отмена</Button>
        </>
      ) : (
        <select className="select" value="" onChange={event => {
          const next = event.target.value;
          if (!next) return;
          if (next === OWN) { focusNew(); setTyping('own'); return; }
          if (next === COMPUTED) { focusNew(); setTyping('formula'); return; }
          add(next);
        }}>
          <option value="">{picked.length ? '+ ещё…' : empty}</option>
          {free.map(([title, list]) => (
            <optgroup key={title} label={title}>
              {list.map(([word, label]) => <option key={word} value={word}>{label}</option>)}
            </optgroup>
          ))}
          <option value={OWN}>новая метка…</option>
          {computed ? <option value={COMPUTED}>вычисляемая формулой…</option> : null}
        </select>
      )}
    </div>
  );
}
