import { rolesOf } from './effects/roles.ts';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import type { System, Effect, SlotRef, Param } from '@vtt/schema';
import { givesOf, stepModule, loopsAt, calledOf, amountParamOf, hasField } from '@vtt/engine';
import type { Graded, RecordKind, NameAt } from '@vtt/engine';
import { columnPaths } from '../../ui/formula.tsx';
import { STEP } from '../../words.ts';
import { withTables, withPicks } from '../../ui/formula-words.ts';

export interface StepOutput { path: string; label: string; kind?: string; no?: string }

export interface EarlierStep { id: string; type: string; title?: string; table?: string; splits?: boolean; fielded?: boolean | Graded; dice?: boolean; outputs?: StepOutput[] }

const throwsDice = (step: unknown): boolean => {
  try { return stepModule((step as { type: string }).type).dice?.(step as never) === true; } catch { return false; }
};

export const fieldedOf = (system: System, params: readonly Param[], step: unknown): { fielded?: boolean | Graded; dice?: boolean } => ({
  ...((step as { field?: unknown }).field ? { fielded: givesOf(system, params, step as never) ?? true } : {}),
  ...(throwsDice(step) ? { dice: true } : {}),
});

const GRADED_PATHS: Record<string, keyof Graded> = { '.success': 'success', '.margin': 'margin', '.degree': 'degree' };

function outputsOf(type: string, fielded: boolean | Graded = false): StepOutput[] {
  try {
    return ((stepModule(type).outputs ?? []) as (StepOutput & { onlyWith?: string })[])
      .filter(output => !output.onlyWith || (output.onlyWith === 'field' && Boolean(fielded)))
      .filter(output => !output.onlyWith || typeof fielded !== 'object' || !GRADED_PATHS[output.path] || fielded[GRADED_PATHS[output.path]!]);
  } catch {
    return [];
  }
}

const outputsAt = (step: EarlierStep): StepOutput[] => [...(step.outputs ?? []), ...outputsOf(step.type, step.fielded)];

export const formulaName = (step: EarlierStep): string => (loopsAt(step) ? step.title || step.id : step.id ? step.id.replace(/_/g, ' ') : step.title || STEP.one);

const said = (name: string, label: string): string => (name.toLowerCase() === label.toLowerCase() ? name : `${name} — ${label}`);

export function outputRefs(earlier: EarlierStep[], nameOf: (step: EarlierStep) => string = formulaName): { ref: string; label: string; kind?: string }[] {
  const out: { ref: string; label: string; kind?: string }[] = [];
  for (const step of earlier) {
    if (loopsAt(step)) continue;
    const outputs = outputsAt(step);
    const name = nameOf(step);
    if (!outputs.length) {
      out.push({ ref: step.id, label: `${name} — результат` });
      continue;
    }
    for (const o of outputs) {
      out.push({ ref: `${step.id}${o.path}`, label: o.path ? said(name, o.label) : name, ...(o.kind ? { kind: o.kind } : {}) });
    }
  }
  return out;
}

export interface OutcomeRef { ref: string; label: string; kind?: string; no?: string }

const outcomeWord = (output: StepOutput): string => output.label.replace(/^да или нет: /, '');

export function outcomeRefs(earlier: EarlierStep[]): OutcomeRef[] {
  const rows = earlier
    .filter(step => !loopsAt(step))
    .flatMap(step => outputsAt(step).filter(output => output.kind !== 'roll').map(output => ({ step, output })));
  const plain = rows.map(({ step, output }) => `${step.title || formulaName(step)} — ${outcomeWord(output)}`);
  return rows.map(({ step, output }, at) => {
    const title = step.title || formulaName(step);
    const head = plain.indexOf(plain[at]!) === plain.lastIndexOf(plain[at]!) ? title : `${title} «${formulaName(step)}»`;
    const yes = outcomeWord(output);
    return {
      ref: `${step.id}${output.path}`,
      label: `${head} — ${yes}`,
      ...(output.kind ? { kind: output.kind } : {}),
      ...(output.kind === 'boolean' ? { no: `${head} — ${output.no ?? `не ${yes}`}` } : {}),
    };
  });
}

export function outputLabel(ref: string, earlier: EarlierStep[]): string {
  const found = outputRefs(earlier).find(o => o.ref === ref);
  if (found) return found.label;
  const [head, ...path] = ref.split('.');
  const step = earlier.find(s => s.id === head);
  const name = step ? formulaName(step) : `${STEP.one} «${head}»`;
  return path.length ? `${name} — ${path.join('.')}` : name;
}

