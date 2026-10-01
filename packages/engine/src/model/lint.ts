import { isActionMoment, ACTION_MOMENTS } from '../events/bus.ts';
import type { System, Compendium, Effect, Step } from './types.ts';
import { registry } from '../engine/steps/index.ts';
import { STEP_WORDS } from '../words/steps.ts';
import { ROLL_CALL, CALL_WORDS } from '../words/calls.ts';
import { modifierLists } from './integrity.ts';
import { calledOf, chainsOfEffect } from '../engine/effects.ts';
import { basedOn, paramsOf } from './inherit.ts';
import { danglingRows } from './integrity.ts';
import { recordsOf, argsWithProps, propKeysOf, recordKinds, kindsOf, kindOf, isBook } from './owned.ts';
import { blockNames } from './blocks.ts';
import { MOMENTS } from '../events/moments.ts';
import { TABS, STEP } from '../words/glossary.ts';
import { DESK, RECEIVER, SENDER } from '../engine/owners.ts';
import {
  referencesOf, declaredOf, chainRefs, listenerOf, withAddresses,
  type Where, type Reference, type RefKind, type Declared,
  LISTEN, DONE_OUTCOME, TARGETS_SEED,
} from './references.ts';
import { fieldsOf, fieldOf, fieldProblems, onSheet, isSingle, rowKeyOf } from './sheet-columns.ts';

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
  roll: key => `метки броска «${key}» нет ни в одной таблице — заведите строку «${key}», например в таблице «Броски»`,
  prop: key => `свойство «${key}» не объявлено ни одним типом записей — заведите его на вкладке «${TABS.records}»`,
  recordKind: key => `типа записи «${key}» в системе нет`,
};

const sameWhere = (a: Where, b: Where): boolean => JSON.stringify(a) === JSON.stringify(b);

interface Chain { steps: Step[]; where: (step: number) => Where; eventChain: boolean; part?: 'cost' }

const hearsEvent = (effect: Effect): boolean => (effect.on ?? []).some(h => listenerOf(h).kind === 'event');

function chainsOf(id: string, effect: Effect, called: boolean): Chain[] {
  const out: Chain[] = [
    { steps: effect.steps ?? [], where: step => ({ tab: 'effects', effect: id, step }), eventChain: called },
    { steps: effect.cost ?? [], where: step => ({ tab: 'effects', effect: id, step, part: 'cost' }), eventChain: false, part: 'cost' },
  ];
  (effect.on ?? []).forEach((handler, index) => {
    const event = listenerOf(handler).kind === 'event';
    out.push({ steps: handler.steps ?? [], where: step => ({ tab: 'effects', effect: id, handler: index, step }), eventChain: event });
    out.push({ steps: handler.cost ?? [], where: step => ({ tab: 'effects', effect: id, handler: index, step, part: 'cost' }), eventChain: false, part: 'cost' });
  });
  for (const turn of ['attach', 'detach'] as const) {
    out.push({ steps: effect[turn] ?? [], where: step => ({ tab: 'effects', effect: id, step, part: turn }), eventChain: false });
  }
  return out;
}

const stepsAt = (system: System, where: Where): Step[] | undefined => {
  if (where.tab !== 'effects' || !where.effect) return undefined;
  const effect = system.effects[where.effect];
  if (where.part === 'attach' || where.part === 'detach') return effect?.[where.part];
  const holder = where.handler === undefined ? effect : effect?.on?.[where.handler];
  return where.part === 'cost' ? holder?.cost : holder?.steps;
};

function ownerText(ref: Reference, system: System): string | null {
  if (ref.kind === 'field' && ref.scope === 'plain') {
    const field = fieldOf(system, ref.key);
    return field?.lives === 'desk' ? `поле «${field.label}» лежит на столе — пишите @стол.${field.tag}` : null;
  }
  if (ref.kind !== 'field' || !ref.scope?.startsWith('owner:')) return null;
  const owner = ref.scope.slice('owner:'.length);
  const field = fieldOf(system, ref.key);
  if (!field) return null;
  if (owner === RECEIVER && ref.from.part === 'cost') {
    return `в шагах отправителя получателя нет — они идут один раз до всех целей; пишите @отправитель.${field.tag}`;
  }
  if (field.lives === 'desk' && owner !== DESK) return `поле «${field.label}» лежит на столе, а не на листе ${owner === SENDER ? 'отправителя' : 'получателя'} — пишите @стол.${field.tag}`;
  if (field.lives !== 'desk' && owner === DESK) return `поле «${field.label}» лежит на листе персонажа, а не на столе — пишите @отправитель.${field.tag} или @получатель.${field.tag}`;
  return null;
}

