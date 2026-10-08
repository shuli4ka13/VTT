import type { SheetNames } from '../../ui/formula-chips.tsx';
import type { System, Effect, SlotRef } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { columnPaths } from '../../ui/formula.tsx';
import { stepModule } from '@vtt/engine/engine/steps/index';
import { calledOf } from '@vtt/engine/engine/effects';
import { amountParamOf } from '@vtt/engine/model/lists';
import { STEP } from '../../words.ts';
import { hasField } from '@vtt/engine/model/sheet-columns';
import { recordKinds } from '@vtt/engine/model/owned';

export interface EarlierStep { id: string; type: string; at?: number; title?: string }

export const stepName = (step: EarlierStep): string =>
  (step.at
    ? `${STEP.one} ${step.at}${step.title ? ` · ${step.title}` : ''}`
    : step.title || `${STEP.one} «${step.id}»`);

function outputsOf(type: string): { path: string; label: string; kind?: string }[] {
  try {
    return (stepModule(type).outputs ?? []) as { path: string; label: string; kind?: string }[];
  } catch {
    return [];
  }
}

export function outputRefs(earlier: EarlierStep[]): { ref: string; label: string; kind?: string }[] {
  const out: { ref: string; label: string; kind?: string }[] = [];
  for (const step of earlier) {
    if (step.type === 'each') continue;
    const outputs = outputsOf(step.type);
    const name = stepName(step);
    if (!outputs.length) {
      out.push({ ref: step.id, label: `${name} — результат` });
      continue;
    }
    for (const o of outputs) {
      out.push({ ref: `${step.id}${o.path}`, label: `${name} — ${o.label}`, ...(o.kind ? { kind: o.kind } : {}) });
    }
  }
  return out;
}

export function outputLabel(ref: string, earlier: EarlierStep[]): string {
  const found = outputRefs(earlier).find(o => o.ref === ref);
  if (found) return found.label;
  const [head, ...path] = ref.split('.');
  const step = earlier.find(s => s.id === head);
  const name = step ? stepName(step) : `${STEP.one} «${head}»`;
  return path.length ? `${name} — ${path.join('.')}` : name;
}

export type SlotKind = 'const' | 'expr' | 'tag' | 'constant' | 'prop' | 'param' | 'ref' | 'table' | 'empty';

export interface SlotContext {
  system: System;
  effect: Effect;

  earlier: EarlierStep[];

  recordKind?: RecordKind;

  sheets?: SheetNames;
}

export function declaredProps(system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, kind] of recordKinds(system)) {
    for (const prop of kind.columns ?? []) {
      out.set(prop.key, `${prop.label ?? prop.key} · ${kind.label ?? 'род'}`);
    }
  }
  return out;
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
  for (const step of ctx.earlier) out.set(step.id, stepName(step));
  for (const output of outputRefs(ctx.earlier)) out.set(output.ref, output.label);
  return out;
}

export const inputBadges = (ctx: SlotContext): Map<string, string> =>
  new Map((ctx.effect.params ?? []).map(param => [param.key, 'вход']));

export function namesOf(ctx: SlotContext): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, label] of propsFor(ctx)) out.set(key, label);
  for (const param of ctx.effect.params ?? []) out.set(param.key, param.label ?? param.key);
  const heads = (ctx.effect.params ?? [])
    .filter(p => p.kind === 'choice' && p.from)
    .map(p => ({ key: p.key, label: p.label ?? p.key, from: p.from }));
  for (const [key, label] of columnPaths(ctx.system, heads)) out.set(key, label);
  for (const [key, label] of stepNames(ctx)) out.set(key, label);
  return out;
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
    firsts: lists.map(param => [`первый(@${param.key})`, `первый из «${param.label ?? param.key}»`] as const),
    lists: new Map(lists.map(param => [param.key, param.label ?? param.key])),
    shared,
  };
}

export const callable = (system: System, except: Effect): [string, Effect][] =>
  Object.entries(system.effects ?? {}).filter(([, effect]) => effect !== except && (effect.activation ?? 'manual') === 'manual');

