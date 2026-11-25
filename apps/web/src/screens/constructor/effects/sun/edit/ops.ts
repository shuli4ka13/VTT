import { ANY_ACTION, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX, MOMENT_PREFIX, ROLLED, SEEN, armsOf, endOf, flowOf, happeningOf, inBlock, loopsAt, sunOf } from '@vtt/engine';
import type { Phase, Sun, SunRay, SunSpan } from '@vtt/engine';
import type { Effect, Step, System } from '@vtt/schema';
import { BRICKS, SEEN_BRICKS, armEnd, groupSteps, moveSpan, removeSteps, validFlow } from '../../../cards.ts';
import { newHandler, payStep } from '../../../factory.ts';
import { filledStep } from '../../call-args.ts';
import { editCarrier, placeOf, stepsOf } from '../../carrier.ts';
import type { CarrierPart } from '../../carrier.ts';
import { sheetsAt } from '../../names.ts';

export type Mode = 'inside' | 'after';

export type Spot = CarrierPart & { index: number };

export type Template =
  | { kind: 'brick'; key: string }
  | { kind: 'seen'; key: string }
  | { kind: 'call'; effect: string }
  | { kind: 'status'; effect: string }
  | { kind: 'pay'; effect: string };

export const templateKey = (template: Template): string =>
  template.kind === 'brick' || template.kind === 'seen' ? `${template.kind}:${template.key}` : `${template.kind}:${template.effect}`;

const COST_PARTS: ReadonlySet<string> = new Set(['cost', 'handler-cost']);
const HANDLER_PARTS: ReadonlySet<string> = new Set(['handler', 'handler-cost', 'handler-on', 'handler-if', 'handler-confirm']);
const CHAIN_PARTS: ReadonlySet<string> = new Set(['steps', 'attach', 'detach', 'handler']);

export const carrierPartOf = (span: SunSpan | null): CarrierPart | null => {
  if (!span) return null;
  if (span.part === 'steps' || span.part === 'cost' || span.part === 'attach' || span.part === 'detach') return { part: span.part };
  if (span.part === 'handler' || span.part === 'handler-cost') return { part: span.part, handler: span.handler ?? 0 };
  return null;
};

const withList = <T>(draft: Effect, at: CarrierPart, run: (view: Effect) => T): T | undefined => {
  let out: T | undefined;
  editCarrier(change => change(draft), at)(view => { out = run(view); });
  return out;
};

