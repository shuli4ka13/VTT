import { useMemo } from 'react';
import { lintSystem, describeWhere, flattenSystem, foreignKeysText, isSingle, isBook } from '@vtt/engine';
import type { Problem, Where } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { useWorld, useBook } from '../../store/world.ts';
import type { WorldState } from '../../store/world.ts';
import { STEP } from '../../words.ts';
import { t } from '../../i18n/author.ts';

export type { Problem };

export function useProblems(): Problem[] {
  const system = useWorld(s => s.system);
  const compendium = useBook();
  const mode = useWorld(s => s.origin.mode);
  const book = mode === 'compendium' || compendium.records?.length
    ? compendium : undefined;
  return useMemo(() => {
    const found = lintSystem(flattenSystem(system, true), book);
    const foreign = foreignKeysText(system);
    return foreign ? [...found, { where: { tab: 'rules' as const }, level: 'warn' as const, text: foreign }] : found;
  }, [system, book]);
}

export const whereLabel = (where: Where, system: System): string => describeWhere(where, system);

type Pick = Parameters<WorldState['pick']>[0];

export function pickFor(where: Where, system?: System): Pick {
  if (where.tab === 'sheet') return { activeTab: 'sheet', activeFieldTag: where.field ?? null, activeStepIndex: null };
  if (where.tab === 'effects') {
    return { activeTab: 'effects', activeEffectId: where.effect ?? null, activeStepIndex: where.step ?? null };
  }
  if (where.tab === 'records' && where.kind && system?.sheets?.[where.kind]) return { activeTab: 'sheet', activeSheetKind: where.kind, activeFieldTag: null, activeStepIndex: null };
  if (where.tab === 'records') return { activeTab: 'records', activeRecordKind: where.kind ?? null, activeStepIndex: null };
  if (where.tab === 'rules') return { activeTab: 'dictionaries', activeStepIndex: where.step ?? null };
  return { activeRecordId: where.record ?? null, activeStepIndex: null };
}

const LEAF_KEYS = new Set(['on', 'effect', 'target', 'value', 'edit', 'expr', 'tag', 'label', 'default', 'die', 'constant', 'event', 'dice', 'bonus', 'versus', 'roll', 'type', 'kind', 'args', 'props', 'ops', 'ranges']);

const leafWord = (key: string): string => (LEAF_KEYS.has(key) ? t(`phrases:problems.leaf.${key}`) : key);

const messages = (): [RegExp, string][] => [
  [/required|undefined/i, t('phrases:problems.msg.required')],
  [/too small|at least|>=1 character|empty/i, t('phrases:problems.msg.empty')],
  [/invalid input|expected .* received|invalid literal|invalid enum|invalid discriminator|invalid_union|invalid option/i, t('phrases:problems.msg.invalid')],
  [/unrecognized key/i, t('phrases:problems.msg.extra')],
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
    if (key === 'effects' && named) { words.push(t('phrases:problems.path.effect', { name: labelOf(system.effects, named) })); i++; continue; }
    if (key === 'sheets' && named) { words.push(t('phrases:problems.path.sheetType', { name: labelOf(system.sheets, named) })); i++; continue; }
    if (key === 'constants' && named) { words.push(t('phrases:problems.path.die', { name: labelOf(system.constants, named) })); i++; continue; }
    if (key === 'roll_edits' && named) { words.push(t('phrases:problems.path.rollEdit', { name: labelOf(system.roll_edits, named) })); i++; continue; }
    if (key === 'tables' && named) {
      const table = system.tables?.[named];
      const at = path[i + 2] === 'columns' && /^\d+$/.test(path[i + 3] ?? '') ? Number(path[i + 3]) : null;
      const column = at === null ? undefined : table?.columns?.[at];
      if (!isSingle(table)) words.push(t(isBook(table) ? 'phrases:problems.path.recordType' : 'phrases:problems.path.table', { name: labelOf(system.tables, named) }));
      i++;
      if (at !== null) { words.push(t(isSingle(table) ? 'phrases:problems.path.field' : isBook(table) ? 'phrases:problems.path.property' : 'phrases:problems.path.column', { name: column?.label || column?.key || at + 1 })); i += 2; }
      continue;
    }
    if ((key === 'steps' || key === 'receive') && index !== null) { words.push(`${STEP.one} ${index + 1}`); i++; continue; }
    if (key === 'bindings' && index !== null) { words.push(t('phrases:problems.path.button', { n: index + 1 })); i++; continue; }
    if (key === 'modifiers' && index !== null) { words.push(t('phrases:problems.path.modifier', { n: index + 1 })); i++; continue; }
    if (key === 'params' && index !== null) { words.push(t('phrases:problems.path.input', { n: index + 1 })); i++; continue; }
    if (key === 'on' && index !== null) { words.push(t('phrases:problems.path.when', { n: index + 1 })); i++; continue; }
    if (/^\d+$/.test(key)) { words.push(t('phrases:problems.path.number', { n: Number(key) + 1 })); continue; }
    words.push(leafWord(key));
  }
  const said = messages().find(([rx]) => rx.test(message))?.[1] ?? message;
  return t('phrases:problems.path.said', { path: words.join(' · '), said });
}
