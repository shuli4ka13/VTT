import type { System } from '@vtt/schema';
import { TagsField } from '../../tags-field.tsx';
import type { TagValue } from '../../tags-field.tsx';
import { ROLL_CALL } from '@vtt/engine/words/calls';

type Roll = Record<string, unknown>;

export function RollTags({ roll, system, label = 'Метки', onRoll }: {
  label?: string;
  roll: Roll;
  system: System;
  onRoll: (change: (draft: Roll) => void) => void;
}) {
  const tags = (roll.tags ?? []) as TagValue[];
  return (
    <div className="field roll-tags" title="По меткам бросок находят правки и подписки; метка — строка любой таблицы системы">
      <span className="field__label">{label}</span>
      <TagsField system={system} value={tags} computed empty="+ метка"
        onChange={next => onRoll(draft => { if (next.length) draft.tags = next; else delete draft.tags; })} />
      <Listeners names={rollListeners(system, tags.filter((tag): tag is string => typeof tag === 'string'))} />
    </div>
  );
}

const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export function rollListeners(system: System, tags: string[]): string[] {
  if (!tags.length) return [];
  const out: string[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    const hits = ((effect.modifiers ?? []) as Record<string, unknown>[]).some(m => {
      if (m.kind !== 'edit' || (m.call ?? ROLL_CALL) !== ROLL_CALL) return false;
      const all = list(m.tags);
      const any = list(m.anyTags);
      const none = list(m.notTags);
      if (!all.length && !any.length) return false;
      return all.every(tag => tags.includes(tag)) && (!any.length || any.some(tag => tags.includes(tag))) && !none.some(tag => tags.includes(tag));
    });
    if (hits) out.push(effect.label || id);
  }
  return out;
}

function Listeners({ names }: { names: string[] }) {
  if (!names.length) return null;
  const shown = names.slice(0, 3).map(name => `«${name}»`).join(', ');
  return (
    <span className="faint roll-line__listeners" title={names.map(name => `«${name}»`).join(', ')}>
      правят по меткам: {shown}{names.length > 3 ? ` и ещё ${names.length - 3}` : ''}
    </span>
  );
}
