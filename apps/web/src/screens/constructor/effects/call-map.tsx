import { useMemo, useState } from 'react';
import { referencesOf } from '@vtt/engine/model/references';
import { chainsOfEffect } from '@vtt/engine/engine/effects';
import { fieldOf, hasField } from '@vtt/engine/model/sheet-columns';
import { labelOfTag } from '../../../ui/formula.tsx';
import { paramStages } from '@vtt/engine/engine/stages';
import type { Compendium } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { callMap, bookButtonsOf } from './call-map.ts';
import type { System, Effect } from '@vtt/schema';

const SHOWN = 3;

export interface UsageItem { key: string; text: string; onClick?: () => void }

export function UsageRow({ title, items }: { title: string; items: UsageItem[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  const rest = items.length - shown.length;
  return (
    <div className="inline inline--tight call-map__row">
      <span className="muted">{title}</span>
      {shown.map(item => (item.onClick
        ? <button key={item.key} type="button" className="chip chip--action" onClick={item.onClick}>{item.text}</button>
        : <span key={item.key} className="chip">{item.text}</span>))}
      {rest > 0 ? <button type="button" className="chip chip--action" onClick={() => setAll(true)}>и ещё {rest}</button> : null}
      {all && items.length > SHOWN ? <button type="button" className="chip chip--action" onClick={() => setAll(false)}>свернуть</button> : null}
    </div>
  );
}

const nameOf = (system: System, id: string): string => `«${system.effects?.[id]?.label || id}»`;

export function CallMapRow({ id, effect, system }: { id: string; effect: Effect; system: System }) {
  const pick = useWorld(s => s.pick);
  const compendium = useWorld(s => s.compendium);
  const map = callMap(system, id);
  const open = (target: string) => () => pick({ activeTab: 'effects', activeEffectId: target, activeStepIndex: null });
  const effectItem = (target: string): UsageItem => ({ key: target, text: nameOf(system, target), onClick: open(target) });
  const used: UsageItem[] = [
    ...map.usedBy.map(one => effectItem(one.id)),
    ...bookButtonsOf(system, id).map(one => ({
      key: `book:${one.key}:${one.button}`,
      text: one.button ? `«${one.button}» у «${one.table}»` : `кнопка у «${one.table}»`,
      onClick: () => pick({ activeTab: 'records', activeRecordKind: one.key }),
    })),
  ];
  const calls = map.calls.map(effectItem);
  const heard = map.heardBy.map(effectItem);
  const touched = useMemo(() => touchedBy(system, compendium, id, effect), [system, compendium, id, effect]);
  const fieldItem = (tag: string): UsageItem => {
    const field = fieldOf(system, tag);
    const table = field?.cell?.table ?? field?.home;
    return {
      key: `field:${tag}`, text: `«${labelOfTag(system, tag)}»`,
      ...(table ? { onClick: () => pick({ activeTab: 'dictionaries', activeTableId: table, activeColumn: { table, column: field?.cell?.column ?? tag } }) } : {}),
    };
  };
  const tableItem = (key: string): UsageItem => ({ key: `table:${key}`, text: `«${system.tables?.[key]?.label || key}»`, onClick: () => pick({ activeTab: 'dictionaries', activeTableId: key }) });
  const reads = [...touched.tables.map(tableItem), ...touched.reads.map(fieldItem)];
  const writes = touched.writes.map(fieldItem);
  const puts = touched.puts.map(effectItem);
  const meddlers = useMemo(() => editorsOf(system, id), [system, id]);
  if (!calls.length && !used.length && !heard.length && !reads.length && !writes.length && !puts.length && !meddlers.length) return null;
  return (
    <div className="call-map" data-effect={effect.label ?? id}>
      <UsageRow title="Вызывает:" items={calls} />
      <UsageRow title="Накладывает:" items={puts} />
      <UsageRow title="Меняет:" items={writes} />
      <UsageRow title="Читает:" items={reads} />
      <UsageRow title="Кто зовёт:" items={used} />
      <UsageRow title="Слушают:" items={heard} />
      {meddlers.map(group => (
        <UsageRow key={group.stage} title={`Правят${group.stage ? ` · ${group.stage}` : ''}:`}
          items={group.by.map(other => ({ key: other, text: `«${system.effects?.[other]?.label || other}»`, onClick: open(other) }))} />
      ))}
    </div>
  );
}

function touchedBy(system: System, compendium: Compendium | null, id: string, effect: Effect): { reads: string[]; writes: string[]; tables: string[]; puts: string[] } {
  const writes = new Set<string>();
  const puts = new Set<string>();
  for (const step of chainsOfEffect(effect).flat() as Record<string, unknown>[]) {
    const target = String((step.target as { expr?: unknown } | undefined)?.expr ?? '');
    const field = /^@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)$/u.exec(target.trim())?.[1];
    if (step.type === 'apply' && field && hasField(system, field)) writes.add(field);
    if (step.type === 'status' && typeof step.effect === 'string' && system.effects?.[step.effect]) puts.add(step.effect);
  }
  const reads = new Set<string>();
  const tables = new Set<string>();
  for (const ref of refsOf(system, compendium)) {
    if (ref.from.tab !== 'effects' || ref.from.effect !== id) continue;
    if (ref.kind === 'field' && hasField(system, ref.key) && !writes.has(ref.key)) reads.add(ref.key);
    if (ref.kind === 'table' && system.tables?.[ref.key]) tables.add(ref.key);
  }
  return { reads: [...reads], writes: [...writes], tables: [...tables], puts: [...puts] };
}

function editorsOf(system: System, id: string): { stage: string; by: string[] }[] {
  const callee = system.effects?.[id];
  if (!callee) return [];
  const groups = new Map<string, Set<string>>();
  for (const [other, effect] of Object.entries(system.effects ?? {})) {
    for (const mod of (effect.modifiers ?? []) as Record<string, unknown>[]) {
      if (mod.kind !== 'edit' || mod.call !== id) continue;
      const stages = paramStages(callee.params, String(mod.param ?? ''));
      const stage = stages.length > 1 ? (stages.find(one => one.key === mod.stage)?.label ?? String(mod.stage ?? '')) : '';
      if (!groups.has(stage)) groups.set(stage, new Set());
      groups.get(stage)!.add(other);
    }
  }
  const order = (callee.params ?? []).flatMap(param => (param.stages ?? []).map(one => one.label ?? one.key));
  return [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([stage, by]) => ({ stage, by: [...by] }));
}

const REFS = new WeakMap<System, { compendium: Compendium | null; refs: ReturnType<typeof referencesOf> }>();

function refsOf(system: System, compendium: Compendium | null): ReturnType<typeof referencesOf> {
  const hit = REFS.get(system);
  if (hit && hit.compendium === compendium) return hit.refs;
  const refs = referencesOf(system, compendium ?? undefined);
  REFS.set(system, { compendium, refs });
  return refs;
}
