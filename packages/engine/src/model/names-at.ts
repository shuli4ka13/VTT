import { NAMES } from '../words/names.ts';
import { armsOf, sees } from './flow.ts';
import { loopOf, loopParam } from '../engine/steps/each.ts';
import { loopsAt, splitsTargets } from '../engine/steps/index.ts';
import { flattenSystem } from './inherit.ts';
import { heardNames, listenerOf, callNamesOf, sourcesOf, CALL_TAGS, HOLDER, TARGETS_SEED, DESK_NAME, COMBAT_NAME } from './references.ts';
import { LEFT_NAME } from '../events/durations.ts';
import { calledOf } from '../engine/effects.ts';
import { STEP_WORDS } from '../words/steps.ts';
import type { StepWords } from '../words/steps.ts';
import { columnChoices } from './paths.ts';
import { onSheet } from './sheet-columns.ts';
import { dieParts, thrownDie, givesOf } from './rolled.ts';
import type { System, Effect, Step, Param } from './types.ts';

export type Place =
  | { part: 'steps' | 'cost' | 'attach' | 'detach'; index: number }
  | { part: 'handler'; handler: number; index: number }
  | { part: 'handler-cost'; handler: number; index: number }
  | { part: 'handler-if'; handler: number }
  | { part: 'modifier'; modifier: number };

export type NameGroup = 'input' | 'loop' | 'holder' | 'heard' | 'step' | 'call' | 'constant';

export interface NameChild { path: string; label: string; kind: string; from?: string }

export interface NameAt {
  name: string;
  said?: string;
  label: string;
  kind: string;
  group: NameGroup;
  many?: boolean;
  optional?: boolean;
  from?: string;
  whole?: string;
  children?: NameChild[];
}

const HEARD_LABELS: Record<string, string> = {
  [NAMES.roller]: 'кто бросает',
  [NAMES.against]: 'против кого бросок',
  [NAMES.number]: 'число поля, которое бросают',
  [NAMES.mover]: 'чей ход',
  [NAMES.sheet]: 'лист, с которым это случилось',
  [CALL_TAGS]: 'метки вызова',
  [TARGETS_SEED]: 'итоги по каждой цели',
};

const partsOf = (step: Step, system: System | undefined, inputs: readonly Param[]): NameChild[] =>
  (step.type !== 'roll' || !system ? [] : dieParts(system, thrownDie(system, inputs, step))
    .map(part => ({ path: `.parts.${part.name}`, label: `что выпало на кости «${part.label}»`, kind: 'number' })));

const GRADED: Record<string, 'success' | 'margin' | 'degree'> = { '.success': 'success', '.margin': 'margin', '.degree': 'degree' };

export function resultsOf(system: System | undefined, inputs: readonly Param[], step: Step): NameChild[] {
  const it = step as unknown as { type: string; [key: string]: unknown };
  const fielded = it.field !== undefined && it.field !== null;
  const gives = step.type === 'roll' && system && fielded ? givesOf(system, inputs, step) : null;
  return [
    ...((STEP_WORDS as Record<string, StepWords>)[step.type]?.outputs ?? [])
      .filter(output => !output.onlyWith || (it[output.onlyWith] !== undefined && it[output.onlyWith] !== null))
      .filter(output => !output.onlyWith || !GRADED[output.path] || (gives?.[GRADED[output.path]!] ?? true))
      .map(output => ({ path: output.path, label: output.label, kind: output.kind ?? 'number' })),
    ...partsOf(step, system, inputs),
  ];
}

const outputsOf = (step: { type: string; [key: string]: unknown }, system?: System, inputs: readonly Param[] = []): NameChild[] =>
  resultsOf(system, inputs, step as unknown as Step).filter(output => output.path);

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
  ...((param.kind === 'choice' || param.kind === 'record') && param.from ? { from: param.from } : {}),
}, system);

const holder = (): NameAt => ({ name: HOLDER, label: 'носитель — тот, на ком висит', kind: 'sheet', group: 'holder' });

const left = (): NameAt => ({ name: LEFT_NAME, label: 'осталось срока у этого висящего', kind: 'number', group: 'holder' });