function danglingText(ref: Reference, declared: Declared): string | null {
  if (ref.scope === LISTEN) return null;
  if (ref.kind === 'param') {
    return ref.scope === 'missing' ? `вход «${ref.key}» эффектом не объявлен` : null;
  }
  if (ref.kind === 'step') {
    if (ref.scope === DONE_OUTCOME) {
      return `«${ACTION_MOMENTS.done.label}» срабатывает один раз на все цели — итог «${ref.path ?? ref.key}» у каждой цели свой: берите его из таблицы целей, например сколько(@${TARGETS_SEED}.${ref.path ?? ref.key}, да)`;
    }
    if (ref.scope?.startsWith('listened:')) {
      return `в эффекте «${ref.scope.slice('listened:'.length)}» нет ${STEP.gen} «${ref.key}» — условию срабатывания не на что смотреть`;
    }
    if (ref.scope === 'dotted' && (declared.field.has(ref.key) || declared.prop.has(ref.key))) return null;
    return `${STEP.gen} «${ref.key}» выше по цепочке нет — на его результат не сослаться`;
  }
  if (ref.kind === 'prop' && ref.scope === 'foreign') {
    return `свойство «${ref.key}» не объявлено у этого типа записи — привязка возьмёт его не оттуда`;
  }
  if (ref.kind === 'field' && !declared.field.has(ref.key) && declared.effect.has(ref.key)
    && (ref.scope === 'plain' || ref.scope?.startsWith('owner:'))) return null;
  if (ref.kind === 'field' && ref.scope === 'plain' && !declared.field.has(ref.key) && declared.prop.has(ref.key)) return null;
  if (ref.kind === 'field' && ref.path === ref.key && declared.table.has(ref.key.split('.')[0]!)) return null;
  if (ref.kind === 'field' && ref.scope === 'plain' && ref.from.tab === 'effects' && !declared.field.has(ref.key)) {
    return `«${ref.key}» — нет ни поля листа, ни входа эффекта с таким именем: заведите поле на вкладке «Лист» или вход у эффекта`;
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

function refProblems(refs: Reference[], declared: Declared, earlierByWhere: (ref: Reference) => boolean, system?: System): Problem[] {
  const out: Problem[] = [];
  for (const ref of refs) {
    if (ref.kind === 'step' && earlierByWhere(ref)) continue;
    const text = danglingText(ref, declared) ?? (system ? ownerText(ref, system) : null);
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
  const inChain = hearsEvent(effect) || calledOf(system).some(([key, other]) =>
    other === effect || system.effects[key] === effect || (!!effect.label && other.label === effect.label));
  const [structural] = stepProblems([step], () => where, new Set(), inChain);
  if (structural) return structural;
  const declared = declaredOf(system);
  const params = new Set(paramsOf(system, effect).map(p => p.key));
  const known = new Set(earlier.map(e => e.id));
  const refs = withAddresses(system, chainRefs([step], () => where, params, inChain))
    .filter(ref => !(ref.kind === 'step' && known.has(ref.key)))
    .filter(ref => !(ref.kind === 'field' && known.has(ref.key)));
  const [first] = refProblems(refs, declared, () => false, system);
  return first ?? null;
}

function cycleProblems(system: System): Problem[] {
  const edges = new Map<string, Set<string>>();
  const labels = new Map<string, string>();
  const link = (a: string, b: string) => { (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b); };
  const effectNode = (id: string): string => { labels.set(`effect:${id}`, system.effects[id]?.label ?? id); return `effect:${id}`; };


  const emitsOf = (steps: Step[] | undefined): string[] => emittedBy(steps);

  for (const [id, effect] of Object.entries(system.effects)) {
    for (const called of chainsOfEffect(effect).flatMap(emitsOf)) link(effectNode(id), effectNode(called));
    for (const handler of effect.on ?? []) {
      for (const called of emitsOf(handler.steps)) link(effectNode(id), effectNode(called));
      if (handler.confirm) continue;
      const heard = listenerOf(handler);
      if (heard.kind === 'event') link(effectNode(heard.key!), effectNode(id));
      if (heard.kind === 'effect') link(effectNode(heard.key!), effectNode(id));
    }
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
          const where: Where = { tab: 'effects', effect: first.slice('effect:'.length), part: 'on' };
          out.push({ where, level: 'error', text: `вызовы идут по кругу: ${cycle.map(n => `«${labels.get(n) ?? n}»`).join(' → ')}` });
        }
      } else if (mark !== 'done') visit(next);
    }
    stack.pop(); state.set(node, 'done');
  };
  for (const node of [...edges.keys()]) if (!state.has(node)) visit(node);
  return out;
}