export type SlotKind = 'const' | 'expr' | 'tag' | 'constant' | 'prop' | 'param' | 'ref' | 'table' | 'empty';

export interface SlotContext {
  system: System;
  effect: Effect;

  earlier: EarlierStep[];

  recordKind?: RecordKind;

  sheets?: SheetNames;

  names?: ReadonlyMap<string, string>;

  tables?: ReadonlyMap<string, string>;

  scope?: readonly NameAt[];
}

export const EVENT_NAMES: [string, string][] = [['метки', 'метки вызова: значения выборов']];

export const isCalled = (ctx: SlotContext): boolean =>
  Boolean(amountParamOf(ctx.effect))
  || calledOf(ctx.system).some(([, effect]) => effect === ctx.effect);

export function stepNames(ctx: SlotContext): Map<string, string> {
  const out = new Map<string, string>();
  if (isCalled(ctx)) for (const [key, label] of EVENT_NAMES) out.set(key, label);
  for (const [key, constant] of Object.entries(ctx.system.constants ?? {})) {
    out.set(key, (constant as { label?: string }).label ?? key);
  }
  for (const step of ctx.earlier) out.set(step.id, formulaName(step));
  for (const output of outputRefs(ctx.earlier, formulaName)) if (!ctx.names || ctx.names.has(output.ref)) out.set(output.ref, output.label);
  for (const [key, label] of ctx.names ?? []) if (!out.has(key)) out.set(key, label);
  return out;
}

export const inputBadges = (ctx: SlotContext): Map<string, string> =>
  new Map((ctx.effect.params ?? []).map(param => [param.key, 'вход']));

export function namesOf(ctx: SlotContext): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, label] of propsFor(ctx)) out.set(key, label);
  for (const param of ctx.effect.params ?? []) out.set(param.key, param.label ?? param.key);
  const heads = (ctx.effect.params ?? [])
    .filter(p => (p.kind === 'choice' || p.kind === 'record') && p.from)
    .map(p => ({ key: p.key, label: p.label ?? p.key, from: p.from }));
  for (const [key, label] of columnPaths(ctx.system, heads)) out.set(key, label);
  const engine = new Set(ctx.names?.keys() ?? []);
  for (const [key, label] of stepNames(ctx)) if (!out.has(key) || !engine.has(key)) out.set(key, label);
  const picks = new Map(ctx.earlier.filter(step => step.dice && !loopsAt(step)).map(step => [step.id, `${step.id}.total`]));
  return withPicks(withTables(out, ctx.tables), picks);
}

export function refForName(ctx: SlotContext, name: string): SlotRef | null {
  if (hasField(ctx.system, name)) return null;
  if ((ctx.effect.params ?? []).some(param => param.key === name)) return { expr: `@${name}` };
  if (ctx.system.constants?.[name]) return name;
  return null;
}

function propsFor(ctx: SlotContext): Map<string, string> {
  if (!ctx.recordKind) return new Map();
  const out = new Map<string, string>();
  for (const prop of ctx.recordKind.columns ?? []) {
    out.set(prop.key, prop.label ?? prop.key);
  }
  return out;
}

export function sheetChoices(ctx: SlotContext): { singles: Map<string, string>; firsts: (readonly [string, string])[]; lists: Map<string, string>; shared: boolean } {
  const lists = (ctx.effect.params ?? []).filter(param => param.kind === 'sheet' && param.many);
  const listKeys = new Set(lists.map(param => param.key));
  const singles = new Map([...(ctx.sheets ?? new Map<string, string>())].filter(([name]) => !listKeys.has(name)));
  const shared = lists.some(param => param.item && !ctx.sheets?.has(param.item.key));
  return {
    singles,
    firsts: lists.map(param => [`first(@${param.key})`, `первый из «${param.label ?? param.key}»`] as const),
    lists: new Map(lists.map(param => [param.key, param.label ?? param.key])),
    shared,
  };
}

export const callable = (system: System, except: Effect): [string, Effect][] => {
  const roles = rolesOf(system, null);
  const rank = (id: string) => ['step', 'pay', 'button'].indexOf(roles.get(id) ?? 'step');
  return Object.entries(system.effects ?? {})
    .filter(([, effect]) => effect !== except && (effect.activation ?? 'manual') === 'manual')
    .sort(([a], [b]) => rank(a) - rank(b));
};

