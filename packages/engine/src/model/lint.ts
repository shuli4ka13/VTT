import type { System, Compendium, Effect, Step } from './types.ts';
import { registry } from '../engine/steps/index.ts';
import { activationOf, calledOf } from '../engine/effects.ts';
import { basedOn, paramsOf } from './inherit.ts';
import { danglingRows } from './integrity.ts';
import { TABS, STEP } from '../words/glossary.ts';
import {
  referencesOf, declaredOf, chainRefs, listenerOf,
  type Where, type Reference, type RefKind, type Declared,
} from './references.ts';

export type Level = 'error' | 'warn';

export interface Fix { kind: 'field'; tag: string }

export interface Problem {
  where: Where;
  level: Level;
  text: string;
  fix?: Fix;
}

const NAMES: Record<Exclude<RefKind, 'param' | 'step'>, (key: string) => string> = {
  field: key => `поля «${key}» в системе нет — заведите его на вкладке «${TABS.sheet}»`,
  effect: key => `эффекта «${key}» в системе нет`,
  constant: key => `кости «${key}» в системе нет`,
  table: key => `таблицы «${key}» в системе нет`,
  rollEdit: key => `правки броска «${key}» в системе нет`,
  event: key => `общего эффекта «${key}» в системе нет`,
  roll: key => `вида броска «${key}» в системе нет`,
  actionType: key => `типа действия «${key}» в системе нет`,
  prop: key => `свойство «${key}» не объявлено ни одним типом записей — заведите его на вкладке «${TABS.records}»`,
  recordKind: key => `типа записи «${key}» в системе нет`,
};

const sameWhere = (a: Where, b: Where): boolean => JSON.stringify(a) === JSON.stringify(b);

function danglingText(ref: Reference, declared: Declared): string | null {
  if (ref.kind === 'param') {
    return ref.scope === 'missing' ? `потребность «${ref.key}» эффектом не объявлена` : null;
  }
  if (ref.kind === 'step') {
    if (ref.scope?.startsWith('listened:')) {
      return `в эффекте «${ref.scope.slice('listened:'.length)}» нет ${STEP.gen} «${ref.key}» — условию срабатывания не на что смотреть`;
    }
    if (ref.scope === 'dotted' && (declared.field.has(ref.key) || declared.prop.has(ref.key))) return null;
    return `${STEP.gen} «${ref.key}» выше по цепочке нет — на его результат не сослаться`;
  }
  if (ref.kind === 'prop' && ref.scope === 'foreign') {
    return `свойство «${ref.key}» не объявлено у этого типа записи — привязка возьмёт его не оттуда`;
  }
  return declared[ref.kind].has(ref.key) ? null : NAMES[ref.kind](ref.key);
}

function stepProblems(steps: Step[], whereOf: (index: number) => Where, params: Set<string>, eventChain: boolean): Problem[] {
  const out: Problem[] = [];
  const earlier = new Set<string>();
  steps.forEach((step, index) => {
    const where = whereOf(index);
    const mod = registry.get(step.type);
    if (!mod) {
      out.push({ where, level: 'error', text: `движок не знает типа ${STEP.gen} «${step.type}»` });
      return;
    }
    for (const slot of (mod.slots ?? []) as { key: string; label: string; required?: boolean }[]) {
      const value = slot.key.split('.').reduce<unknown>((node, key) =>
        (node == null || typeof node !== 'object' ? undefined : (node as Record<string, unknown>)[key]), step);
      if (slot.required && (value === null || value === undefined)) {
        out.push({ where, level: 'error', text: `не заполнено: ${slot.label.toLowerCase()}` });
        break;
      }
      if (value && typeof value === 'object') {
        const r = value as Record<string, unknown>;
        if ('prop' in r && !String(r.prop ?? '')) out.push({ where, level: 'error', text: `${slot.label.toLowerCase()}: свойство не выбрано` });
        if ('tag' in r && !String(r.tag ?? '')) out.push({ where, level: 'error', text: `${slot.label.toLowerCase()}: поле не выбрано` });
      }
    }
    if (step.id) earlier.add(String(step.id));
  });
  void params; void eventChain;
  return out;
}