const MOMENT_KEYS = new Set(Object.keys(MOMENTS));

function listenerProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const [id, effect] of Object.entries(system.effects)) {
    (effect.on ?? []).forEach((handler, index) => {
      const where: Where = { tab: 'effects', effect: id, part: 'on', handler: index };
      const heard = listenerOf(handler);
      if (heard.kind === 'empty') {
        out.push({ where, level: 'error', text: 'не сказано, когда срабатывает — выберите, что случилось' });
      }
      if (heard.kind === 'unknown') {
        out.push({ where, level: 'error', text: `такого «когда» нет: «${heard.key}»` });
      }
      if (handler.of && !isActionMoment(handler.on)) {
        out.push({ where, level: 'error', text: 'какое действие слушать, выбирают только у моментов действия' });
      }
      if (isActionMoment(handler.on)) {
        const moment = ACTION_MOMENTS[handler.on];
        if (moment.asks === 'never' && handler.confirm) {
          out.push({ where, level: 'error', text: `«${moment.label}» срабатывает молча — спросить здесь нельзя` });
        }
        if (!moment.replies && handler.to === 'other') {
          out.push({ where, level: 'error', text: `«${moment.label}» — ответить другому нельзя, только себе` });
        }
      }
      if (heard.kind === 'moment' && !MOMENT_KEYS.has(heard.key!)) {
        out.push({ where, level: 'error', text: `такого момента нет: «${heard.key}» — стол знает ${[...MOMENT_KEYS].join(', ')}` });
      }
      if ((heard.kind === 'gained' || heard.kind === 'lost') && system.effects[heard.key!]
        && (system.effects[heard.key!]!.activation ?? 'manual') === 'manual') {
        out.push({ where, level: 'error', text: 'слушать, что появилось или ушло, можно только эффект, который висит' });
      }
    });
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

function tableFieldProblems(system: System): Problem[] {
  return fieldProblems(system).map(problem => ({
    where: { tab: 'rules' as const, section: 'tables', key: problem.table }, level: 'error' as const, text: problem.message,
  }));
}

function fieldNameProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  for (const field of fieldsOf(system)) {
    const where = { tab: 'sheet' as const, field: field.tag };
    if (seen.has(field.tag)) out.push({ where, level: 'error', text: `имя «${field.tag}» занято дважды — у колонок листа оно одно на всю систему` });
    seen.add(field.tag);
    if (!field.cell && system.tables?.[field.tag] && !isBook(system.tables[field.tag])) {
      out.push({ where, level: 'error', text: `имя «${field.tag}» носит и колонка листа, и таблица «${system.tables[field.tag]!.label || field.tag}»` });
    }
  }
  return out;
}

function rowNameProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    if (!onSheet(table) || isSingle(table)) continue;
    const seen = new Set<string>();
    for (const row of table.rows ?? []) {
      const key = rowKeyOf(row);
      if (seen.has(key)) {
        out.push({ where: { tab: 'rules', section: 'tables', key: id }, level: 'error', text: `таблица «${table.label || id}»: строки зовутся одинаково — «${key}»; у клетки на листе имя одно` });
      }
      seen.add(key);
    }
  }
  return out;
}

function fieldRollProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const field of fieldsOf(system)) {
    if (!field.roll) continue;
    const where = { tab: 'sheet' as const, field: field.tag };
    const die = field.roll.die?.constant;
    if (!die) { out.push({ where, level: 'error', text: `по полю «${field.label}» бросают, но кость не выбрана` }); continue; }
    const constant = system.constants?.[die];
    if (field.roll.count && constant?.kind === 'die' && (constant.dice ?? []).length !== 1) {
      out.push({ where, level: 'error', text: `поле «${field.label}» задаёт число костей, а кость «${constant.label ?? die}» составная` });
    }
  }
  return out;
}

function seenProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const seenOnly = (step: Step) => registry.get(step.type)?.seen === true;
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    const lanes: [Step[] | undefined, (step: number) => Where, boolean][] = [
      [effect.steps, step => ({ tab: 'effects', effect: id, step }), false],
      [effect.cost, step => ({ tab: 'effects', effect: id, step, part: 'cost' }), false],
      [effect.attach, step => ({ tab: 'effects', effect: id, step, part: 'attach' }), false],
      [effect.detach, step => ({ tab: 'effects', effect: id, step, part: 'detach' }), false],
      ...(effect.on ?? []).flatMap((handler, index): [Step[] | undefined, (step: number) => Where, boolean][] => [
        [handler.steps, step => ({ tab: 'effects', effect: id, handler: index, step }), handler.on === 'seen'],
        [handler.cost, step => ({ tab: 'effects', effect: id, handler: index, step, part: 'cost' }), false],
      ]),
    ];
    for (const [steps, where, allowed] of lanes) {
      (steps ?? []).forEach((step, index) => {
        if (seenOnly(step) && !allowed) out.push({ where: where(index), level: 'error', text: `«${registry.get(step.type)?.label}» работает только в подписке «${ACTION_MOMENTS.seen.label}»` });
      });
    }
  }
  return out;
}

function costProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const pays = (step: Step): boolean => {
    const s = step as { type?: string; direction?: string };
    return s.type === 'emit' || s.type === 'compare' || (s.type === 'apply' && s.direction === 'subtract');
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    const chains: [Step[] | undefined, (step: number) => Where][] = [
      [effect.cost, step => ({ tab: 'effects', effect: id, step, part: 'cost' })],
      ...(effect.on ?? []).map((handler, index): [Step[] | undefined, (step: number) => Where] =>
        [handler.cost, step => ({ tab: 'effects', effect: id, handler: index, step, part: 'cost' })]),
    ];
    for (const [steps, where] of chains) {
      (steps ?? []).forEach((step, index) => {
        if (!pays(step)) out.push({ where: where(index), level: 'warn', text: `в цене «${effect.label || id}» — не плата, а действие: место ему в ${STEP.manyPrep}` });
      });
    }
  }
  return out;
}

function editProblems(system: System, compendium?: Compendium): Problem[] {
  const out: Problem[] = [];
  if (system.effects?.[ROLL_CALL]) {
    out.push({ where: { tab: 'effects', effect: ROLL_CALL }, level: 'error', text: `id «${ROLL_CALL}» занят встроенным вызовом «${CALL_WORDS.roll.label}» — переименуйте эффект` });
  }
  const lists = [
    ...modifierLists(system),
    ...recordsOf(compendium).map(record => ({ where: { tab: 'book' as const, record: record.id }, modifiers: (record.modifiers ?? []) as unknown as Record<string, unknown>[] })),
  ];
  for (const { where, modifiers } of lists) {
    for (const mod of modifiers) {
      if (mod.kind !== 'edit') continue;
      const call = String(mod.call);
      const at = { ...where, part: 'modifiers' };
      if (call === ROLL_CALL) {
        if (!(String(mod.param) in CALL_WORDS.roll.params)) out.push({ where: at, level: 'error', text: `у броска нет параметра «${String(mod.param)}»` });
        else if (mod.param === 'edits' && !mod.edit) out.push({ where: at, level: 'error', text: 'правка броска не выбрана' });
        else if (mod.param === 'bonus' && !(mod.value as { expr?: string } | undefined)?.expr?.trim()) out.push({ where: at, level: 'error', text: 'у прибавки к броску не задано, на сколько' });
        continue;
      }
      const effect = system.effects?.[call];
      if (!effect) {
        out.push({ where: at, level: 'error', text: `правка вызывает «${call}», а такого эффекта нет` });
        continue;
      }
      if (mod.as) out.push({ where: { ...where, part: 'modifiers' }, level: 'error', text: `«${CALL_WORDS.against}» бывает только у броска, а правка вызывает «${effect.label || call}»` });
      const param = (effect.params ?? []).find(p => p.key === mod.param);
      if (!param) out.push({ where: { ...where, part: 'modifiers' }, level: 'error', text: `у «${effect.label || call}» нет входа «${String(mod.param)}» — править нечего` });
      else if (param.role !== 'amount') out.push({ where: { ...where, part: 'modifiers' }, level: 'error', text: `правка «${effect.label || call}» правит пока только величину, а «${param.label || param.key}» — не она` });
    }
  }
  return out;
}

function sheetKindProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const known = new Set(blockNames(system));
  for (const [key, kind] of Object.entries(system.sheets ?? {})) {
    for (const block of kind.blocks ?? []) {
      if (!known.has(block)) {
        out.push({ where: { tab: 'records', kind: key }, level: 'warn', text: `тип листа «${kind.label || key}» показывает блок «${block}», которого на листе нет` });
      }
    }
  }
  return out;
}

function orphanProblems(system: System, compendium?: Compendium): Problem[] {
  const out: Problem[] = [];
  const emitted = new Set<string>();
  const heardEvents = new Set<string>();
  for (const effect of Object.values(system.effects)) {
    for (const event of chainsOfEffect(effect).flatMap(emittedBy)) emitted.add(event);
    for (const handler of effect.on ?? []) {
      for (const event of emittedBy(handler.steps)) emitted.add(event);
      const heard = listenerOf(handler);
      if (heard.kind === 'event') heardEvents.add(heard.key!);
    }
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
  for (const [, kind] of kindsOf(system)) {
    for (const b of kind.bindings ?? []) bound.add(b.effect);
    for (const id of kind.grants ?? []) bound.add(id);
  }
  for (const id of system.grants ?? []) bound.add(id);
  for (const effect of Object.values(system.effects)) for (const id of effect.grants ?? []) bound.add(id);
  for (const record of recordsOf(compendium)) {
    for (const binding of record.bindings ?? []) bound.add(binding.effect);
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
  const fields = new Set(fieldsOf(system).map(f => f.tag));
  for (const [id, effect] of Object.entries(system.effects)) {
    for (const param of effect.params ?? []) {
      if (!fields.has(param.key)) continue;
      out.push({
        where: { tab: 'effects', effect: id }, level: 'error',
        text: `вход «${param.label ?? param.key}» назван как поле «${param.key}» — в формулах шага победит поле; переименуйте вход`,
      });
    }
  }
  for (const [id, effect] of Object.entries(system.effects)) {
    for (const { steps, where: whereOf } of chainsOf(id, effect, false)) {
      steps.forEach((step, index) => {
        const raw = step as unknown as Record<string, unknown>;
        if (step.type !== 'emit' || !raw.event) return;
        const called = system.effects[String(raw.event)];
        if (!called) return;
        const args = (raw.args ?? {}) as Record<string, unknown>;
        for (const param of called.params ?? []) {
          if (args[param.key] !== undefined || param.optional || param.ask) continue;
          out.push({
            where: whereOf(index),
            level: 'error',
            text: `вызов «${called.label ?? raw.event}» не заполняет его вход «${param.label ?? param.key}»`,
          });
        }
      });
    }
  }
  const kindBases = new Set(recordKinds(system)
    .map(([, kind]) => basedOn(kind)).filter((key): key is string => Boolean(key)));
  for (const [kind, spec] of recordKinds(system)) {
    if (kindBases.has(kind)) continue;
    const props = propKeysOf(spec);
    (spec.bindings ?? []).forEach((binding, index) => {
      const effect = system.effects[binding.effect];
      if (!effect) return;
      const args = argsWithProps(system, binding, props) ?? {};
      for (const param of effect.params ?? []) {
        if (args[param.key] !== undefined) continue;
        if (param.ask) continue;
        out.push({
          where: { tab: 'records', kind, part: 'bindings', binding: index }, level: 'error',
          text: `кнопка «${binding.label ?? effect.label ?? binding.effect}» не заполняет вход «${param.label ?? param.key}» эффекта «${effect.label ?? binding.effect}»`,
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
    for (const chain of chainsOf(id, effect, called.has(id))) {
      out.push(...stepProblems(chain.steps, chain.where, params, chain.eventChain));
      const splits = chain.steps.flatMap((step, index) => (registry.get(step.type)?.splits ? [index] : []));
      for (const index of splits.slice(1)) {
        out.push({ where: chain.where(index), level: 'error', text: `«${STEP_WORDS.each.label}» в цепочке может быть только один` });
      }
      chain.steps.forEach((step, index) => {
        if (step.id && declared.field.has(String(step.id))) {
          out.push({
            where: chain.where(index), level: 'warn',
            text: `${STEP.one} «${step.id}» назван как поле листа — в формулах @${step.id} прочтёт поле, а не результат ${STEP.gen}`,
          });
        }
      });
    }
  }

  const chainOf = (where: Where): Step[] | undefined => stepsAt(system, where);
  const refs = referencesOf(system, compendium).filter(ref => {
    if (ref.scope === 'condition') return false;
    if (ref.kind !== 'field' || ref.from.step === undefined) return true;
    const steps = chainOf(ref.from);
    return !(steps && earlierIds(steps, ref.from.step).has(ref.key));
  });
  out.push(...refProblems(refs, declared, ref => {
    const steps = chainOf(ref.from);
    return Boolean(steps && ref.from.step !== undefined && earlierIds(steps, ref.from.step).has(ref.key));
  }, system));

  out.push(...listenerProblems(system));
  out.push(...cycleProblems(system));
  out.push(...paramProblems(system));
  out.push(...orphanProblems(system, compendium));
  out.push(...sheetKindProblems(system));
  out.push(...editProblems(system, compendium));
  out.push(...costProblems(system));
  out.push(...seenProblems(system));
  out.push(...fieldRollProblems(system));
  out.push(...fieldNameProblems(system));
  out.push(...rowNameProblems(system));
  out.push(...tableFieldProblems(system));
  out.push(...danglingRows(system, compendium).map(d => ({ where: d.where, level: 'error' as const, text: d.text })));
  return out;
}

export function lintCompendium(system: System, compendium: Compendium): Problem[] {
  return lintSystem(system, compendium).filter(p => p.where.tab === 'book');
}

export const errorsOf = (problems: Problem[]): Problem[] => problems.filter(p => p.level === 'error');

const SECTION_WORDS: Record<string, string> = {
  grants: 'действуют на всех', initiative: 'инициатива', roll_edits: 'правки броска',
  tables: 'таблицы', constants: 'кости', groups: 'блоки',
};

const quoted = (label: string | undefined, key: string): string => `«${label || key}»`;

export function describeWhere(where: Where, system: System, compendium?: Compendium): string {
  const parts: string[] = [];
  if (where.tab === 'sheet') {
    parts.push(TABS.sheet);
    if (where.field) parts.push(`поле ${quoted(fieldOf(system, where.field)?.label, where.field)}`);
  } else if (where.tab === 'effects') {
    parts.push(TABS.effects);
    if (where.effect) parts.push(`эффект ${quoted(system.effects[where.effect]?.label, where.effect)}`);
    if (where.step !== undefined) parts.push(`${STEP.one} ${where.step + 1}`);
    if (where.handler !== undefined) parts.push(`«когда» №${where.handler + 1}`);
    if (where.part === 'on') parts.push('когда срабатывает');
    if (where.part === 'attach') parts.push('при наложении');
    if (where.part === 'detach') parts.push('при спадании');
    if (where.part === 'modifiers') parts.push('модификаторы');
    if (where.part === 'cost') parts.push('чего стоит');
    if (where.part === 'params') parts.push(`что приходит ${quoted(system.effects[where.effect ?? '']?.params?.find(p => p.key === where.key)?.label, where.key ?? '')}`);
  } else if (where.tab === 'rules') {
    parts.push(TABS.rules);
    if (where.section) parts.push(SECTION_WORDS[where.section] ?? where.section);
    if (where.step !== undefined) parts.push(`${STEP.one} ${where.step + 1}`);
  } else if (where.tab === 'records') {
    parts.push(TABS.records);
    if (where.kind) parts.push(quoted(kindOf(system, where.kind)?.label, where.kind));
    if (where.binding !== undefined) parts.push(`кнопка ${where.binding + 1}`);
    else if (where.part === 'modifiers') parts.push('модификаторы');
    else if (where.part === 'props') parts.push(`свойство ${quoted(kindOf(system, where.kind)?.columns?.find(p => p.key === where.key)?.label, where.key ?? '')}`);
  } else if (where.tab === 'book') {
    parts.push('Компендиум');
    if (where.record) {
      const found = [...recordsOf(compendium), ...system.library ?? []].find(r => r.id === where.record);
      parts.push(`запись ${quoted(found?.label, where.record)}`);
    }
  }
  return parts.join(' · ');
}
