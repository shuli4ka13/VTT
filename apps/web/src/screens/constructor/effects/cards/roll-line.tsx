import type { System } from '@vtt/schema';
import { loneSheet } from '../../sheet-pick.tsx';
import { TagsField } from '../../tags-field.tsx';
import type { TagValue } from '../../tags-field.tsx';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import { ROLL_CALL } from '@vtt/engine/words/calls';
import { useFormulaBar } from '../../../../store/formula-bar.ts';

type Roll = Record<string, unknown>;

const NO_ROLLER = 'просто кости';

export function setRoller(draft: Roll, next: string): void {
  if (next) draft.by = { expr: next }; else delete draft.by;
}

export function RollerPick({ by, context, keep = false, onPick }: {
  by: unknown;
  context: SlotContext;
  keep?: boolean;
  onPick: (next: string) => void;
}) {
  const { singles } = sheetChoices(context);
  const current = String((by as { expr?: unknown } | undefined)?.expr ?? '').trim();
  const sheets: (readonly [string, string])[] = [...singles].map(([name, label]) => [`@${name}`, label] as const);
  const unset = current === '';
  const stray = !unset && !sheets.some(([value]) => value === current);
  const shown: (readonly [string, string])[] = [
    ...(keep ? (unset ? [['', 'Кто бросает'] as const] : []) : [['', NO_ROLLER] as const]),
    ...(stray ? [[current, `${loneSheet(by) || current} — такого листа здесь нет`] as const] : []),
    ...sheets,
  ];
  return (
    <select
      className={`roll-by${unset && !keep ? ' roll-by--none' : ''}`}
      data-field="Кто бросает"
      aria-label="Кто бросает"
      title={`Кто бросает — на его бросок действуют правки (преимущество, «Благословение») и вопросы «увидев кости».${keep ? '' : ` «${NO_ROLLER}» — правки не действуют.`}`}
      value={current}
      onFocus={() => useFormulaBar.getState().commit()}
      onChange={event => {
        const next = event.target.value;
        if (next === current || (!next && keep)) return;
        onPick(next);
      }}
    >
      {shown.map(([value, label]) => <option key={value} value={value} disabled={!value && keep}>{label}</option>)}
    </select>
  );
}

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
