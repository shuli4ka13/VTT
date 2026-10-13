import { armsOf, sees } from './flow.ts';
import { loopOf, loopParam } from '../engine/steps/each.ts';
import { flattenSystem } from './inherit.ts';
import { heardNames, listenerOf, callNamesOf, sourcesOf, CALL_TAGS, HOLDER, TARGETS_SEED } from './references.ts';
import { calledOf } from '../engine/effects.ts';
import { STEP_WORDS } from '../words/steps.ts';
import type { StepWords } from '../words/steps.ts';
import { columnChoices } from './paths.ts';
import type { System, Effect, Step, Param } from './types.ts';

export type Place =
  | { part: 'steps' | 'cost' | 'attach' | 'detach'; index: number }
  | { part: 'handler'; handler: number; index: number }
  | { part: 'handler-cost'; handler: number; index: number }
  | { part: 'handler-if'; handler: number }
  | { part: 'modifier'; modifier: number };

export type NameGroup = 'input' | 'loop' | 'holder' | 'heard' | 'step' | 'call' | 'constant';

export interface NameChild { path: string; label: string; kind: string }

export interface NameAt {
  name: string;
  label: string;
  kind: string;
  group: NameGroup;
  many?: boolean;
  optional?: boolean;
  from?: string;
  children?: NameChild[];
}

const HEARD_LABELS: Record<string, string> = {
  бросающий: 'кто бросает',
  против: 'против кого бросок',
  ходит: 'чей ход',
  лист: 'лист, с которым это случилось',
  [CALL_TAGS]: 'метки вызова',
  [TARGETS_SEED]: 'итоги по каждой цели',
};

const outputsOf = (type: string): NameChild[] =>
  ((STEP_WORDS as Record<string, StepWords>)[type]?.outputs ?? [])
    .filter(output => output.path)
    .map(output => ({ path: output.path, label: output.label, kind: output.kind ?? 'number' }));

const rowChildren = (system: System | undefined, from: string | undefined): NameChild[] =>
  (system && from ? columnChoices(system, from) : []);

const withRows = (one: NameAt, system: System | undefined): NameAt => {
  const children = one.many ? [] : rowChildren(system, one.from);
  return children.length ? { ...one, children } : one;
};

const fromParam = (param: Param, group: NameGroup, system?: System): NameAt => withRows({
  name: param.key,
  label: param.label ?? param.key,
  kind: param.kind ?? 'number',
  group,
  ...(param.many ? { many: true } : {}),
  ...(param.optional ? { optional: true } : {}),
  ...(param.kind === 'choice' && param.from ? { from: param.from } : {}),
}, system);

const holder = (): NameAt => ({ name: HOLDER, label: 'носитель — тот, на ком висит', kind: 'sheet', group: 'holder' });

const returnsOf = (system: System | undefined, step: Step): NameChild[] => {
  const called = (step as { effect?: unknown }).effect;
  if (step.type !== 'emit' || typeof called !== 'string') return [];
  return (system?.effects?.[called]?.returns ?? []).map(column => ({ path: `.${column.key}`, label: column.label ?? column.key, kind: column.kind ?? 'number' }));
};

function stepLabel(system: System | undefined, step: Step, fallback: string): string {
  const called = (step as { effect?: unknown }).effect;
  const label = step.type === 'emit' && typeof called === 'string' ? system?.effects?.[called]?.label : undefined;
  return label ?? (STEP_WORDS as Record<string, StepWords>)[step.type]?.label ?? fallback;
}

function stepsBefore(steps: readonly Step[], index: number, withLoop: boolean, params: readonly Param[] = [], system?: System): NameAt[] {
  const out: NameAt[] = [];
  const arms = armsOf(steps);
  steps.slice(0, index).forEach((step, at) => {
    if (!sees(arms, at, index)) return;
    if (step.type === 'each') {
      const row = loopParam(step as never);
      if (row) {
        out.push(withRows({ name: row.key, label: row.label ?? row.key, kind: 'choice', group: 'loop', ...(row.from ? { from: row.from } : {}) }, system));
        return;
      }
      const loop = loopOf(params, step as { of?: unknown });
      if (withLoop && loop) out.push({ name: loop.key, label: loop.label, kind: 'sheet', group: 'loop' });
      return;
    }
    if (!step.id) return;
    const children = [...returnsOf(system, step), ...outputsOf(step.type)];
    out.push({
      name: String(step.id),
      label: stepLabel(system, step, String(step.id)),
      kind: 'result',
      group: 'step',
      ...(children.length ? { children } : {}),
    });
  });
  return out;
}

function constants(system: System): NameAt[] {
  return Object.entries(system.constants ?? {}).map(([key, constant]) => ({
    name: key, label: (constant as { label?: string }).label ?? key, kind: (constant as { kind?: string }).kind ?? 'number', group: 'constant' as const,
  }));
}