function refProblems(refs: Reference[], declared: Declared, earlierByWhere: (ref: Reference) => boolean): Problem[] {
  const out: Problem[] = [];
  for (const ref of refs) {
    if (ref.kind === 'step' && earlierByWhere(ref)) continue;
    const text = danglingText(ref, declared);
    if (!text) continue;
    if (out.some(p => sameWhere(p.where, ref.from) && p.text === text)) continue;
    out.push({
      where: ref.from, level: 'error', text,
      ...(ref.kind === 'field' ? { fix: { kind: 'field', tag: ref.key } } : {}),
    });
  }
  return out;
}

const earlierIds = (steps: Step[], index: number): Set<string> =>
  new Set(steps.slice(0, index).map(s => s.id).filter((id): id is string => Boolean(id)));

export interface EarlierStep { id: string; type: string }

export function lintStep(step: Step, system: System, effect: Effect, earlier: EarlierStep[]): Problem | null {
  const where: Where = { tab: 'effects', effect: effect.label ?? '', step: 0 };
  const inChain = listenerOf(effect.trigger?.on).kind === 'event' || calledOf(system).some(([key, other]) =>
    other === effect || system.effects[key] === effect || (!!effect.label && other.label === effect.label));
  const [structural] = stepProblems([step], () => where, new Set(), inChain);
  if (structural) return structural;
  const declared = declaredOf(system);
  const params = new Set(paramsOf(system, effect).map(p => p.key));
  const known = new Set(earlier.map(e => e.id));
  const refs = chainRefs([step], () => where, params, inChain)
    .filter(ref => !(ref.kind === 'step' && known.has(ref.key)))
    .filter(ref => !(ref.kind === 'field' && known.has(ref.key)));
  const [first] = refProblems(refs, declared, () => false);
  return first ?? null;
}

function cycleProblems(system: System): Problem[] {
  const edges = new Map<string, Set<string>>();
  const labels = new Map<string, string>();
  const link = (a: string, b: string) => { (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b); };
  const effectNode = (id: string): string => { labels.set(`effect:${id}`, system.effects[id]?.label ?? id); return `effect:${id}`; };


  const emitsOf = (steps: Step[] | undefined): string[] => emittedBy(steps);

  for (const [id, effect] of Object.entries(system.effects)) {
    for (const called of emitsOf(effect.steps)) link(effectNode(id), effectNode(called));
    if (activationOf(effect) === 'reaction') continue;
    const heard = listenerOf(effect.trigger?.on);
    if (heard.kind === 'event') link(effectNode(heard.key!), effectNode(id));
    if (heard.kind === 'effect') link(effectNode(heard.key!), effectNode(id));
  }

  const out: Problem[] = [];
  const seenCycles = new Set<string>();
  const state = new Map<string, 'in' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string) => {
    state.set(node, 'in'); stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const mark = state.get(next);
      if (mark === 'in') {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        const key = [...cycle].sort().join('|');
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          const first = cycle[0]!;
          const where: Where = first.startsWith('effect:')
            ? { tab: 'effects', effect: first.slice('effect:'.length), part: 'trigger' }
            : { tab: 'rules', section: 'events', key: first.slice('event:'.length) };
          out.push({ where, level: 'error', text: `вызовы идут по кругу: ${cycle.map(n => `«${labels.get(n) ?? n}»`).join(' → ')}` });
        }
      } else if (mark !== 'done') visit(next);
    }
    stack.pop(); state.set(node, 'done');
  };
  for (const node of [...edges.keys()]) if (!state.has(node)) visit(node);
  return out;
}

const MOMENT_KEYS = new Set([
  'turn-start', 'turn-end', 'round-start', 'combat-start', 'combat-end', 'scene-end', 'short-rest', 'long-rest',
  'equipped', 'attached', 'expired',
]);

function listenerProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const [id, effect] of Object.entries(system.effects)) {
    const activation = activationOf(effect);
    if (activation !== 'triggered' && activation !== 'reaction') continue;
    const heard = listenerOf(effect.trigger?.on);
    if (heard.kind === 'empty') {
      out.push({
        where: { tab: 'effects', effect: id, part: 'trigger' }, level: 'error',
        text: 'эффект срабатывает сам, но не сказано на что — выберите, что он слушает',
      });
    }
    if (heard.kind === 'moment' && !MOMENT_KEYS.has(heard.key!)) {
      out.push({
        where: { tab: 'effects', effect: id, part: 'trigger' }, level: 'error',
        text: `такого момента нет: «${heard.key}» — стол знает ${[...MOMENT_KEYS].join(', ')}`,
      });
    }
  }
  return out;
}