const openOf = (steps: readonly Step[], head: number): number => {
  if (flowOf(steps[head]?.type ?? '') === 'open') return head;
  let depth = 0;
  for (let i = head - 1; i >= 0; i--) {
    const flow = flowOf(steps[i]!.type);
    if (flow === 'close') depth++;
    else if (flow === 'open') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return head;
};

export function rayKey(system: System, id: string, effect: Effect, at: CarrierPart, index: number): string | null {
  const sun = sunOf({ ...system, effects: { ...system.effects, [id]: effect } }, id);
  if (!sun) return null;
  const same = (span: SunSpan): boolean => span.part === at.part && (span.handler ?? null) === (at.handler ?? null);
  if (COST_PARTS.has(at.part)) return sun.rays.find(ray => ray.span && same(ray.span))?.key ?? null;
  return sun.rays.find(ray => ray.span && same(ray.span) && ray.span.from <= index && index <= ray.span.to)?.key ?? null;
}

export function atomRange(steps: readonly Step[], from: number): { from: number; to: number; whole: boolean; arm: boolean } | null {
  const head = steps[from];
  if (!head) return null;
  const flow = flowOf(head.type);
  if (flow === 'close') return null;
  if (flow === 'open') return { from, to: endOf(steps as Step[], from), whole: true, arm: false };
  if (flow === 'alt') return { from, to: armEnd(steps as Step[], from) - 1, whole: false, arm: true };
  const group = groupSteps(steps as Step[]).find(card => card.indices.includes(from));
  if (!group) return { from, to: from, whole: false, arm: false };
  return { from: group.indices[0]!, to: group.indices[group.indices.length - 1]!, whole: false, arm: false };
}

const defaultSpot = (effect: Effect, sun: Sun): Spot | null => {
  if (sun.launch === 'manual') return { part: 'steps', index: (effect.steps ?? []).length };
  const first = effect.on?.[0];
  return first ? { part: 'handler', handler: 0, index: (first.steps ?? []).length } : null;
};

const payPlace = (effect: Effect, sun: Sun, span: SunSpan | null): Spot | null => {
  if (span && HANDLER_PARTS.has(span.part)) {
    const handler = span.handler ?? 0;
    return { part: 'handler-cost', handler, index: (effect.on?.[handler]?.cost ?? []).length };
  }
  if (sun.launch === 'manual') return { part: 'cost', index: (effect.cost ?? []).length };
  const first = effect.on?.[0];
  return first ? { part: 'handler-cost', handler: 0, index: (first.cost ?? []).length } : null;
};

export function placeFor(effect: Effect, sun: Sun, ray: SunRay | null, mode: Mode, template?: Template): Spot | null {
  const span = ray?.span ?? null;
  if (template?.kind === 'pay') return payPlace(effect, sun, span);
  if (!span) return defaultSpot(effect, sun);
  if (span.part === 'cost') return defaultSpot(effect, sun);
  if (span.part === 'handler-cost') return { part: 'handler', handler: span.handler ?? 0, index: (effect.on?.[span.handler ?? 0]?.steps ?? []).length };
  if (span.part === 'handler-on' || span.part === 'handler-if' || span.part === 'handler-confirm') return { part: 'handler', handler: span.handler ?? 0, index: 0 };
  if (!CHAIN_PARTS.has(span.part)) return defaultSpot(effect, sun);
  const at = carrierPartOf(span)!;
  const steps = stepsOf(effect, at);
  const head = steps[span.from];
  if (!head) return { ...at, index: steps.length };
  const flow = flowOf(head.type);
  if (flow === 'open' || flow === 'alt') {
    if (mode === 'inside') return { ...at, index: armEnd(steps, span.from) };
    return { ...at, index: endOf(steps, openOf(steps, span.from)) + 1 };
  }
  const range = atomRange(steps, span.from);
  return { ...at, index: (range?.to ?? span.from) + 1 };
}

export function canInsert(effect: Effect, system: System, id: string, spot: Spot | null, template: Template): true | string {
  if (!spot) return 'reason.noPlace';
  const cost = COST_PARTS.has(spot.part);
  if (template.kind === 'pay') {
    if (!cost) return 'reason.payHere';
    if (spot.part === 'handler-cost' && !effect.on?.[spot.handler ?? 0]?.confirm) return 'reason.payConfirm';
    return true;
  }
  if (cost) return 'reason.costOnly';
  if (template.kind === 'seen') {
    return spot.part === 'handler' && effect.on?.[spot.handler ?? 0]?.on === SEEN ? true : 'reason.seen';
  }
  if (template.kind === 'call') {
    if (template.effect === id) return 'reason.callSelf';
    const called = system.effects?.[template.effect];
    if (!called) return 'reason.noEffect';
    return (called.activation ?? 'manual') === 'passive' ? 'reason.callPassive' : true;
  }
  if (template.kind === 'status') {
    const applied = system.effects?.[template.effect];
    if (!applied) return 'reason.noEffect';
    return (applied.activation ?? 'manual') === 'passive' ? true : 'reason.statusManual';
  }
  const view = structuredClone(effect);
  const list = [...stepsOf(view, spot)];
  const at = Math.min(spot.index, list.length);
  const fresh = made(system, id, { ...view, steps: list }, spot, at, template);
  if (fresh.some(step => loopsAt(step))) {
    list.splice(at, 0, ...fresh);
    if (!validFlow(list)) return 'reason.eachInside';
  }
  return true;
}

const made = (system: System, id: string, view: Effect, spot: Spot, index: number, template: Template): Step[] => {
  const list = view.steps ?? [];
  const taken = list.map(step => step.id).filter(Boolean) as string[];
  if (template.kind === 'call') return [filledStep(system, view, { type: 'emit', effect: template.effect }, list.slice(0, index)) as unknown as Step];
  if (template.kind === 'status') return [filledStep(system, view, { type: 'status', effect: template.effect }, list.slice(0, index)) as unknown as Step];
  if (template.kind === 'pay') return [payStep(system, view, template.effect)];
  const brick = [...BRICKS, ...SEEN_BRICKS].find(one => one.key === template.key);
  return brick ? brick.make(system, taken, view, sheetsAt(system, id, placeOf(spot)(index))) : [];
};

export function insertStep(draft: Effect, system: System, id: string, spot: Spot, template: Template): string | null {
  if (canInsert(draft, system, id, spot, template) !== true) return null;
  let at = -1;
  withList(draft, spot, view => {
    const list = (view.steps ??= []);
    const index = Math.min(spot.index, list.length);
    const params = view.params;
    const steps = made(system, id, view, spot, index, template);
    if (!steps.length) return;
    list.splice(index, 0, ...steps);
    at = index;
    if (view !== draft && view.params !== params) draft.params = view.params;
  });
  return at < 0 ? null : rayKey(system, id, draft, spot, at);
}

export function moveAtom(draft: Effect, system: System, id: string, span: SunSpan, delta: -1 | 1): string | null {
  const at = carrierPartOf(span);
  if (!at || COST_PARTS.has(at.part)) return null;
  let moved = -1;
  withList(draft, at, view => {
    const steps = view.steps ?? [];
    const range = atomRange(steps, span.from);
    if (!range || range.arm) return;
    const lead = steps[range.from];
    const out = moveSpan(steps, [range.from, range.to], delta, range.whole);
    if (out === steps) return;
    view.steps = out;
    moved = out.indexOf(lead!);
  });
  return moved < 0 ? null : rayKey(system, id, draft, at, moved);
}

const parentOf = (steps: readonly Step[], index: number): Step | null => {
  const stack: Step[] = [];
  for (let i = 0; i < index; i++) {
    const flow = flowOf(steps[i]!.type);
    if (flow === 'open') stack.push(steps[i]!);
    else if (flow === 'close') stack.pop();
  }
  return stack[stack.length - 1] ?? null;
};

const sameChain = (a: SunSpan, b: SunSpan): boolean =>
  CHAIN_PARTS.has(a.part) && a.part === b.part && (a.handler ?? 0) === (b.handler ?? 0);

const reorder = (steps: Step[], from: number, target: number): { steps: Step[]; lead: Step } | string => {
  const source = atomRange(steps, from);
  const aim = atomRange(steps, target);
  if (!source || source.arm || !aim || aim.arm) return 'reason.moveNo';
  if (target >= source.from && target <= source.to) return 'reason.moveHere';
  if (aim.to + 1 === source.from) return 'reason.moveHere';
  const parent = parentOf(steps, source.from);
  if (parent !== parentOf(steps, aim.from)) return 'reason.moveLevel';
  const lead = steps[source.from]!;
  const mark = steps[aim.from]!;
  let current = steps;
  for (let guard = 0; guard < steps.length * 2 + 2; guard++) {
    const here = atomRange(current, current.indexOf(lead));
    const there = atomRange(current, current.indexOf(mark));
    if (!here || !there) return 'reason.moveNo';
    if (here.from === there.to + 1) return { steps: current, lead };
    const next = moveSpan(current, [here.from, here.to], here.from > there.to ? -1 : 1, true);
    if (next === current) return 'reason.moveLevel';
    if (parentOf(next, next.indexOf(lead)) !== parent) return 'reason.moveLevel';
    current = next;
  }
  return 'reason.moveLevel';
};

export const moveVerdict = (effect: Effect, span: SunSpan | null, target: SunSpan | null): true | string => {
  if (!span || !target || !sameChain(span, target)) return 'reason.moveLevel';
  const result = reorder(stepsOf(effect, carrierPartOf(span)!) as Step[], span.from, target.from);
  return typeof result === 'string' ? result : true;
};

export const canMoveTo = (effect: Effect, span: SunSpan | null, target: SunSpan | null): boolean => moveVerdict(effect, span, target) === true;

export function moveAtomTo(draft: Effect, system: System, id: string, span: SunSpan, target: SunSpan): string | null {
  if (!sameChain(span, target)) return null;
  const at = carrierPartOf(span)!;
  let moved = -1;
  withList(draft, at, view => {
    const result = reorder(view.steps ?? [], span.from, target.from);
    if (typeof result === 'string') return;
    view.steps = result.steps;
    moved = result.steps.indexOf(result.lead);
  });
  return moved < 0 ? null : rayKey(system, id, draft, at, moved);
}

export function removeAtom(draft: Effect, span: SunSpan): null {
  const at = carrierPartOf(span);
  if (!at || COST_PARTS.has(at.part)) return null;
  withList(draft, at, view => {
    const steps = view.steps ?? [];
    const range = atomRange(steps, span.from);
    if (!range) return;
    const indices = Array.from({ length: range.to - range.from + 1 }, (_, k) => range.from + k);
    view.steps = removeSteps(steps, indices).steps;
  });
  return null;
}

export const canMove = (effect: Effect, span: SunSpan | null): boolean => {
  const at = carrierPartOf(span);
  if (!at || COST_PARTS.has(at.part)) return false;
  const range = atomRange(stepsOf(effect, at), span!.from);
  return Boolean(range && !range.arm);
};

export const canRemove = (effect: Effect, span: SunSpan | null): boolean => {
  const at = carrierPartOf(span);
  if (!at || COST_PARTS.has(at.part)) return false;
  return Boolean(atomRange(stepsOf(effect, at), span!.from));
};

export const isBlockHead = (effect: Effect, span: SunSpan | null): boolean => {
  const at = carrierPartOf(span);
  if (!at || COST_PARTS.has(at.part)) return false;
  const flow = flowOf(stepsOf(effect, at)[span!.from]?.type ?? '');
  return flow === 'open' || flow === 'alt';
};

export type HappeningKind = 'before' | 'after' | 'done' | 'seen' | 'rolled' | 'moment' | 'field' | 'gained' | 'lost';

export const HAPPENINGS: readonly HappeningKind[] = ['before', 'after', 'done', 'seen', 'rolled', 'moment', 'field', 'gained', 'lost'];

export const happeningFor = (kind: HappeningKind): string => {
  switch (kind) {
    case 'seen': return SEEN;
    case 'rolled': return ROLLED;
    case 'moment': return MOMENT_PREFIX;
    case 'field': return FIELD_PREFIX;
    case 'gained': return GAINED_PREFIX;
    case 'lost': return LOST_PREFIX;
    default: return happeningOf(kind as Phase, ANY_ACTION);
  }
};

export function addHandler(draft: Effect, on: string): string {
  const handler = newHandler();
  handler.on = on;
  (draft.on ??= []).push(handler);
  return `on${draft.on.length - 1}:when`;
}

export function removeHandler(draft: Effect, index: number): null {
  draft.on = (draft.on ?? []).filter((_, at) => at !== index);
  if (!draft.on.length) delete draft.on;
  return null;
}

export const rangeOf = (effect: Effect, span: SunSpan | null): { from: number; to: number } | null => {
  const at = carrierPartOf(span);
  if (!at) return null;
  const steps = stepsOf(effect, at);
  if (COST_PARTS.has(at.part)) return steps.length ? { from: 0, to: steps.length - 1 } : null;
  return span ? { from: span.from, to: span.to } : null;
};

export const hasLoopIn = (steps: readonly Step[]): boolean => steps.some((step, index) => loopsAt(step) && inBlock(armsOf(steps as Step[]), index));