const combat = (): NameAt => ({ name: `${DESK_NAME}.${COMBAT_NAME}`, label: 'идёт ли бой', kind: 'boolean', group: 'holder' });

const returnsOf = (system: System | undefined, step: Step): NameChild[] => {
  const called = (step as { effect?: unknown }).effect;
  if (step.type !== 'emit' || typeof called !== 'string') return [];
  return (system?.effects?.[called]?.returns ?? []).flatMap(column => {
    const label = column.label ?? column.key;
    const own: NameChild = { path: `.${column.key}`, label, kind: column.kind ?? 'number', ...(column.kind === 'choice' && column.from ? { from: column.from } : {}) };
    const rows = column.kind === 'choice' && column.from && !column.many ? rowChildren(system, column.from) : [];
    return [own, ...rows.map(row => ({ path: `.${column.key}${row.path}`, label: `${label} — ${row.label}`, kind: row.kind, ...(row.from ? { from: row.from } : {}) }))];
  });
};

export const stepSaid = (step: { id?: unknown; label?: unknown }): string =>
  (typeof step.label === 'string' && step.label ? step.label : String(step.id ?? '').replace(/_/g, ' '));

function contractSaid(system: System | undefined, name: string): string {
  for (const contract of Object.values(system?.tags ?? {}) as { said?: Record<string, string> }[]) {
    const said = contract?.said?.[name];
    if (said) return said;
  }
  return name;
}

function stepLabel(system: System | undefined, step: Step, fallback: string): string {
  const called = (step as { effect?: unknown }).effect;
  const label = step.type === 'emit' && typeof called === 'string' ? system?.effects?.[called]?.label : undefined;
  return label ?? (STEP_WORDS as Record<string, StepWords>)[step.type]?.label ?? fallback;
}