function emittedBy(steps: Step[] | undefined): string[] {
  const out: string[] = [];
  for (const step of steps ?? []) {
    const slots = (registry.get(step.type)?.slots ?? []) as { key: string; kind?: string }[];
    for (const slot of slots) {
      if (slot.kind !== 'event') continue;
      const value = (step as Record<string, unknown>)[slot.key];
      if (typeof value === 'string' && value) out.push(value);
    }
  }
  return out;
}

function orphanProblems(system: System, compendium?: Compendium): Problem[] {
  const out: Problem[] = [];
  const emitted = new Set<string>();
  const heardEvents = new Set<string>();
  for (const effect of Object.values(system.effects)) {
    for (const event of emittedBy(effect.steps)) emitted.add(event);
    const heard = listenerOf(effect.trigger?.on);
    if (heard.kind === 'event') heardEvents.add(heard.key!);
  }
  for (const key of emitted) {
    const called = system.effects[key];
    if (!called || called.steps?.length || heardEvents.has(key)) continue;
    out.push({
      where: { tab: 'effects', effect: key }, level: 'warn',
      text: `эффект «${called.label || key}» вызывают, но он ничего не делает: ни шагов, ни слушателей`,
    });
  }
  const bound = new Set<string>();
  for (const kind of Object.values(system.records ?? {})) for (const b of kind.bindings ?? []) bound.add(b.effect);
  for (const id of system.room_rules ?? []) bound.add(id);
  for (const record of [...(compendium?.items ?? []), ...(compendium?.actions ?? [])]) {
    if (record.effect) bound.add(String(record.effect));
    for (const activity of record.activities ?? []) bound.add(activity.effect);
    for (const id of record.grants ?? []) bound.add(id);
  }
  if (compendium) {
    const called = new Set(calledOf(system).map(([key]) => key));
    for (const [id, effect] of Object.entries(system.effects)) {
      if (effect.activation !== 'manual' || bound.has(id) || called.has(id)) continue;
      out.push({
        where: { tab: 'effects', effect: id }, level: 'warn',
        text: `эффект «${effect.label ?? id}» никак не запускается: ни одна запись компендиума его не даёт`,
      });
    }
  }
  return out;
}

function paramProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const fields = new Set(system.fields.map(f => f.tag));
  for (const [id, effect] of Object.entries(system.effects)) {
    for (const param of effect.params ?? []) {
      if (!fields.has(param.key)) continue;
      out.push({
        where: { tab: 'effects', effect: id }, level: 'error',
        text: `потребность «${param.label ?? param.key}» названа как поле «${param.key}» — в формулах шага победит поле; переименуйте потребность`,
      });
    }
  }
  for (const [id, effect] of Object.entries(system.effects)) {
    const chains: [Step[], 'steps' | 'self'][] = [[effect.steps ?? [], 'steps'], [effect.self ?? [], 'self']];
    for (const [steps, part] of chains) {
      steps.forEach((step, index) => {
        const raw = step as unknown as Record<string, unknown>;
        if (step.type !== 'emit' || !raw.event) return;
        const called = system.effects[String(raw.event)];
        if (!called) return;
        const args = (raw.args ?? {}) as Record<string, unknown>;
        for (const param of called.params ?? []) {
          if (args[param.key] !== undefined || param.optional || param.ask) continue;
          out.push({
            where: { tab: 'effects', effect: id, step: index, ...(part === 'self' ? { part: 'self' as const } : {}) },
            level: 'error',
            text: `вызов «${called.label ?? raw.event}» не заполняет его потребность «${param.label ?? param.key}»`,
          });
        }
      });
    }
  }
  const kindBases = new Set(Object.values(system.records ?? {})
    .map(kind => basedOn(kind)).filter((key): key is string => Boolean(key)));
  for (const [kind, spec] of Object.entries(system.records ?? {})) {
    if (kindBases.has(kind)) continue;
    (spec.bindings ?? []).forEach((binding, index) => {
      const effect = system.effects[binding.effect];
      if (!effect) return;
      for (const param of effect.params ?? []) {
        if (binding.args?.[param.key] !== undefined) continue;
        if (param.ask) continue;
        out.push({
          where: { tab: 'records', kind, part: 'bindings', binding: index }, level: 'error',
          text: `привязка «${binding.label ?? effect.label ?? binding.effect}» не заполняет потребность «${param.label ?? param.key}» эффекта «${effect.label ?? binding.effect}»`,
        });
      }
    });
  }
  return out;
}