function targetsChildren(listened: Effect | null, system?: System): NameChild[] {
  if (!listened) return [];
  const steps = listened.steps ?? [];
  const at = steps.findIndex(step => step.type === 'each');
  if (at < 0) return [];
  return steps.slice(at + 1).filter(step => step.id).flatMap(step => {
    const outputs = [...returnsOf(system, step), ...outputsOf(step.type)];
    const own = { path: `.${String(step.id)}`, label: `шаг «${String(step.id)}» у каждой цели`, kind: 'result' };
    return [own, ...outputs.map(output => ({ path: `.${String(step.id)}${output.path}`, label: output.label, kind: output.kind }))];
  });
}

function heard(system: System, handler: NonNullable<Effect['on']>[number]): NameAt[] {
  const listener = listenerOf(handler);
  const names = heardNames(system, listener);
  const listened = names.listened;
  const params = new Map((listened?.params ?? []).map(param => [param.key, param]));
  const returned = new Map((listener.kind === 'call' && listener.phase === 'after' ? listened?.returns ?? [] : []).map(column => [column.key, column]));
  const steps = new Map((listener.kind === 'call' ? sourcesOf(system, listener.key) : [])
    .flatMap(source => (source.steps ?? []).filter(step => step.id).map(step => [String(step.id), step] as const)));
  const out: NameAt[] = [];
  for (const name of names.sheets) {
    const param = params.get(name);
    out.push(param ? fromParam(param, 'heard', system) : { name, label: HEARD_LABELS[name] ?? name, kind: 'sheet', group: 'heard' });
  }
  for (const name of names.seeds) {
    const column = returned.get(name);
    if (column) { out.push({ name, label: column.label ?? column.key, kind: column.kind ?? 'number', group: 'heard' }); continue; }
    const param = params.get(name);
    if (param) { out.push(fromParam(param, 'heard', system)); continue; }
    const step = steps.get(name);
    if (step) {
      const children = [...returnsOf(system, step), ...outputsOf(step.type)];
      out.push({ name, label: stepLabel(system, step, name), kind: 'result', group: 'heard', ...(children.length ? { children } : {}) });
      continue;
    }
    if (name === TARGETS_SEED) {
      out.push({ name, label: HEARD_LABELS[name]!, kind: 'rows', group: 'heard', children: targetsChildren(listened, system) });
      continue;
    }
    out.push({ name, label: HEARD_LABELS[name] ?? name, kind: name === CALL_TAGS ? 'tags' : 'result', group: 'heard' });
  }
  return out;
}

const dedupe = (names: NameAt[]): NameAt[] => {
  const seen = new Set<string>();
  return names.filter(one => (seen.has(one.name) ? false : (seen.add(one.name), true)));
};

export function namesAt(raw: System, effectId: string, place: Place): NameAt[] {
  const system = flattenSystem(raw, true);
  const effect = system.effects?.[effectId];
  if (!effect) return [];
  const inputs = (effect.params ?? []).map(param => fromParam(param, 'input', system));
  const called = calledOf(system).some(([key]) => key === effectId);
  const tags: NameAt[] = called ? [{ name: CALL_TAGS, label: HEARD_LABELS[CALL_TAGS]!, kind: 'tags', group: 'call' }] : [];

  switch (place.part) {
    case 'steps':
      return dedupe([...inputs, ...stepsBefore(effect.steps ?? [], place.index, true, effect.params ?? [], system), ...tags, ...constants(system)]);
    case 'cost':
      return dedupe([...inputs, ...stepsBefore(effect.cost ?? [], place.index, false, [], system), ...tags, ...constants(system)]);
    case 'attach':
    case 'detach':
      return dedupe([holder(), ...inputs, ...stepsBefore(effect[place.part] ?? [], place.index, false, [], system), ...constants(system)]);
    case 'handler-if':
    case 'handler':
    case 'handler-cost': {
      const handler = effect.on?.[place.handler];
      if (!handler) return [];
      const own = place.part === 'handler' ? stepsBefore(handler.steps ?? [], place.index, false, [], system)
        : place.part === 'handler-cost' ? stepsBefore(handler.cost ?? [], place.index, false, [], system) : [];
      return dedupe([holder(), ...heard(system, handler), ...inputs, ...own, ...constants(system)]);
    }
    case 'modifier': {
      const mod = effect.modifiers?.[place.modifier];
      if (!mod) return [];
      if (mod.kind !== 'edit') return constants(system);
      const call = callNamesOf(system, mod.call);
      const params = new Map((system.effects?.[mod.call]?.params ?? []).map(param => [param.key, param]));
      const callNames: NameAt[] = [
        ...call.sheets.map(name => (params.get(name) ? fromParam(params.get(name)!, 'heard', system) : { name, label: HEARD_LABELS[name] ?? name, kind: 'sheet', group: 'heard' as const })),
        ...call.values.map(name => (params.get(name) ? fromParam(params.get(name)!, 'heard', system) : { name, label: HEARD_LABELS[name] ?? name, kind: name === CALL_TAGS ? 'tags' : 'number', group: 'heard' as const })),
      ];
      return dedupe([holder(), ...callNames, ...inputs, ...constants(system)]);
    }
  }
}

export const sheetNamesAt = (system: System, effectId: string, place: Place): NameAt[] =>
  namesAt(system, effectId, place).filter(one => one.kind === 'sheet');
