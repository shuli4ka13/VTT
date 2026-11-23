import { useState } from 'react';
import { AddCombo } from '../../ui/combo.tsx';
import type { System } from '@vtt/schema';
import { tagWords } from '@vtt/engine';
import { rowSaid, tagSaid } from './tag-said.ts';
import { Chip, Input, Button } from '../../ui/primitives.tsx';
import { focusNew } from '../../ui/focus-new.ts';
import { storedFormula } from '../../ui/formula-lang.ts';
import { useWorld, freeId } from '../../store/world.ts';
import { formulaAsLabels } from '../../ui/formula-labels.ts';
import { useT } from '../../i18n/author.ts';

export type TagValue = string | { expr: string };

export interface TagTemplate { value: string; label: string }

const keyOf = (tag: TagValue): string => (typeof tag === 'string' ? tag : `=${tag.expr}`);

const OWN = ':своя';
const COMPUTED = ':formula';

export interface TagGroup { title: string; list: readonly (readonly [string, string])[] }

export function TagsField({ system, value, onChange, known = [], templates = [], computed = false, empty, boxed = false, lead = [], labels, names }: {
  system: System;
  value: readonly TagValue[] | undefined;
  onChange: (next: TagValue[]) => void;
  known?: readonly string[];
  templates?: readonly TagTemplate[];
  computed?: boolean;
  empty?: string;
  boxed?: boolean;
  lead?: readonly TagGroup[];
  labels?: ReadonlyMap<string, string>;
  names?: ReadonlyMap<string, string>;
}) {
  const t = useT('records');
  const editSystem = useWorld(state => state.editSystem);
  const ownSystem = useWorld(state => state.origin.mode) !== 'compendium';
  const [typing, setTyping] = useState<'own' | 'formula' | null>(null);
  const [draft, setDraft] = useState('');
  const picked = [...(value ?? [])];
  const taken = new Set(picked.map(keyOf));
  const add = (tag: TagValue) => { if (!taken.has(keyOf(tag))) onChange([...picked, tag]); };
  const drop = (tag: TagValue) => onChange(picked.filter(other => keyOf(other) !== keyOf(tag)));

  const contracts = Object.entries(system.tags ?? {}).map(([key, tag]) => [key, tag.label ?? key] as const);
  const rows = [...tagWords(system)];
  const seen = new Set<string>();
  const once = (list: readonly (readonly [string, string])[]) => list.filter(([word]) => !seen.has(word) && Boolean(seen.add(word)));
  const listed: [string, (readonly [string, string])[]][] = [
    ...lead.map(group => [group.title, [...group.list]] as [string, (readonly [string, string])[]]),
    [t('tags.templates'), templates.map(one => [one.value, one.label] as const)],
    [t('tags.contracts'), contracts],
    [t('tags.known'), known.map(word => [word, tagSaid(system, word)] as const)],
    ...[...new Set(rows.map(([, table]) => table))].map(table => [
      t('tags.rolls', { table }), rows.filter(([, one]) => one === table).map(([word]) => [word, rowSaid(system, word)] as const),
    ] as [string, (readonly [string, string])[]]),
  ];
  const groups = listed.map(([title, list]) => [title, once(list)] as [string, (readonly [string, string])[]]);
  const said = new Map(groups.flatMap(([, list]) => list.filter(([word, label]) => word !== label)));
  const dictionary = new Set(groups.flatMap(([, list]) => list.map(([word]) => word)));
  const free = groups
    .map(([title, list]) => [title, list.filter(([word]) => !taken.has(word))] as const)
    .filter(([, list]) => list.length);

  const commit = () => {
    const text = draft.trim();
    if (text && typing === 'formula') add({ expr: storedFormula(text) });
    else if (text) {
      const same = groups.flatMap(([, list]) => list).find(([word, label]) => word === text || label.toLowerCase() === text.toLowerCase());
      const key = same ? same[0] : freeId([...dictionary, ...Object.keys(system.tags ?? {})], text);
      if (!same && key !== text) editSystem(next => { next.tags = { ...(next.tags ?? {}), [key]: { ...(next.tags?.[key] ?? {}), label: text } }; });
      add(key);
    }
    setDraft('');
    setTyping(null);
  };

  return (
    <div className={boxed ? 'tagbox' : 'inline inline--tight'}>
      {picked.map(tag => (
        <Chip key={keyOf(tag)} active={typeof tag === 'string'} onRemove={() => drop(tag)}
          {...(typeof tag === 'string' ? {} : { title: t('tags.computedTitle') })}>
          {typeof tag === 'string' ? (labels?.get(tag) ?? templates.find(one => one.value === tag)?.label ?? said.get(tag) ?? tagSaid(system, tag)) : `= ${formulaAsLabels(system, tag.expr, names)}`}
          {typeof tag === 'string' && !dictionary.has(tag) ? <span className="faint tag-unknown" title={t('tags.unknownTitle')}> · {t('tags.unknown')}</span> : null}
        </Chip>
      ))}
      {typing ? (
        <>
          <Input
            value={draft}
            placeholder={typing === 'formula' ? t('tags.formulaPlaceholder') : t('tags.namePlaceholder')}
            onChange={setDraft}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
          />
          <Button size="sm" variant="ghost" disabled={!draft.trim()} onClick={commit}>{t('tags.add')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(''); setTyping(null); }}>{t('common:cancel')}</Button>
        </>
      ) : (
        <AddCombo
          prompt={picked.length ? t('tags.more') : empty ?? t('tags.emptyPrompt')}
          options={[
            ...free.flatMap(([title, list]) => list.map(([word, label]) => ({ value: word, label, group: title }))),
            ...(ownSystem ? [{ value: OWN, label: t('tags.own'), group: t('tags.other') }] : []),
            ...(computed ? [{ value: COMPUTED, label: t('tags.computed'), group: t('tags.other') }] : []),
          ]}
          onPick={next => {
            if (next === OWN) { focusNew(); setTyping('own'); return; }
            if (next === COMPUTED) { focusNew(); setTyping('formula'); return; }
            add(next);
          }}
        />
      )}
    </div>
  );
}