export function lintSystem(system: System, compendium?: Compendium): Problem[] {
  const declared = declaredOf(system);
  const called = new Set(calledOf(system).map(([key]) => key));
  const out: Problem[] = [];

  for (const [id, effect] of Object.entries(system.effects)) {
    const params = new Set((effect.params ?? []).map(p => p.key));
    out.push(...stepProblems(effect.steps ?? [], step => ({ tab: 'effects', effect: id, step }), params, called.has(id)));
    out.push(...stepProblems(effect.self ?? [], step => ({ tab: 'effects', effect: id, step, part: 'self' }), params, false));
  }

  const chainOf = (where: Where): Step[] | undefined =>
    where.tab === 'effects' && where.effect
      ? (where.part === 'self' ? system.effects[where.effect]?.self : system.effects[where.effect]?.steps)
      : undefined;
  const refs = referencesOf(system, compendium).filter(ref => {
    if (ref.kind !== 'field' || ref.from.step === undefined) return true;
    const steps = chainOf(ref.from);
    return !(steps && earlierIds(steps, ref.from.step).has(ref.key));
  });
  out.push(...refProblems(refs, declared, ref => {
    const steps = chainOf(ref.from);
    return Boolean(steps && ref.from.step !== undefined && earlierIds(steps, ref.from.step).has(ref.key));
  }));

  out.push(...listenerProblems(system));
  out.push(...cycleProblems(system));
  out.push(...paramProblems(system));
  out.push(...orphanProblems(system, compendium));
  out.push(...danglingRows(system, compendium).map(d => ({ where: d.where, level: 'error' as const, text: d.text })));
  return out;
}

export function lintCompendium(system: System, compendium: Compendium): Problem[] {
  return lintSystem(system, compendium).filter(p => p.where.tab === 'book');
}

export const errorsOf = (problems: Problem[]): Problem[] => problems.filter(p => p.level === 'error');

const quoted = (label: string | undefined, key: string): string => `«${label || key}»`;

export function describeWhere(where: Where, system: System, compendium?: Compendium): string {
  const parts: string[] = [];
  if (where.tab === 'sheet') {
    parts.push(TABS.sheet);
    if (where.field) parts.push(`поле ${quoted(system.fields.find(f => f.tag === where.field)?.label, where.field)}`);
  } else if (where.tab === 'effects') {
    parts.push(TABS.effects);
    if (where.effect) parts.push(`эффект ${quoted(system.effects[where.effect]?.label, where.effect)}`);
    if (where.step !== undefined) parts.push(`${STEP.one} ${where.step + 1}`);
    if (where.part === 'trigger') parts.push('что слушает');
    if (where.part === 'modifiers') parts.push('модификаторы');
    if (where.part === 'cost') parts.push('чего стоит');
  } else if (where.tab === 'rules') {
    parts.push(TABS.rules);
    if (where.section === 'room_rules') parts.push('правила комнаты');
    else if (where.section === 'initiative') parts.push('инициатива');
    else if (where.section) parts.push(where.section);
    if (where.step !== undefined) parts.push(`${STEP.one} ${where.step + 1}`);
  } else if (where.tab === 'records') {
    parts.push(TABS.records);
    if (where.kind) parts.push(quoted(system.records?.[where.kind]?.label, where.kind));
    if (where.binding !== undefined) parts.push(`привязка ${where.binding + 1}`);
    else if (where.part === 'modifiers') parts.push('модификаторы');
  } else if (where.tab === 'book') {
    parts.push('Компендиум');
    if (where.record) {
      const found = [...(compendium?.items ?? []), ...(compendium?.actions ?? [])].find(r => r.id === where.record);
      parts.push(`запись ${quoted(found?.label, where.record)}`);
    }
  }
  return parts.join(' · ');
}
