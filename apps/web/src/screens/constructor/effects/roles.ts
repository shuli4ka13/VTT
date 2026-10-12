import type { System, Effect, Compendium } from '@vtt/schema';
import { launchOf } from '@vtt/engine/model/effect-kinds';
import { calledOf } from '@vtt/engine/engine/effects';
import { COST_BLOCK } from '@vtt/engine/words/glossary';

export type Role = 'button' | 'auto' | 'passive' | 'pay' | 'step';

export const ROLE_GROUPS: Record<Role, string> = {
  step: 'Шаги для других', pay: 'Плата', button: 'Кнопкой', auto: 'Срабатывают сами', passive: 'Висят и правят',
};

const ROLE_ORDER: Role[] = ['step', 'pay', 'button', 'auto', 'passive'];

export function grouped<E>(system: System, list: readonly [string, E][]): [string, E, string][] {
  const roles = rolesOf(system, null);
  const rank = (id: string) => ROLE_ORDER.indexOf(roles.get(id) ?? 'step');
  return [...list].sort(([a], [b]) => rank(a) - rank(b)).map(([id, effect]) => [id, effect, ROLE_GROUPS[roles.get(id) ?? 'step']]);
}

export const ROLE_WORDS: Record<Role, string> = {
  button: 'кнопкой', auto: 'срабатывает сам', passive: 'висит и правит', pay: 'плата', step: 'шаг для других',
};

type Loose = Record<string, unknown>;

const fromInput = (value: unknown): string | null =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((value as { expr?: unknown } | null)?.expr ?? ''))?.[1] ?? null;

const literalOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  const expr = String((value as { expr?: unknown } | null)?.expr ?? '').trim();
  return /^"([^"]+)"$/.exec(expr)?.[1] ?? /^'([^']+)'$/.exec(expr)?.[1] ?? null;
};

const stepsOf = (effect: Effect): Loose[] => [
  ...(effect.steps ?? []), ...(effect.attach ?? []), ...(effect.detach ?? []),
  ...(effect.on ?? []).flatMap(handler => handler.steps ?? []),
] as Loose[];

const costLanes = (effect: Effect): Loose[] =>
  [...(effect.cost ?? []), ...(effect.on ?? []).flatMap(handler => handler.cost ?? [])] as Loose[];

function bindingsOf(system: System, compendium: Compendium | null): { effect: string; args?: Loose; record?: Loose }[] {
  const out: { effect: string; args?: Loose; record?: Loose }[] = [];
  for (const table of Object.values(system.tables ?? {})) {
    for (const binding of table.bindings ?? []) out.push({ effect: binding.effect, ...(binding.args ? { args: binding.args as Loose } : {}) });
  }
  for (const record of (compendium?.records ?? []) as Loose[]) {
    const own = (record.bindings ?? []) as { effect: string; args?: Loose }[];
    for (const binding of own) out.push({ effect: binding.effect, ...(binding.args ? { args: binding.args } : {}), record });
    const table = system.tables?.[String(record.table ?? '')];
    for (const binding of table?.bindings ?? []) out.push({ effect: binding.effect, ...(binding.args ? { args: binding.args as Loose } : {}), record });
  }
  return out;
}

function payIds(system: System, compendium: Compendium | null): Set<string> {
  const out = new Set<string>();
  const inputs = new Map<string, Set<string>>();
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const step of costLanes(effect)) {
      if (step.type !== 'emit') continue;
      const named = literalOf(step.effect);
      if (named && system.effects?.[named]) { out.add(named); continue; }
      const key = fromInput(step.effect);
      if (key) inputs.set(id, (inputs.get(id) ?? new Set()).add(key));
    }
  }
  const add = (value: unknown) => { const named = literalOf(value); if (named && system.effects?.[named]) out.add(named); };
  for (const [id, keys] of inputs) {
    for (const param of system.effects?.[id]?.params ?? []) if (keys.has(param.key)) add(param.default);
    for (const binding of bindingsOf(system, compendium)) {
      if (binding.effect !== id) continue;
      for (const key of keys) { add(binding.args?.[key]); add((binding.record?.cells as Loose | undefined)?.[key]); }
    }
    for (const effect of Object.values(system.effects ?? {})) {
      for (const step of [...stepsOf(effect), ...costLanes(effect)]) {
        if (step.type === 'emit' && step.effect === id) for (const key of keys) add((step.args as Loose | undefined)?.[key]);
      }
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...out]) {
      for (const step of stepsOf(system.effects![id]!)) {
        const named = step.type === 'emit' ? literalOf(step.effect) : null;
        if (named && system.effects?.[named] && !out.has(named)) { out.add(named); grew = true; }
      }
    }
  }
  return out;
}

const CACHE = new WeakMap<System, { compendium: Compendium | null; roles: Map<string, Role> }>();

export function rolesOf(system: System, compendium: Compendium | null): Map<string, Role> {
  const hit = CACHE.get(system);
  if (hit && hit.compendium === compendium) return hit.roles;
  const pay = payIds(system, compendium);
  const called = new Set(calledOf(system).map(([id]) => id));
  const roles = new Map<string, Role>();
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    const kind = launchOf(effect).kind;
    roles.set(id, kind === 'passive' ? 'passive' : kind === 'auto' ? 'auto' : pay.has(id) || (!called.has(id) && effect.group === COST_BLOCK) ? 'pay' : called.has(id) ? 'step' : 'button');
  }
  CACHE.set(system, { compendium, roles });
  return roles;
}

export const roleOf = (system: System, compendium: Compendium | null, id: string): Role =>
  rolesOf(system, compendium).get(id) ?? 'step';

export const withRole = (system: System, compendium: Compendium | null, role: Role, except?: string): [string, Effect][] =>
  Object.entries(system.effects ?? {}).filter(([id]) => id !== except && roleOf(system, compendium, id) === role);
