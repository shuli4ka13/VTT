import { useState, useMemo } from 'react';
import type { System } from '@vtt/schema';
import { rollGroupsOf } from '@vtt/engine';
import { Field, Button } from '../../ui/primitives.tsx';
import { tagSaid } from './tag-said.ts';
import { TagsField, type TagValue, type TagGroup } from './tags-field.tsx';

export type RollsKey = 'tags' | 'anyTags' | 'notTags';

export interface RollsValue { tags?: readonly string[]; anyTags?: readonly string[]; notTags?: readonly string[] }

const words = (list: readonly TagValue[]): string[] => list.filter((tag): tag is string => typeof tag === 'string');

export function rollsLead(system: System): { lead: TagGroup[]; labels: Map<string, string> } {
  const { rules, kinds: carried } = rollGroupsOf(system);
  const kinds = carried.map(kind => ({ value: kind.value, label: tagSaid(system, kind.value) }));
  return {
    lead: [
      { title: 'правила бросков', list: rules.map(rule => [rule.value, rule.label] as const) },
      { title: 'метки, которые несут броски', list: kinds.map(kind => [kind.value, kind.label] as const) },
    ],
    labels: new Map([...kinds, ...rules].map(rule => [rule.value, rule.label] as const)),
  };
}

function mainHint(system: System, tags: readonly string[]): string {
  if (!tags.length) return 'Пусто — все броски.';
  const rules = tags.filter(tag => system.rolls?.[tag]);
  const named = rules.map(tag => `«${system.rolls![tag]!.label || tag}» — броски по полям этого правила и броски-шаги с меткой «${tagSaid(system, tag).toLowerCase()}».`);
  const together = rules.some(key => rules.every(other => other === key || (system.rolls![key]!.tags ?? []).includes(other)));
  const two = rules.length > 1 && !together ? ' Два правила сразу у одного броска не бывает — возьмите «Или хотя бы одно из».' : '';
  return ['Бросок должен подходить под всё выбранное.', ...named].join(' ') + two;
}

export function RollsPick({ system, value, onChange, boxed = false, tips = false }: {
  system: System;
  value: RollsValue;
  onChange: (key: RollsKey, next: string[]) => void;
  boxed?: boolean;
  tips?: boolean;
}) {
  const note = (text: string) => (tips ? { tip: text } : { hint: text });
  const [more, setMore] = useState(false);
  const { lead, labels } = useMemo(() => rollsLead(system), [system]);
  const tags = [...(value.tags ?? [])];
  const any = [...(value.anyTags ?? [])];
  const not = [...(value.notTags ?? [])];
  const showAny = more || any.length > 0;
  const showNot = more || not.length > 0;
  return (
    <>
      <Field label="Какие броски" {...note(mainHint(system, tags))}>
        <TagsField boxed={boxed} system={system} value={tags} lead={lead} labels={labels} empty="все броски" onChange={next => onChange('tags', words(next))} />
      </Field>
      {showAny ? (
        <Field label="Или хотя бы одно из" {...note('Хватит одной из этих меток. Пусто — не смотрим.')}>
          <TagsField boxed={boxed} system={system} value={any} lead={lead} labels={labels} empty="не смотрим" onChange={next => onChange('anyTags', words(next))} />
        </Field>
      ) : null}
      {showNot ? (
        <Field label="Кроме" {...note('Бросок с любой из этих меток не подходит. Пусто — не смотрим.')}>
          <TagsField boxed={boxed} system={system} value={not} lead={lead} labels={labels} empty="+ кроме метки…" onChange={next => onChange('notTags', words(next))} />
        </Field>
      ) : null}
      {showAny && showNot ? null : (
        <Button size="sm" variant="ghost" onClick={() => setMore(true)}>+ или / кроме</Button>
      )}
    </>
  );
}
