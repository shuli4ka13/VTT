import { useMemo } from 'react';
import { lintSystem, describeWhere } from '@vtt/engine/model/lint';
import type { Problem } from '@vtt/engine/model/lint';
import type { Where } from '@vtt/engine/model/references';
import type { System } from '@vtt/schema';
import { useWorld } from '../../store/world.ts';
import type { WorldState } from '../../store/world.ts';
import { STEP } from '../../words.ts';
import { flattenSystem } from '@vtt/engine/model/inherit';

export type { Problem };

export function useProblems(): Problem[] {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const mode = useWorld(s => s.origin.mode);
  const book = mode === 'compendium' || compendium.items?.length || compendium.actions?.length
    ? compendium : undefined;
  return useMemo(() => lintSystem(flattenSystem(system), book), [system, book]);
}

export const whereLabel = (where: Where, system: System): string => describeWhere(where, system);

type Pick = Parameters<WorldState['pick']>[0];

export function pickFor(where: Where): Pick {
  if (where.tab === 'sheet') return { activeTab: 'sheet', activeFieldTag: where.field ?? null, activeStepIndex: null };
  if (where.tab === 'effects') {
    return { activeTab: 'effects', activeEffectId: where.effect ?? null, activeStepIndex: where.step ?? null };
  }
  if (where.tab === 'records') return { activeTab: 'records', activeRecordKind: where.kind ?? null, activeStepIndex: null };
  if (where.tab === 'rules') return { activeTab: 'dictionaries', activeStepIndex: where.step ?? null };
  return { activeRecordId: where.record ?? null, activeStepIndex: null };
}

const LEAF: Record<string, string> = {
  on: 'что слушает', effect: 'эффект', target: 'какое поле меняем', value: 'сколько', edit: 'правка броска',
  expr: 'формула', tag: 'поле', label: 'название', default: 'по умолчанию', die: 'кость', constant: 'кость',
  event: 'общий эффект', dice: 'кости', bonus: 'прибавка', versus: 'против чего', roll: 'бросок', type: 'тип',
  kind: 'вид', args: 'что берёт из записи', props: 'свойства', ops: 'операции', ranges: 'строки таблицы',
};

const MESSAGES: [RegExp, string][] = [
  [/required|undefined/i, 'не заполнено'],
  [/too small|at least|>=1 character|empty/i, 'пусто'],
  [/invalid input|expected .* received|invalid literal|invalid enum|invalid discriminator|invalid_union|invalid option/i, 'не то значение'],
  [/unrecognized key/i, 'лишний ключ'],
];

const labelOf = (list: Record<string, { label?: string }> | undefined, id: string): string =>
  `«${list?.[id]?.label || id}»`;

export function pathWords(issue: string, system: System): string {
  const at = issue.indexOf(': ');
  if (at < 0) return issue;
  const path = issue.slice(0, at).split('.').filter(Boolean);
  const message = issue.slice(at + 2);
  const words: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    const next = path[i + 1];
    const index = next !== undefined && /^\d+$/.test(next) ? Number(next) : null;
    const named = next !== undefined && index === null ? next : null;
    if (key === 'effects' && named) { words.push(`эффект ${labelOf(system.effects, named)}`); i++; continue; }
    if (key === 'records' && named) { words.push(`тип записи ${labelOf(system.records, named)}`); i++; continue; }
    if (key === 'constants' && named) { words.push(`кость ${labelOf(system.constants, named)}`); i++; continue; }
    if (key === 'roll_edits' && named) { words.push(`правка броска ${labelOf(system.roll_edits, named)}`); i++; continue; }
    if (key === 'tables' && named) { words.push(`таблица ${labelOf(system.tables, named)}`); i++; continue; }
    if (key === 'fields' && index !== null) { words.push(`поле «${system.fields[index]?.label ?? index + 1}»`); i++; continue; }
    if ((key === 'steps' || key === 'receive') && index !== null) { words.push(`${STEP.one} ${index + 1}`); i++; continue; }
    if (key === 'bindings' && index !== null) { words.push(`привязка ${index + 1}`); i++; continue; }
    if (key === 'modifiers' && index !== null) { words.push(`модификатор ${index + 1}`); i++; continue; }
    if (key === 'params' && index !== null) { words.push(`потребность ${index + 1}`); i++; continue; }
    if (key === 'trigger') { words.push('что слушает'); continue; }
    if (/^\d+$/.test(key)) { words.push(`№${Number(key) + 1}`); continue; }
    words.push(LEAF[key] ?? key);
  }
  const said = MESSAGES.find(([rx]) => rx.test(message))?.[1] ?? message;
  return `${words.join(' · ')}: ${said}`;
}
