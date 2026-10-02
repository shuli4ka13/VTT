import { flattenSystem } from './inherit.ts';
import { heardNames, listenerOf, callNamesOf, CALL_TAGS, HOLDER, TARGETS_SEED } from './references.ts';
import { calledOf } from '../engine/effects.ts';
import { STEP_WORDS } from '../words/steps.ts';
import type { StepWords } from '../words/steps.ts';
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

const fromParam = (param: Param, group: NameGroup): NameAt => ({
  name: param.key,
  label: param.label ?? param.key,
  kind: param.kind ?? 'number',
  group,
  ...(param.many ? { many: true } : {}),
  ...(param.optional ? { optional: true } : {}),
});

const holder = (): NameAt => ({ name: HOLDER, label: 'носитель — тот, на ком висит', kind: 'sheet', group: 'holder' });

function stepsBefore(steps: readonly Step[], index: number, withLoop: boolean): NameAt[] {
  const out: NameAt[] = [];
  steps.slice(0, index).forEach(step => {
    if (step.type === 'each') {
      const loop = step as { as?: string; of?: string };
      if (withLoop && loop.as) out.push({ name: loop.as, label: `каждый из «${loop.of ?? ''}»`, kind: 'sheet', group: 'loop' });
      return;
    }
    if (!step.id) return;
    const children = outputsOf(step.type);
    out.push({
      name: String(step.id),
      label: (STEP_WORDS as Record<string, StepWords>)[step.type]?.label ?? String(step.id),
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

function targetsChildren(listened: Effect | null): NameChild[] {
  if (!listened) return [];
  const steps = listened.steps ?? [];
  const at = steps.findIndex(step => step.type === 'each');
  if (at < 0) return [];
  return steps.slice(at + 1).filter(step => step.id).flatMap(step => {
    const outputs = outputsOf(step.type);
    const own = { path: `.${String(step.id)}`, label: `шаг «${String(step.id)}» у каждой цели`, kind: 'result' };
    return [own, ...outputs.map(output => ({ path: `.${String(step.id)}${output.path}`, label: output.label, kind: output.kind }))];
  });
}

function heard(system: System, handler: NonNullable<Effect['on']>[number]): NameAt[] {
  const names = heardNames(system, listenerOf(handler));
  const listened = names.listened;
  const params = new Map((listened?.params ?? []).map(param => [param.key, param]));
  const steps = new Map((listened?.steps ?? []).filter(step => step.id).map(step => [String(step.id), step]));
  const out: NameAt[] = [];
  for (const name of names.sheets) {
    const param = params.get(name);
    out.push(param ? fromParam(param, 'heard') : { name, label: HEARD_LABELS[name] ?? name, kind: 'sheet', group: 'heard' });
  }
  for (const name of names.seeds) {
    const param = params.get(name);
    if (param) { out.push(fromParam(param, 'heard')); continue; }
    const step = steps.get(name);
    if (step) {
      const children = outputsOf(step.type);
      out.push({ name, label: (STEP_WORDS as Record<string, StepWords>)[step.type]?.label ?? name, kind: 'result', group: 'heard', ...(children.length ? { children } : {}) });
      continue;
    }
    if (name === TARGETS_SEED) {
      out.push({ name, label: HEARD_LABELS[name]!, kind: 'rows', group: 'heard', children: targetsChildren(listened) });
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
  const system = flattenSystem(raw);
  const effect = system.effects?.[effectId];
  if (!effect) return [];
  const inputs = (effect.params ?? []).map(param => fromParam(param, 'input'));
  const called = calledOf(system).some(([key]) => key === effectId);
  const tags: NameAt[] = called ? [{ name: CALL_TAGS, label: HEARD_LABELS[CALL_TAGS]!, kind: 'tags', group: 'call' }] : [];

  switch (place.part) {
    case 'steps':
      return dedupe([...inputs, ...stepsBefore(effect.steps ?? [], place.index, true), ...tags, ...constants(system)]);
    case 'cost':
      return dedupe([...inputs, ...stepsBefore(effect.cost ?? [], place.index, false), ...tags, ...constants(system)]);
    case 'attach':
    case 'detach':
      return dedupe([holder(), ...inputs, ...stepsBefore(effect[place.part] ?? [], place.index, false), ...constants(system)]);
    case 'handler-if':
    case 'handler':
    case 'handler-cost': {
      const handler = effect.on?.[place.handler];
      if (!handler) return [];
      const own = place.part === 'handler' ? stepsBefore(handler.steps ?? [], place.index, false)
        : place.part === 'handler-cost' ? stepsBefore(handler.cost ?? [], place.index, false) : [];
      return dedupe([holder(), ...heard(system, handler), ...inputs, ...own, ...constants(system)]);
    }
    case 'modifier': {
      const mod = effect.modifiers?.[place.modifier];
      if (!mod) return [];
      if (mod.kind !== 'edit') return constants(system);
      const call = callNamesOf(system, mod.call);
      const params = new Map((system.effects?.[mod.call]?.params ?? []).map(param => [param.key, param]));
      const callNames: NameAt[] = [
        ...call.sheets.map(name => (params.get(name) ? fromParam(params.get(name)!, 'heard') : { name, label: HEARD_LABELS[name] ?? name, kind: 'sheet', group: 'heard' as const })),
        ...call.values.map(name => (params.get(name) ? fromParam(params.get(name)!, 'heard') : { name, label: HEARD_LABELS[name] ?? name, kind: name === CALL_TAGS ? 'tags' : 'number', group: 'heard' as const })),
      ];
      return dedupe([holder(), ...callNames, ...inputs, ...constants(system)]);
    }
  }
}

export const sheetNamesAt = (system: System, effectId: string, place: Place): NameAt[] =>
  namesAt(system, effectId, place).filter(one => one.kind === 'sheet');