function stepsBefore(steps: readonly Step[], index: number, withLoop: boolean, params: readonly Param[] = [], system?: System, inputs: readonly Param[] = params): NameAt[] {
  const out: NameAt[] = [];
  const arms = armsOf(steps);
  steps.slice(0, index).forEach((step, at) => {
    if (!sees(arms, at, index)) return;
    if (loopsAt(step)) {
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
    const children = [...returnsOf(system, step), ...outputsOf(step, system, inputs)];
    const whole = resultsOf(system, inputs, step).find(output => !output.path)?.kind;
    out.push({
      name: String(step.id),
      said: stepSaid(step),
      label: stepLabel(system, step, stepSaid(step)),
      kind: 'result',
      group: 'step',
      ...(whole ? { whole } : {}),
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
  const at = steps.findIndex(step => splitsTargets(step));
  if (at < 0) return [];
  return steps.slice(at + 1).filter(step => step.id).flatMap(step => {
    const outputs = [...returnsOf(system, step), ...outputsOf(step, system, listened.params ?? [])];
    const own = { path: `.${String(step.id)}`, label: `шаг «${stepSaid(step)}» у каждой цели`, kind: 'result' };
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
    out.push(param ? fromParam(param, 'heard', system) : { name, label: HEARD_LABELS[name] ?? contractSaid(system, name), kind: 'sheet', group: 'heard' });
  }
  for (const name of names.seeds) {
    const column = returned.get(name);
    if (column) { out.push({ name, label: column.label ?? column.key, kind: column.kind ?? 'number', group: 'heard' }); continue; }
    const param = params.get(name);
    if (param) { out.push(fromParam(param, 'heard', system)); continue; }
    const step = steps.get(name);
    if (step) {
      const children = [...returnsOf(system, step), ...outputsOf(step, system, listened?.params ?? [])];
      out.push({ name, said: stepSaid(step), label: stepLabel(system, step, stepSaid(step)), kind: 'result', group: 'heard', ...(children.length ? { children } : {}) });
      continue;
    }
    if (name === TARGETS_SEED) {
      out.push({ name, label: HEARD_LABELS[name]!, kind: 'rows', group: 'heard', children: targetsChildren(listened, system) });
      continue;
    }
    out.push({ name, label: HEARD_LABELS[name] ?? contractSaid(system, name), kind: name === CALL_TAGS ? 'tags' : 'result', group: 'heard' });
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
      return dedupe([...inputs, ...stepsBefore(effect.steps ?? [], place.index, true, effect.params ?? [], system), ...tags, combat(), ...constants(system)]);
    case 'cost':
      return dedupe([...inputs, ...stepsBefore(effect.cost ?? [], place.index, false, [], system, effect.params ?? []), ...tags, ...constants(system)]);
    case 'attach':
    case 'detach':
      return dedupe([holder(), ...inputs, ...stepsBefore(effect[place.part] ?? [], place.index, false, [], system, effect.params ?? []), ...constants(system)]);
    case 'handler-if':
    case 'handler':
    case 'handler-cost': {
      const handler = effect.on?.[place.handler];
      if (!handler) return [];
      const own = place.part === 'handler' ? stepsBefore(handler.steps ?? [], place.index, false, [], system, effect.params ?? [])
        : place.part === 'handler-cost' ? stepsBefore(handler.cost ?? [], place.index, false, [], system, effect.params ?? []) : [];
      return dedupe([holder(), left(), ...heard(system, handler), ...inputs, ...own, combat(), ...constants(system)]);
    }
    case 'modifier': {
      const mod = effect.modifiers?.[place.modifier];
      if (!mod) return [];
      if (mod.kind !== 'edit') return [left(), ...constants(system)];
      const call = callNamesOf(system, mod.call);
      const params = new Map((system.effects?.[mod.call]?.params ?? []).map(param => [param.key, param]));
      const callNames: NameAt[] = [
        ...call.sheets.map(name => (params.get(name) ? fromParam(params.get(name)!, 'heard', system) : { name, label: HEARD_LABELS[name] ?? contractSaid(system, name), kind: 'sheet', group: 'heard' as const })),
        ...call.values.map(name => (params.get(name) ? fromParam(params.get(name)!, 'heard', system) : { name, label: HEARD_LABELS[name] ?? contractSaid(system, name), kind: name === CALL_TAGS ? 'tags' : 'number', group: 'heard' as const })),
      ];
      return dedupe([holder(), ...callNames, ...inputs, ...constants(system)]);
    }
  }
}

export const sheetNamesAt = (system: System, effectId: string, place: Place): NameAt[] =>
  namesAt(system, effectId, place).filter(one => one.kind === 'sheet');

const childLabel = (one: NameAt, label: string): string => {
  if (one.kind !== 'result') return `${one.label} → ${label}`;
  const name = one.said ?? one.name.replace(/_/g, ' ');
  return name.toLowerCase() === label.toLowerCase() ? name : `${name} — ${label}`;
};

export function labelsOf(names: readonly NameAt[], system?: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const one of names) {
    if (!out.has(one.name)) out.set(one.name, one.label);
    for (const child of one.children ?? []) {
      const key = `${one.name}${child.path}`;
      if (!out.has(key)) out.set(key, childLabel(one, child.label));
    }
  }
  const sheets = names.filter(one => one.kind === 'sheet' && !one.many);
  for (const row of names) {
    if (!row.from || !onSheet(system?.tables?.[row.from])) continue;
    for (const sheet of sheets) {
      for (const child of row.children ?? []) {
        const key = `${sheet.name}.${row.name}${child.path}`;
        if (!out.has(key)) out.set(key, `${childLabel(row, child.label)} (${sheet.label})`);
      }
    }
  }
  return out;
}

export const labelsAt = (system: System, effectId: string, place: Place): Map<string, string> => labelsOf(namesAt(system, effectId, place), system);

export function choiceTablesOf(names: readonly NameAt[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const one of names) {
    if (one.kind === 'choice' && one.from) out.set(one.name, one.from);
    for (const child of one.children ?? []) if (child.from) out.set(`${one.name}${child.path}`, child.from);
  }
  return out;
}

export const choiceTablesAt = (system: System, effectId: string, place: Place): Map<string, string> => choiceTablesOf(namesAt(system, effectId, place));
