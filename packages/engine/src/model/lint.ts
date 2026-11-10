import { paramStages, targetStages } from '../engine/stages.ts';
import { armsOf, balance, flowOf, inBlock, isFlow } from './flow.ts';
import { loopOf, loopParam } from '../engine/steps/each.ts';
import { chosenEffect, choicesOfInput, emittedChoices } from './payments.ts';
import { SEEN_LABEL, ROLLED, ROLLED_LABEL, ANY_ACTION, PHASES } from '../events/bus.ts';
import { HEARD_WORDS } from '../events/lifecycle.ts';
import type { System, Compendium, Effect, Step, Stage, Guard, Param, Table, Modifier } from './types.ts';
import { registry, loopsAt, splitsTargets } from '../engine/steps/index.ts';
import { isBlank } from './blank.ts';
import { STEP_WORDS, slotShown, type SlotGate } from '../words/steps.ts';
import { ROLL_CALL, CALL_WORDS } from '../words/calls.ts';
import { modifierLists } from './integrity.ts';
import { calledOf, chainsOfEffect } from '../engine/effects.ts';
import { basedOn, paramsOf, flattenSystem } from './inherit.ts';
import { danglingRows } from './integrity.ts';
import { recordsOf, argsWithProps, propKeysOf, recordKinds, kindsOf, kindOf, isBook } from './owned.ts';
import { sheetBlockNames } from './blocks.ts';
import { columnFamily, viewsFor, viewNeeds, VIEW_LABELS } from './views.ts';
import { bindingsOf } from '../events/actions.ts';
import { kindOfRecord } from './owned.ts';
import { tableOf } from './buttons.ts';
import { MOMENTS } from '../events/moments.ts';
import { TABS, STEP, SHEET, SHEET_LISTS } from '../words/glossary.ts';
import {
  referencesOf, declaredOf, chainRefs, listenerOf, withAddresses, heardNames, callNamesOf, formulaDeps, sourcesOf,
  type Where, type Reference, type RefKind, type Declared, type Listener,
  LISTEN, contractsOf, HOLDER, DESK_NAME, holderNameOf, tiedToHolder,
} from './references.ts';
import { fieldsOf, fieldOf, fieldProblems, onSheet, isSingle, holderOf, rowKeyOf, hasField, rollEntryOf, ROW } from './sheet-columns.ts';
import { isRange, rowByKey } from './tables.ts';
import { walkSheet } from './paths.ts';
import { variantProblems, cellScopeProblems } from './variants.ts';
import { editStages, PLUS_OP } from '../core/dice.ts';
import { compile } from '../formula/index.ts';
import { ROLLED_NAME, NUMBER_NAME } from '../engine/check.ts';
import type { Node } from '../formula/index.ts';

export type Level = 'error' | 'warn';

export interface Fix { kind: 'field'; tag: string }

export interface Problem {
  where: Where;
  level: Level;
  text: string;
  fix?: Fix;
}

const NAMES: Record<Exclude<RefKind, 'param' | 'step' | 'syntax'>, (key: string) => string> = {
  field: key => `поля «${key}» в системе нет — заведите его на вкладке «${TABS.sheet}»`,
  effect: key => `эффекта «${key}» в системе нет`,
  constant: key => `кости «${key}» в системе нет`,
  table: key => `таблицы «${key}» в системе нет`,
  rollEdit: key => `правки броска «${key}» в системе нет`,
  event: key => `общего эффекта «${key}» в системе нет`,
  roll: key => `метки броска «${key}» нет ни в одной таблице — заведите строку «${key}», например в таблице «Броски»`,
  tag: key => `метки «${key}» нет ни в одной таблице и ни у одного эффекта — правка по ней не сработает никогда`,
  prop: key => `свойство «${key}» не объявлено ни одним типом записей — заведите его на вкладке «${TABS.records}»`,
  recordKind: key => `типа записи «${key}» в системе нет`,
};

const sameWhere = (a: Where, b: Where): boolean => JSON.stringify(a) === JSON.stringify(b);

interface Chain { steps: Step[]; where: (step: number) => Where; part?: 'cost' }

function chainsOf(id: string, effect: Effect): Chain[] {
  const out: Chain[] = [
    { steps: effect.steps ?? [], where: step => ({ tab: 'effects', effect: id, step }) },
    { steps: effect.cost ?? [], where: step => ({ tab: 'effects', effect: id, step, part: 'cost' }), part: 'cost' },
  ];
  (effect.on ?? []).forEach((handler, index) => {
    out.push({ steps: handler.steps ?? [], where: step => ({ tab: 'effects', effect: id, handler: index, step }) });
    out.push({ steps: handler.cost ?? [], where: step => ({ tab: 'effects', effect: id, handler: index, step, part: 'cost' }), part: 'cost' });
  });
  for (const turn of ['attach', 'detach'] as const) {
    out.push({ steps: effect[turn] ?? [], where: step => ({ tab: 'effects', effect: id, step, part: turn }) });
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
  if (ref.kind !== 'field') return null;
  const field = fieldOf(system, ref.key);
  if (ref.scope === 'plain' && field?.lives === 'desk') return `поле «${field.label}» лежит на столе — пишите @стол.${field.tag}`;
  if (ref.scope === 'bare') {
    if (field?.lives === 'desk') return `поле «${field.label}» лежит на столе — пишите @стол.${field.tag}`;
    return field ? `«${field.tag}» — чьё поле? Пишите через лист: @носитель.${field.tag}, @цель.${field.tag} или другой вход-лист` : null;
  }
  if (!field) return null;
  if (ref.scope === 'desk' && field.lives !== 'desk') return `поле «${field.label}» лежит на листе, а не на столе — пишите через вход-лист`;
  if (ref.scope === 'sheet' && field.lives === 'desk') return `поле «${field.label}» лежит на столе — пишите @стол.${field.tag}`;
  return null;
}

const HOLDER_ONLY = `«${HOLDER}» есть только у того, что висит на листе: подписка, правка, наложение. В кнопке лист приходит входом — например, «Кто действует»`;

function danglingText(ref: Reference, declared: Declared): string | null {
  if (ref.scope === LISTEN) return null;
  if (ref.key === HOLDER && (ref.kind === 'step' || (ref.kind === 'field' && ref.scope === 'bare'))) return HOLDER_ONLY;
  if (ref.kind === 'syntax' && ref.path === 'function') return `в формуле «${ref.key}» нет функции «${ref.scope}»`;
  if (ref.kind === 'syntax' && ref.path === 'dice') return `в формуле «${ref.key}» кость стоит как число — кость кидают так: кинуть(к4)`;
  if (ref.kind === 'syntax') return `формула «${ref.key}» не разбирается — проверьте скобки и знаки`;
  if (ref.kind === 'field' && ref.scope === 'bare' && !declared.field.has(ref.key) && declared.effect.has(ref.key)) {
    return `«${ref.key}» — сколько раз висит эффект на листе: пишите через лист, например @носитель.${ref.key}`;
  }
  if (ref.kind === 'param') {
    return ref.scope === 'missing' ? `вход «${ref.key}» эффектом не объявлен` : null;
  }
  if (ref.kind === 'step') {
    if (ref.scope?.startsWith('listened:')) {
      return `в эффекте «${ref.scope.slice('listened:'.length)}» нет ${STEP.gen} «${ref.key}» — условию срабатывания не на что смотреть`;
    }
    if (ref.scope === 'dotted' && (declared.field.has(ref.key) || declared.prop.has(ref.key))) return null;
    return `${STEP.gen} «${ref.key}» выше по цепочке нет — на его результат не сослаться`;
  }
  if (ref.kind === 'prop' && ref.scope === 'item') {
    return declared.prop.has(ref.key) ? null : `у вещей нет свойства «${ref.key}» — @вещь.${ref.key} прочитать неоткуда`;
  }
  if (ref.kind === 'prop' && ref.scope === 'foreign') {
    return `свойство «${ref.key}» не объявлено у этого типа записи — привязка возьмёт его не оттуда`;
  }
  if (ref.kind === 'field' && !declared.field.has(ref.key) && declared.effect.has(ref.key)
    && (ref.scope === 'plain' || ref.scope === 'bare' || ref.scope === 'sheet')) return null;
  if (ref.kind === 'field' && ref.scope === 'plain' && !declared.field.has(ref.key) && declared.prop.has(ref.key)) return null;
  if (ref.kind === 'field' && ref.path === ref.key && declared.table.has(ref.key.split('.')[0]!)) return null;
  if (ref.kind === 'field' && ref.scope === 'bare' && !declared.field.has(ref.key) && declared.prop.has(ref.key)) return null;
  if (ref.kind === 'field' && ref.scope === 'bare' && !declared.field.has(ref.key) && declared.constant.has(ref.key)) return null;
  if (ref.kind === 'field' && ref.scope === 'bare' && !declared.field.has(ref.key)) {
    return `«${ref.key}» — нет ни входа, ни шага с таким именем`;
  }
  if (ref.kind === 'table' && ref.scope === 'cell') {
    return !declared.table.has(ref.key) || declared.column.has(`${ref.key}.${ref.path}`) ? null
      : `в таблице «${declared.tableLabel.get(ref.key) ?? ref.key}» нет колонки «${ref.path}»`;
  }
  if (ref.kind === 'table' && ref.scope === 'column') {
    return !declared.table.has(ref.key) || declared.column.has(`${ref.key}.${ref.path}`) ? null
      : `в таблице «${declared.tableLabel.get(ref.key) ?? ref.key}» нет колонки «${ref.path}» — «из таблицы» вернёт пусто`;
  }
  return declared[ref.kind].has(ref.key) ? null : NAMES[ref.kind](ref.key);
}

function stepProblems(steps: Step[], whereOf: (index: number) => Where): Problem[] {
  const out: Problem[] = [];
  const earlier = new Set<string>();
  steps.forEach((step, index) => {
    const where = whereOf(index);
    const mod = registry.get(step.type);
    if (!mod) {
      out.push({ where, level: 'error', text: `движок не знает типа ${STEP.gen} «${step.type}»` });
      return;
    }
    const slots = (mod.slots ?? []) as { key: string; label: string; kind?: string; required?: boolean; refersTo?: string; options?: readonly unknown[]; onlyIf?: SlotGate }[];
    const valueOf = (key: string): unknown => key.split('.').reduce<unknown>((node, part) =>
      (node == null || typeof node !== 'object' ? undefined : (node as Record<string, unknown>)[part]), step);
    const unknownChoice = new Set(slots
      .filter(slot => slot.kind === 'choice' && slot.options && valueOf(slot.key) !== null && valueOf(slot.key) !== undefined && !slot.options.includes(valueOf(slot.key)))
      .map(slot => slot.key));
    for (const slot of slots) {
      const value = valueOf(slot.key);
      if (slot.onlyIf && unknownChoice.has(slot.onlyIf.key)) continue;
      if (!slotShown(slot, step as unknown as Record<string, unknown>, slots as unknown as Record<string, unknown>[])) {
        if (value !== null && value !== undefined) out.push({ where, level: 'error', text: `«${slot.label}» здесь не действует — уберите` });
        continue;
      }
      if (unknownChoice.has(slot.key)) {
        out.push({ where, level: 'error', text: `${slot.label.toLowerCase()}: нет варианта «${String(value)}»` });
      }
      if (slot.required && (value === null || value === undefined)) {
        out.push({ where, level: 'error', text: `не заполнено: ${slot.label.toLowerCase()}` });
        break;
      }
      if (slot.kind === 'ref' && typeof value === 'string' && !(slot as { refersTo?: string }).refersTo) {
        out.push({ where, level: 'error', text: `${slot.label.toLowerCase()}: голый текст «${value}» — нужна формула, текст в кавычках` });
      }
      if (slot.kind === 'ref' && value && typeof value === 'object' && !Array.isArray(value) && !('expr' in value)) {
        out.push({ where, level: 'error', text: `${slot.label.toLowerCase()}: ссылка старой формы ${JSON.stringify(value)} — нужно имя или формула` });
      }
    }
    const own = mod.problems?.(step as never);
    if (own) out.push({ where, level: 'error', text: own });
    const thrower = mod.thrownBy?.(step as never);
    const formula = (step as { fixed?: unknown }).fixed;
    if (thrower !== undefined && thrower !== null && formula !== undefined && formula !== null && ((step as { die?: unknown }).die === undefined || (step as { die?: unknown }).die === null)) {
      out.push({ where, level: 'error', text: 'у сложной формулы кости ничьи — оставьте кинуть(кость, сколько) + прибавка или уберите бросающего' });
    }
    if (step.id) earlier.add(String(step.id));
  });
  return out;
}

function strayRow(system: System, param: Param, arg: unknown): { value: string; table: string } | null {
  if (param.kind !== 'choice' || !param.from || !arg || typeof arg !== 'object' || !('expr' in arg)) return null;
  const table = system.tables?.[param.from];
  if (!table || isRange(table) || table.otherwise !== undefined || table.shape === 'single' || table.shape === 'book' || !(table.rows ?? []).length) return null;
  let node: Node;
  try { node = compile(String((arg as { expr: unknown }).expr ?? '')).ast; } catch { return null; }
  if (node.kind !== 'Text' || node.dice || rowByKey(table, node.value)) return null;
  return { value: node.value, table: table.label || param.from };
}

function pathText(ref: Reference, declared: Declared, system: System): string | null {
  if (ref.scope === LISTEN || !ref.path) return null;
  const path = ref.kind === 'field' ? ref.path
    : ref.kind === 'step' && ref.scope === 'dotted' && declared.field.has(ref.key) ? ref.path
      : null;
  const walked = path ? walkSheet(system, path) : null;
  return walked && !walked.ok ? walked.text : null;
}

function rowsText(ref: Reference, declared: Declared): string | null {
  if (ref.kind !== 'field' || !ref.near?.length || declared.field.has(ref.key) || declared.table.has(ref.key) || declared.effect.has(ref.key)) return null;
  return `у листа нет поля «${ref.key}»; здесь есть ${ref.near.map(name => `«${name}»`).join(', ')} — строка таблицы, её колонки пишутся через точку`;
}

function refProblems(refs: Reference[], declared: Declared, earlierByWhere: (ref: Reference) => boolean, system?: System): Problem[] {
  const out: Problem[] = [];
  for (const ref of refs) {
    if (ref.kind === 'step' && earlierByWhere(ref)) continue;
    const walked = rowsText(ref, declared) ?? (system ? pathText(ref, declared, system) : null);
    const text = walked ?? danglingText(ref, declared) ?? (system ? ownerText(ref, system) : null);
    if (!text) continue;
    if (out.some(p => sameWhere(p.where, ref.from) && p.text === text)) continue;
    out.push({
      where: ref.from, level: 'error', text,
      ...(ref.kind === 'field' && !walked ? { fix: { kind: 'field', tag: ref.key } } : {}),
    });
  }
  return out;
}

const earlierIds = (steps: Step[], index: number): Set<string> =>
  new Set(steps.slice(0, index).map(s => s.id).filter((id): id is string => Boolean(id)));

export interface EarlierStep { id: string; type: string; table?: string }

export function lintStep(step: Step, system: System, effect: Effect, earlier: EarlierStep[], visible: readonly { name: string; kind: string }[] = []): Problem | null {
  const where: Where = { tab: 'effects', effect: effect.label ?? '', step: 0 };
  const [structural] = stepProblems([step], () => where);
  if (structural) return structural;
  const declared = declaredOf(system);
  const all = paramsOf(system, effect);
  const rows = earlier.filter(e => loopsAt(e) && e.table).map(e => e.id);
  const params = new Set([...all.filter(p => p.kind !== 'sheet').map(p => p.key), ...rows, ...visible.filter(one => one.kind !== 'sheet').map(one => one.name)]);
  const sheets = [...all.filter(p => p.kind === 'sheet').map(p => p.key), 'носитель', ...earlier.filter(e => loopsAt(e) && !e.table).map(e => e.id), ...visible.filter(one => one.kind === 'sheet').map(one => one.name)];
  const known = new Set([...earlier.map(e => e.id), ...visible.filter(one => one.kind !== 'sheet').map(one => one.name)]);
  const refs = withAddresses(system, chainRefs([step], () => where, params, sheets, [], [], system))
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


  for (const [id, effect] of Object.entries(system.effects)) {
    const emitsOf = (steps: Step[] | undefined): string[] => emittedBy(steps, inputsOf(system, id));
    for (const called of chainsOfEffect(effect).flatMap(steps => emitsOf(steps))) link(effectNode(id), effectNode(called));
    for (const handler of effect.on ?? []) {
      for (const called of emitsOf(handler.steps)) link(effectNode(id), effectNode(called));
      if (handler.confirm || handler.if) continue;
      const heard = listenerOf(handler);
      if (heard.kind === 'call' && system.effects[heard.key]) link(effectNode(heard.key), effectNode(id));
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
        out.push({ where, level: 'error', text: 'не сказано, на что срабатывает — выберите, что случилось' });
      }
      if (heard.kind === 'unknown') {
        out.push({ where, level: 'error', text: `такого «что случилось» нет: «${heard.key}»` });
      }
      if (heard.kind === 'call' && heard.key !== ANY_ACTION && !system.effects[heard.key] && !system.tags?.[heard.key]) {
        out.push({ where, level: 'warn', text: `подписка ждёт «${heard.key} — ${PHASES[heard.phase].label}», а такого эффекта или метки в системе нет — не сработает` });
      }
      if (heard.kind === 'moment' && !MOMENT_KEYS.has(heard.key)) {
        out.push({ where, level: 'error', text: `такого момента нет: «${heard.key}» — стол знает ${[...MOMENT_KEYS].join(', ')}` });
      }
      if ((heard.kind === 'gained' || heard.kind === 'lost') && system.effects[heard.key]
        && (system.effects[heard.key]!.activation ?? 'manual') === 'manual') {
        out.push({ where, level: 'error', text: 'слушать, что появилось или ушло, можно только эффект, который висит' });
      }
    });
  }
  return out;
}

function emittedBy(steps: Step[] | undefined, choices: (name: string) => string[] = () => []): string[] {
  const out: string[] = [];
  for (const step of steps ?? []) {
    const slots = (registry.get(step.type)?.slots ?? []) as { key: string; kind?: string }[];
    for (const slot of slots) {
      if (slot.kind !== 'event') continue;
      const value = (step as Record<string, unknown>)[slot.key];
      if (typeof value === 'string' && value) { out.push(value); continue; }
      const literal = chosenEffect(value);
      if (literal) { out.push(literal); continue; }
      const lone = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((value as { expr?: unknown } | null)?.expr ?? ''));
      if (lone) out.push(...choices(lone[1]!));
    }
  }
  return out;
}

const inputsOf = (system: System, id: string) => (name: string): string[] => choicesOfInput(system, id, name);

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

function labelTwinProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const groups = new Map<string, { table: string; key: string; label: string }[]>();
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    const group = isSingle(table) ? `single:${holderOf(table)}` : `table:${id}`;
    const list = groups.get(group) ?? [];
    for (const column of table.columns ?? []) list.push({ table: id, key: column.key, label: (column.label || column.key).trim() });
    groups.set(group, list);
  }
  for (const list of groups.values()) {
    const seen = new Map<string, { table: string; key: string; label: string }>();
    for (const column of list) {
      const name = column.label.toLowerCase();
      const first = seen.get(name);
      if (!first) { seen.set(name, column); continue; }
      const table = system.tables![column.table]!;
      const where = isSingle(table) && holderOf(table) === 'sheet'
        ? { tab: 'sheet' as const, field: column.key }
        : { tab: 'rules' as const, section: 'tables', key: column.table };
      const tables = first.table === column.table
        ? `в таблице «${table.label || column.table}»`
        : `в таблицах «${system.tables![first.table]!.label || first.table}» и «${table.label || column.table}»`;
      out.push({ where, level: 'warn', text: `${tables} два поля «${column.label}» — на листе и в формулах их не различить; переименуйте или удалите одно` });
    }
  }
  return out;
}

function viewProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const where = { tab: 'sheet' as const };
  for (const block of system.blocks ?? []) {
    for (const part of block.parts) {
      const table = system.tables?.[part.table];
      for (const [key, view] of Object.entries(part.views ?? {})) {
        const [first, second] = key.split('.');
        const columnKey = second ?? first!;
        const column = (table?.columns ?? []).find(c => c.key === columnKey);
        if (!column) { out.push({ where, level: 'warn', text: `блок «${block.name}»: вид задан колонке «${columnKey}», а её нет` }); continue; }
        const row = second ? (table?.rows ?? []).find(r => rowKeyOf(r) === first) : undefined;
        const who = `блок «${block.name}», «${column.label || column.key}»${row ? ` у строки «${row.label ?? String(row.value)}»` : ''}`;
        const family = columnFamily(column);
        const computed = column.expr !== undefined;
        if (family && !viewsFor(family, computed).includes(view.kind) && !(computed && !column.kind)) {
          out.push({ where, level: 'warn', text: `${who}: вид «${VIEW_LABELS[view.kind]}» не подходит к типу значения — на листе будет обычное поле` });
          continue;
        }
        const needs = viewNeeds(view.kind, column);
        if (needs.length) out.push({ where, level: 'warn', text: `${who}: виду «${VIEW_LABELS[view.kind]}» не хватает — ${needs.join(', ')}; на листе вместо него будет «—»` });
      }
    }
  }
  return out;
}

function fieldRollProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const taken = new Map<string, string>();
  for (const [key, constant] of Object.entries(system.constants ?? {})) {
    if (constant.kind !== 'die' || !(constant as { zero?: unknown }).zero) continue;
    if ((constant.dice ?? []).filter(term => !term.bonus && !term.name).length !== 1) out.push({ where: { tab: 'rules', section: 'rolls' }, level: 'error', text: `кость «${constant.label ?? key}»: «если костей ноль» — только у кости из одного вида` });
  }
  for (const [key, roll] of Object.entries(system.rolls ?? {})) {
    const name = roll.label || key;
    const die = system.constants?.[roll.die];
    if (die?.kind !== 'die') out.push({ where: { tab: 'rules', section: 'rolls' }, level: 'error', text: `бросок «${name}»: кости «${roll.die}» нет в «Костях»` });
    else if ((roll.number === 'count' || roll.number === 'sides') && (die.dice ?? []).length !== 1) out.push({ where: { tab: 'rules', section: 'rolls' }, level: 'error', text: `бросок «${name}»: число поля — ${roll.number === 'count' ? 'сколько костей' : 'грани кости'}, а кость «${die.label ?? roll.die}» составная` });
    const where = { tab: 'rules' as const, section: 'rolls' };
    const broken = (ref: unknown): string | null => {
      if (typeof ref !== 'object' || ref === null) return null;
      try { compile(String((ref as { expr: unknown }).expr ?? '')); return null; } catch (err) { return (err as Error).message; }
    };
    const keepBroken = broken(roll.keep);
    if (keepBroken) out.push({ where, level: 'error', text: `бросок «${name}»: «сколько оставить» — ${keepBroken}` });
    if ((roll.keep !== undefined || roll.fields.some(one => one.keep !== undefined)) && roll.number !== 'count') out.push({ where, level: 'error', text: `бросок «${name}»: оставить лучшие можно, только когда число поля — сколько костей` });
    for (const [at, degree] of (roll.degrees ?? []).entries()) {
      const bad = broken(degree.if);
      if (bad) out.push({ where, level: 'error', text: `бросок «${name}», степень «${degree.label || at + 1}»: ${bad}` });
    }
    if (roll.degrees?.length) {
      for (const taken of [ROLLED_NAME, NUMBER_NAME]) {
        if (fieldsOf(system).some(field => field.tag === taken)) out.push({ where, level: 'error', text: `бросок «${name}»: имя «${taken}» в степенях значит итог броска или число поля, а так зовётся и поле листа — переименуйте поле` });
      }
    }
    for (const entry of roll.fields) {
      const table = system.tables?.[entry.table];
      const column = (table?.columns ?? []).find(one => one.key === entry.column);
      if (!table || !column) { out.push({ where: { tab: 'rules', section: 'rolls' }, level: 'error', text: `бросок «${name}»: колонки «${entry.column}» в таблице «${table?.label || entry.table}» нет` }); continue; }
      const ownKeep = broken(entry.keep);
      if (ownKeep) out.push({ where, level: 'error', text: `бросок «${name}», «${column.label || column.key}»: «сколько оставить» — ${ownKeep}` });
      if (entry.threshold !== undefined && (roll.number === 'under' || roll.number === 'over')) out.push({ where: { tab: 'rules', section: 'rolls' }, level: 'error', text: `бросок «${name}»: у «${column.label || column.key}» свой порог, а порог броска — само число поля` });
      const at = `${entry.table}.${entry.column}`;
      const other = taken.get(at);
      if (other) out.push({ where: { tab: 'rules', section: 'rolls' }, level: 'error', text: `«${column.label || column.key}» бросают двумя бросками: «${other}» и «${name}» — оставьте один` });
      else taken.set(at, name);
    }
  }
  for (const field of fieldsOf(system)) {
    if (!field.roll) continue;
    const where = { tab: 'sheet' as const, field: field.tag };
    const die = field.roll.die;
    if (!die) { out.push({ where, level: 'error', text: `по полю «${field.label}» бросают, но кость не выбрана` }); continue; }
    const constant = system.constants?.[die];
    const derived = Object.values(system.rolls ?? {}).some(roll => roll.die === die && roll.fields.some(one => one.table === field.home && (field.cell ? field.cell.column === one.column : field.tag === one.column)));
    if (!derived && (field.roll.count || field.roll.sides) && constant?.kind === 'die' && (constant.dice ?? []).length !== 1) {
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
        if (seenOnly(step) && !allowed) out.push({ where: where(index), level: 'error', text: `«${registry.get(step.type)?.label}» работает только в подписке «${SEEN_LABEL}»` });
      });
    }
  }
  return out;
}

function costProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const pays = (step: Step): boolean => {
    const s = step as { type?: string; direction?: string };
    return s.type === 'emit' || s.type === 'check' || s.type === 'stop' || isFlow(step) || (s.type === 'apply' && (s.direction ?? 'subtract') === 'subtract');
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

function rollsDice(expr: unknown): boolean {
  const text = expr && typeof expr === 'object' && 'expr' in expr ? String((expr as { expr: unknown }).expr) : '';
  if (!text.trim()) return false;
  let ast: Node;
  try { ast = compile(text).ast; } catch { return false; }
  const visit = (node: Node): boolean => {
    switch (node.kind) {
      case 'Call': return node.name === 'кинуть' || node.args.some(visit);
      case 'Unary': return visit(node.operand);
      case 'Binary': return visit(node.left) || visit(node.right);
      case 'Conditional': return visit(node.test) || visit(node.then) || visit(node.otherwise);
      case 'Pick': return visit(node.key);
      default: return false;
    }
  };
  return visit(ast);
}

const FIELD_ADDRESS = /^\s*@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)\s*$/u;

function rolledColumn(system: System, effect: Effect, address: unknown): { table: string; column: string } | null {
  const tail = FIELD_ADDRESS.exec(String((address as { expr?: unknown } | undefined)?.expr ?? ''))?.[1]?.split('.');
  if (!tail) return null;
  const column = tail[tail.length - 1]!;
  if (tail.length === 1) {
    const home = Object.entries(system.tables ?? {}).find(([, table]) => isSingle(table) && (table.columns ?? []).some(one => one.key === column));
    return home ? { table: home[0], column } : null;
  }
  const input = (effect.params ?? []).find(param => param.key === tail[0] && param.kind === 'choice' && param.from);
  if (tail.length === 2) return input?.from && system.tables?.[input.from] ? { table: input.from, column } : null;
  return tail.length === 3 && system.tables?.[tail[0]!] && !isSingle(system.tables[tail[0]!]!) ? { table: tail[0]!, column } : null;
}

const plainDie = (system: System, name: string): boolean => {
  const die = system.constants?.[name] as { dice?: { count?: unknown; minus?: unknown }[]; read?: unknown; zero?: unknown } | undefined;
  const terms = die?.dice ?? [];
  return terms.length === 1 && typeof terms[0]!.count !== 'object' && !terms[0]!.minus && (die?.read === undefined || die.read === 'sum') && die?.zero === undefined;
};

const THROWN_DIE = /кинуть\(\s*[@#]([\p{L}\p{N}_]+)\s*[,)]/gu;

function rollStepProblems(system: System, effect: Effect, steps: Step[], where: (index: number) => Where): Problem[] {
  const out: Problem[] = [];
  const dieLabel = (name: string): string => system.constants?.[name]?.label || name;
  steps.forEach((raw, index) => {
    const step = raw as Step & { field?: unknown; bonus?: unknown; shift?: unknown; die?: unknown; count?: unknown };
    const filled = (value: unknown): boolean => value !== undefined && value !== null;
    for (const text of exprsIn(raw)) {
      for (const found of text.matchAll(THROWN_DIE)) {
        const name = found[1]!;
        if (system.constants?.[name]?.kind !== 'die' || (effect.params ?? []).some(param => param.key === name) || plainDie(system, name)) continue;
        out.push({ where: where(index), level: 'error', text: `кость «${dieLabel(name)}» в формуле не бросить: у неё несколько частей или свои настройки («вычитается», «считать успехи», «если костей ноль») — бросьте её шагом «Бросок»` });
      }
    }
    if (raw.type !== 'roll') return;
    if (typeof step.die === 'string' && filled(step.count) && ((system.constants?.[step.die] as { dice?: unknown[] } | undefined)?.dice ?? []).length > 1) {
      out.push({ where: where(index), level: 'error', text: `у кости «${dieLabel(step.die)}» несколько частей — «сколько костей» ей не задать` });
    }
    if (!filled(step.field)) return;
    const at = rolledColumn(system, effect, step.field);
    if (!at) return;
    const found = rollEntryOf(system, at.table, at.column);
    const table = system.tables![at.table]!;
    const label = (table.columns ?? []).find(one => one.key === at.column)?.label || at.column;
    if (!found) {
      out.push({ where: where(index), level: 'error', text: `по полю «${isSingle(table) ? label : `${table.label || at.table} → ${label}`}» не бросают — добавьте его в «Правила → Броски»` });
      return;
    }
    const kind = found.roll.number;
    if (filled(step.bonus) && (kind === 'under' || kind === 'over')) {
      out.push({ where: where(index), level: 'error', text: `бросок «${found.roll.label || found.key}» сравнивают с порогом — прибавку к итогу не прибавить, пишите поправку к числу поля` });
    }
    if (filled(step.shift) && kind === 'sides') {
      out.push({ where: where(index), level: 'error', text: `у броска «${found.roll.label || found.key}» число поля — грани кости: поправки к нему нет` });
    }
  });
  return out;
}

function thrownDiceProblems(steps: Step[], where: (index: number) => Where): Problem[] {
  const out: Problem[] = [];
  const thrown = new Set<string>();
  steps.forEach((step, index) => {
    for (const text of exprsIn(step)) {
      let ast: Node;
      try { ast = compile(text).ast; } catch { continue; }
      const visit = (node: Node): void => {
        switch (node.kind) {
          case 'Call': {
            const first = node.args[0];
            const head = first?.kind === 'Ref' ? first.tag.split('.')[0]! : '';
            if (node.name === 'кинуть' && thrown.has(head)) {
              out.push({ where: where(index), level: 'error', text: `«кинуть(@${head})»: в «${head}» уже выпавшее число, а не кость — кость задают так: кинуть(к6) или входом с костью` });
            }
            node.args.forEach(visit);
            return;
          }
          case 'Unary': visit(node.operand); return;
          case 'Binary': visit(node.left); visit(node.right); return;
          case 'Conditional': visit(node.test); visit(node.then); visit(node.otherwise); return;
          case 'Pick': visit(node.key); return;
          default: return;
        }
      };
      visit(ast);
    }
    if ((step.type === 'roll' || step.type === 'check') && step.id) thrown.add(String(step.id));
  });
  return out;
}

const NO_DICE_IN_IF = 'в условии правки кости не бросают — «кинуть» уберите';

const NO_DICE_HERE = 'кости бросает только шаг эффекта и прибавка к броску — здесь «кинуть» уберите';

const ANYONE_ROLLS = 'правка действует на броски всех листов в комнате — в условии нет носителя; обычно «бросает носитель» или «бросают против носителя»';

const AGAINST_NAME = /@против(?![\p{L}\p{N}_])/u;

const readsAgainst = (guard: unknown): boolean => AGAINST_NAME.test(String((guard as { expr?: unknown } | undefined)?.expr ?? ''));

const FACED_OPS = new Set(['addDie', 'keepBest', 'keepWorst', 'shiftVersus', 'shiftDegree', PLUS_OP]);

const SEEN_AGAINST = '«увидев кости» с «@против» в условии срабатывает, только когда бросок сравнивают с одним противником в той же части эффекта; у общего броска на несколько целей противника ещё нет';

function handlerDiceProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    (effect.on ?? []).forEach((handler, index) => {
      const where = { tab: 'effects' as const, effect: id, part: 'on', handler: index };
      if (rollsDice(handler.if)) out.push({ where, level: 'error', text: 'в условии подписки кости не бросают — «кинуть» уберите' });
      if ((handler.on === 'seen' || handler.on === ROLLED) && readsAgainst(handler.if)) out.push({ where, level: 'warn', text: SEEN_AGAINST });
      if (handler.on === ROLLED && handler.confirm) out.push({ where, level: 'error', text: `«${ROLLED_LABEL}» не спрашивает игрока — снимите «спросить»` });
      if (handler.on !== 'seen' && handler.on !== ROLLED && (handler.tags?.length || handler.anyTags?.length || handler.notTags?.length)) out.push({ where, level: 'error', text: `метки броска фильтруют только «${SEEN_LABEL}» и «${ROLLED_LABEL}» — здесь броска нет` });
    });
  }
  return out;
}

const loneRoll = (ref: unknown): string | null =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? null;

const SHARED_READ = (name: string): RegExp => new RegExp(`@${name}(?:\\.natural)?(?![\\p{L}\\p{N}_.])`, 'u');

const MENTION = (name: string): RegExp => new RegExp(`@${name}(?![\\p{L}\\p{N}_])`, 'u');

function sharedRollProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    const steps = (effect.steps ?? []) as (Step & Record<string, unknown>)[];
    const split = steps.findIndex(step => registry.get(step.type)?.splits?.(step as never) === true);
    if (split < 0) continue;
    const shared = new Set(steps.slice(0, split)
      .filter(step => typeof step.id === 'string' && registry.get(step.type)?.thrownBy?.(step as never))
      .map(step => step.id as string));
    if (!shared.size) continue;
    const faced = new Map<string, string>();
    steps.slice(split + 1).forEach((step, at) => {
      const sides = registry.get(step.type)?.compares?.(step as never);
      if (!sides) return;
      for (const ref of [sides.value, sides.versus]) {
        const name = loneRoll(ref);
        if (name && shared.has(name)) {
          if (!faced.has(name)) faced.set(name, typeof step.id === 'string' ? step.id : '');
          continue;
        }
        const text = JSON.stringify(ref ?? '');
        for (const roll of shared) {
          if (!MENTION(roll).test(text)) continue;
          out.push({
            where: { tab: 'effects', effect: id, step: split + 1 + at },
            level: 'warn',
            text: `«${roll}» сравнивается внутри формулы — правки цели (преимущество против неё и подобные) так не учтутся; поставьте бросок на сторону целиком: @${roll} >= …, прибавку — в сам бросок`,
          });
        }
      }
    });
    if (!faced.size) continue;
    steps.forEach((step, at) => {
      if (at === split || faced.has(String(step.id ?? ''))) return;
      const sides = registry.get(step.type)?.compares?.(step as never);
      const args = step.args && typeof step.args === 'object'
        ? Object.fromEntries(Object.entries(step.args as Record<string, unknown>).filter(([, ref]) => !loneRoll(ref) || !faced.has(loneRoll(ref)!)))
        : step.args;
      const rest = sides
        ? { ...step, args, value: loneRoll(sides.value) ? undefined : step.value, versus: loneRoll(sides.versus) ? undefined : step.versus }
        : { ...step, args };
      const text = JSON.stringify(rest);
      for (const [name, check] of faced) {
        if (!SHARED_READ(name).test(text)) continue;
        const via = check ? `@${check}` : 'сравнения';
        out.push({
          where: { tab: 'effects', effect: id, step: at },
          level: 'warn',
          text: `«${name}» здесь — общий бросок без правок цели (преимущество против неё и подобных); что выпало против цели — у сравнения: ${via}.natural, ${via}.success`,
        });
      }
    });
  }
  return out;
}

function rollEditProblems(system: System): Problem[] {
  const known = new Set(editStages().map(one => one.op));
  const out: Problem[] = [];
  for (const [key, edit] of Object.entries(system.roll_edits ?? {})) {
    const where = { tab: 'rules' as const, section: 'roll_edits', key };
    const name = edit.label || key;
    for (const other of edit.cancels ?? []) {
      if (other === key) out.push({ where, level: 'error', text: `правка броска «${name}» гасит сама себя` });
      else if (!system.roll_edits?.[other]) out.push({ where, level: 'error', text: `правка броска «${name}» гасит слово «${other}», которого нет в словаре` });
      else if (!system.roll_edits[other]!.cancels?.includes(key)) out.push({ where, level: 'warn', text: `«${name}» гасит «${system.roll_edits[other]!.label || other}», а встречной связи нет — уберите и поставьте пару заново` });
    }
    for (const op of edit.ops ?? []) {
      const value = (op as { value?: { expr?: unknown } }).value;
      if (!known.has(String(op.op))) out.push({ where, level: 'error', text: `у правки броска «${name}» неизвестное действие «${String(op.op)}»` });
      if (AGAINST_NAME.test(JSON.stringify(op))) out.push({ where, level: 'error', text: `в словаре правок броска «@против» не пишут — у «${name}» он есть; противника проверяет условие правки на листе` });
      else if (op.op === PLUS_OP && !String(value?.expr ?? '').trim()) out.push({ where, level: 'error', text: `у правки броска «${name}» «прибавить» без формулы` });
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
      if (mod.kind === 'value') {
        const at = { ...where, part: 'modifiers' };
        const slotted = /\{@(?!строка\.)([\p{L}\p{N}_]+)((?:\.[\p{L}\p{N}_]+)*)\}/u.exec(String(mod.target));
        if (slotted) {
          const owner = (where as { effect?: string }).effect ? system.effects?.[(where as { effect?: string }).effect!] : undefined;
          const param = (owner?.params ?? []).find(one => one.key === slotted[1]);
          const column = slotted[2]?.slice(1);
          const rows = param?.kind === 'choice' && param.from && column ? system.tables?.[param.from]?.rows ?? [] : [];
          const tags = rows.map(row => (row.cells ?? {})[column!]).filter((tag): tag is string => typeof tag === 'string' && tag !== '');
          const stages = [...new Map(tags.flatMap(tag => targetStages(system, String(mod.target).replace(slotted[0], tag))).map(one => [one.key, one])).values()];
          if (tags.length) out.push(...stageProblems(stages, mod.stage as string | undefined, String(mod.target), at));
        } else out.push(...stageProblems(targetStages(system, String(mod.target)), mod.stage as string | undefined, String(mod.target), at));
        if (rollsDice(mod.value) || rollsDice(mod.if)) out.push({ where: at, level: 'error', text: NO_DICE_HERE });
        continue;
      }
      if (mod.kind !== 'edit') continue;
      const call = String(mod.call);
      const at = { ...where, part: 'modifiers' };
      if (call !== ROLL_CALL && (rollsDice(mod.value) || rollsDice(mod.if))) out.push({ where: at, level: 'error', text: NO_DICE_HERE });
      if (call === ROLL_CALL) {
        if (mod.stage !== undefined) out.push(...stageProblems([], mod.stage as string, CALL_WORDS.roll.label, at));
        if (!(String(mod.param) in CALL_WORDS.roll.params)) out.push({ where: at, level: 'error', text: `у броска нет параметра «${String(mod.param)}»` });
        else if (mod.param === 'edits' && !mod.edit) out.push({ where: at, level: 'error', text: 'правка броска не выбрана' });
        else if (mod.param === 'bonus' && !(mod.value as { expr?: string } | undefined)?.expr?.trim()) out.push({ where: at, level: 'error', text: 'у прибавки к броску не задано, на сколько' });
        else if (mod.param === 'count' && !(mod.value as { expr?: string } | undefined)?.expr?.trim()) out.push({ where: at, level: 'error', text: 'у кубиков к броску не задано, сколько' });
        else if (mod.param === 'count' && mod.op !== 'add') out.push({ where: at, level: 'error', text: `кубики к броску только прибавляются, а здесь «${String(mod.op ?? 'не задано')}»` });
        else if (mod.param === 'bonus' && mod.op !== 'add') out.push({ where: at, level: 'error', text: `прибавка к броску только прибавляет, а здесь «${String(mod.op ?? 'не задано')}»` });
        if (rollsDice(mod.if)) out.push({ where: at, level: 'error', text: NO_DICE_IN_IF });
        if (!tiedToHolder(mod.if as Guard | undefined)) out.push({ where: at, level: 'warn', text: ANYONE_ROLLS });
        if (readsAgainst(mod.if) && mod.param === 'edits' && mod.edit) {
          const word = system.roll_edits?.[String(mod.edit)];
          const bad = [...new Set((word?.ops ?? []).map(op => String(op.op)).filter(op => !FACED_OPS.has(op)))];
          if (bad.length) out.push({ where: at, level: 'error', text: `правка с «@против» в условии действует в каждом сравнении отдельно и может только добавлять и убирать кости, брать лучшую или худшую, прибавлять и сдвигать порог; у «${word?.label || String(mod.edit)}» есть ${bad.map(op => `«${op}»`).join(', ')}` });
        }
        continue;
      }
      const effect = system.effects?.[call];
      if (!effect) {
        out.push({ where: at, level: 'error', text: `правка вызывает «${call}», а такого эффекта нет` });
        continue;
      }
      const param = (effect.params ?? []).find(p => p.key === mod.param);
      if (!param) out.push({ where: { ...where, part: 'modifiers' }, level: 'error', text: `у «${effect.label || call}» нет входа «${String(mod.param)}» — править нечего` });
      else if (param.role !== 'amount') out.push({ where: { ...where, part: 'modifiers' }, level: 'error', text: `правка «${effect.label || call}» правит пока только величину, а «${param.label || param.key}» — не она` });
      else out.push(...stageProblems(paramStages(effect.params, param.key), mod.stage as string | undefined, `${effect.label || call} · ${param.label || param.key}`, at));
      if (!tiedToHolder(mod.if as Guard | undefined)) {
        const holder = (effect.params ?? []).find(p => p.key === holderNameOf(system, call));
        out.push({ where: at, level: 'warn', text: `правка действует на все вызовы «${effect.label || call}» в комнате — в условии нет носителя${holder ? `; обычно «${holder.label || holder.key} — носитель»` : ''}` });
      }
    }
  }
  return out;
}

function stageProblems(stages: readonly Stage[], stage: string | undefined, owner: string, at: Where): Problem[] {
  if (stage !== undefined && !stages.some(s => s.key === stage)) {
    return [{ where: at, level: 'error', text: stages.length
      ? `у величины «${owner}» нет этапа «${stage}» — есть: ${stages.map(s => s.label || s.key).join(', ')}`
      : `у величины «${owner}» этапов нет — правке этап не нужен` }];
  }
  if (stage === undefined && stages.length > 1) {
    return [{ where: at, level: 'error', text: `у величины «${owner}» несколько этапов — выберите, на каком правка действует` }];
  }
  return [];
}

function declaredStageProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const check = (stages: readonly Stage[] | undefined, owner: string, where: Where) => {
    const seen = new Set<string>();
    for (const stage of stages ?? []) {
      if (seen.has(stage.key)) out.push({ where, level: 'error', text: `у «${owner}» два этапа «${stage.label || stage.key}»` });
      seen.add(stage.key);
    }
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const param of effect.params ?? []) {
      const stages = (param as { stages?: Stage[] }).stages;
      if (stages?.length && (param as { role?: string }).role !== 'amount') {
        out.push({ where: { tab: 'effects', effect: id }, level: 'error', text: `этапы бывают только у величины, а «${param.label || param.key}» — не она` });
      }
      check(stages, `${effect.label || id} · ${param.label || param.key}`, { tab: 'effects', effect: id });
    }
  }
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    for (const column of table.columns ?? []) check(column.stages, `${table.label || id} · ${column.label || column.key}`, { tab: 'rules', field: column.key });
  }
  return out;
}

function sheetKindProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const known = new Set([...sheetBlockNames(system), ...(system.blocks ?? []).flatMap(b => (b.parent ? [b.parent] : []))]);
  for (const [key, kind] of Object.entries(system.sheets ?? {})) {
    for (const block of kind.blocks ?? []) {
      if (!known.has(block)) {
        out.push({ where: { tab: 'records', kind: key }, level: 'warn', text: `тип листа «${kind.label || key}» показывает блок «${block}», которого на листе нет` });
      }
    }
  }
  return out;
}

function layoutProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const where = { tab: 'sheet' as const };
  const seen = new Set<string>();
  for (const block of system.blocks ?? []) {
    if (seen.has(block.name)) out.push({ where, level: 'error', text: `блок листа «${block.name}» назван дважды` });
    seen.add(block.name);
    for (const part of block.parts) {
      const table = system.tables?.[part.table];
      if (!table) { out.push({ where, level: 'error', text: `блок «${block.name}» берёт таблицу «${part.table}», а её нет` }); continue; }
      const keys = new Set((table.columns ?? []).map(c => c.key));
      for (const column of part.columns ?? []) if (!keys.has(column)) out.push({ where, level: 'error', text: `блок «${block.name}»: в таблице «${table.label || part.table}» нет колонки «${column}»` });
      if (part.by && !keys.has(part.by)) out.push({ where, level: 'error', text: `блок «${block.name}» группирует по колонке «${part.by}», а её нет` });
      const rows = new Set((table.rows ?? []).map(r => rowKeyOf(r)));
      for (const row of part.rows ?? []) if (!rows.has(row)) out.push({ where, level: 'warn', text: `блок «${block.name}»: в таблице «${table.label || part.table}» нет строки «${row}»` });
    }
  }
  return [...out, ...pageProblems(system)];
}

function pageProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const where = { tab: 'sheet' as const };
  const pages = system.pages ?? [];
  const names = new Set<string>();
  for (const page of pages) {
    if (names.has(page.name)) out.push({ where, level: 'error', text: `страница листа «${page.name}» названа дважды` });
    names.add(page.name);
  }
  if (pages.filter(page => page.top).length > 1) out.push({ where, level: 'error', text: 'шапка листа одна, а страниц-шапок несколько' });
  const lists = new Map<string, string>();
  for (const block of system.blocks ?? []) {
    if (!block.list) continue;
    const was = lists.get(block.list);
    if (was) out.push({ where, level: 'error', text: `список «${SHEET_LISTS[block.list]}» стоит и в блоке «${was}», и в «${block.name}»` });
    else lists.set(block.list, block.name);
  }
  for (const block of system.blocks ?? []) {
    if (block.page && !names.has(block.page)) out.push({ where, level: 'error', text: `блок «${block.name}» стоит на странице «${block.page}», а её нет` });
    for (const kind of block.kinds ?? []) if (!system.tables?.[kind]) out.push({ where, level: 'warn', text: `блок «${block.name}» показывает в снаряжении тип «${kind}», а его нет` });
    if (block.under && block.width) out.push({ where, level: 'warn', text: `блок «${block.name}» стоит под предыдущим — ширину задаёт верхний блок, своя не действует` });
  }
  return out;
}

function orphanProblems(system: System, compendium?: Compendium): Problem[] {
  const out: Problem[] = [];
  const emitted = new Set<string>();
  const heardEvents = new Set<string>();
  for (const [id, effect] of Object.entries(system.effects)) {
    for (const event of chainsOfEffect(effect).flatMap(steps => emittedBy(steps, inputsOf(system, id)))) emitted.add(event);
    for (const handler of effect.on ?? []) {
      for (const event of emittedBy(handler.steps, inputsOf(system, id))) emitted.add(event);
      const heard = listenerOf(handler);
      if (heard.kind === 'call') heardEvents.add(heard.key);
    }
  }
  for (const key of emitted) {
    const called = system.effects[key];
    if (!called || called.steps?.length || called.returns?.length || heardEvents.has(key)) continue;
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

const ENGINE_WORDS = new Map([
  [ROW, `так пишется клетка своей строки (@${ROW}.колонка)`],
  [HOLDER, `так пишется лист, на котором висит эффект (@${HOLDER})`],
  [DESK_NAME, `так пишется стол (@${DESK_NAME}.поле)`],
]);

function paramProblems(system: System, compendium?: Compendium): Problem[] {
  const out: Problem[] = [];
  const fields = new Set(fieldsOf(system).map(f => f.tag));
  for (const [id, effect] of Object.entries(system.effects)) {
    for (const param of effect.params ?? []) {
      const word = ENGINE_WORDS.get(param.key);
      if (word) {
        out.push({
          where: { tab: 'effects', effect: id, part: 'params', key: param.key }, level: 'error',
          text: `вход «${param.label ?? param.key}» назван «${param.key}» — это слово движка: ${word}; переименуйте вход`,
        });
      }
      if (!fields.has(param.key)) continue;
      out.push({
        where: { tab: 'effects', effect: id }, level: 'error',
        text: `вход «${param.label ?? param.key}» назван как поле «${param.key}» — в формулах шага победит поле; переименуйте вход`,
      });
    }
  }
  for (const [id, effect] of Object.entries(system.effects)) {
    for (const { steps, where: whereOf } of chainsOf(id, effect)) {
      steps.forEach((step, index) => {
        const raw = step as unknown as Record<string, unknown>;
        const applying = step.type === 'status' && raw.mode !== 'remove';
        if ((step.type !== 'emit' && !applying) || !raw.effect) return;
        const args = (raw.args ?? {}) as Record<string, unknown>;
        for (const choice of emittedChoices(system, id, raw.effect, applying ? compendium : undefined)) {
          const called = system.effects[choice];
          if (!called) continue;
          for (const param of called.params ?? []) {
            if (!applying && param.kind === 'roll' && !isBlank(args[param.key])) {
              const text = String((args[param.key] as { expr?: unknown } | null)?.expr ?? '');
              const lone = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(text)?.[1];
              const step = lone ? steps.slice(0, index).find(one => one.id === lone) : undefined;
              const own = lone ? (effect.params ?? []).find(one => one.key === lone) : undefined;
              const fits = lone !== undefined && (step ? step.type === 'roll' : own ? own.kind === 'roll' : true);
              if (!fits) {
                out.push({
                  where: whereOf(index), level: 'error',
                  text: `во вход-бросок «${param.label ?? param.key}» вызова «${called.label ?? choice}» передан не бросок: нужно одно имя шага-броска или входа-броска`,
                });
              }
            }
            const stray = strayRow(system, param, args[param.key]);
            if (stray) {
              const text = `во вход «${param.label ?? param.key}» ${applying ? 'наложения' : 'вызова'} «${called.label ?? choice}» передано «${stray.value}» — в таблице «${stray.table}» такой строки нет`;
              if (!out.some(p => sameWhere(p.where, whereOf(index)) && p.text === text)) out.push({ where: whereOf(index), level: 'error', text });
            }
            if (!isBlank(args[param.key]) || param.optional || param.ask || param.default !== undefined) continue;
            const effectName = `«${called.label ?? choice}»`;
            const inputName = `«${param.label ?? param.key}»`;
            out.push({
              where: whereOf(index),
              level: 'error',
              text: `${applying ? 'наложение' : 'вызов'} ${effectName} не заполняет его вход ${inputName}`,
            });
          }
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
      const table = tableOf(binding, effect);
      for (const param of effect.params ?? []) {
        if (!isBlank(args[param.key]) || table[param.key]) continue;
        if (param.ask || param.optional || param.default !== undefined) continue;
        out.push({
          where: { tab: 'records', kind, part: 'bindings', binding: index }, level: 'error',
          text: `кнопка «${binding.label ?? effect.label ?? binding.effect}» не заполняет вход «${param.label ?? param.key}» эффекта «${effect.label ?? binding.effect}»`,
        });
      }
    });
  }
  return out;
}

function exprsIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) exprsIn(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'expr' && typeof item === 'string') out.push(item);
      else exprsIn(item, out);
    }
  }
  return out;
}

const namesUsedIn = (...parts: unknown[]): Set<string> =>
  new Set(parts.flatMap(part => exprsIn(part)).flatMap(expr => formulaDeps(expr) ?? []).map(dep => dep.split('.')[0]!));

function heardLabel(system: System, heard: Listener): string {
  switch (heard.kind) {
    case 'seen': return SEEN_LABEL;
    case 'rolled': return ROLLED_LABEL;
    case 'call': return system.effects?.[heard.key]?.label || system.tags?.[heard.key]?.label || heard.key;
    case 'moment': return MOMENTS[heard.key as keyof typeof MOMENTS] ?? heard.key;
    case 'field': return `${fieldOf(system, heard.key)?.label ?? heard.key} стало верным`;
    case 'gained': return `${system.effects?.[heard.key]?.label || heard.key} ${HEARD_WORDS.attach}`;
    case 'lost': return `${system.effects?.[heard.key]?.label || heard.key} ${HEARD_WORDS.detach}`;
    default: return '';
  }
}

const shadowedInputs = (params: readonly Param[], sheets: ReadonlySet<string>, values: ReadonlySet<string>, used: ReadonlySet<string>): Param[] =>
  params.filter(param => used.has(param.key) && (sheets.has(param.key) || (param.kind !== 'sheet' && values.has(param.key))));

function nameClashProblems(system: System): Problem[] {
  const out: Problem[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    const params = effect.params ?? [];
    if (!params.length) continue;
    const report = (where: Where, param: Param, source: string) => out.push({
      where, level: 'error',
      text: `вход «${param.label || param.key}» у «${effect.label || id}» совпадает с «${param.key}» у «${source}»: здесь @${param.key} — значение «${source}». Переименуйте свой вход`,
    });
    (effect.on ?? []).forEach((handler, index) => {
      const heard = listenerOf(handler);
      const names = heardNames(system, heard);
      const used = namesUsedIn(handler.if, handler.steps, handler.cost);
      for (const param of shadowedInputs(params, new Set(names.sheets), new Set(names.seeds), used)) {
        report({ tab: 'effects', effect: id, part: 'on', handler: index }, param, heardLabel(system, heard));
      }
    });
    for (const mod of effect.modifiers ?? []) {
      if (mod.kind !== 'edit' || mod.call === ANY_ACTION) continue;
      const names = callNamesOf(system, mod.call);
      const used = namesUsedIn(mod.if, mod.value);
      const source = mod.call === ROLL_CALL ? CALL_WORDS.roll.label : system.effects?.[mod.call]?.label || mod.call;
      for (const param of shadowedInputs(params, new Set(names.sheets), new Set(names.values), used)) {
        report({ tab: 'effects', effect: id, part: 'modifiers' }, param, source);
      }
    }
  }
  return out;
}

function recordCellProblems(system: System, compendium?: Compendium): Problem[] {
  const flat = flattenSystem(system, true);
  const fields = new Set(fieldsOf(flat).map(field => field.tag));
  const out: Problem[] = [];
  const check = (where: Where, table: Table | undefined, modifiers: readonly Modifier[] | undefined) => {
    const shared = (table?.columns ?? []).map(column => column.key).filter(key => fields.has(key));
    if (!shared.length) return;
    for (const mod of modifiers ?? []) {
      if (mod.kind !== 'value') continue;
      const used = namesUsedIn(mod.if, mod.value);
      for (const key of shared) {
        if (used.has(key)) out.push({ where, level: 'warn', text: `«${key}» — поле листа; клетку записи пишут @${ROW}.${key}` });
      }
    }
  };
  for (const [id, table] of recordKinds(flat)) check({ tab: 'records', kind: id, part: 'modifiers' }, table, table.modifiers);
  const records = new Map([...(flat.library ?? []), ...recordsOf(compendium)].map(record => [record.id, record]));
  for (const record of records.values()) {
    check({ tab: 'book', record: record.id, part: 'modifiers' }, record.table ? flat.tables?.[record.table] : undefined, record.modifiers);
  }
  return out;
}

function perTargetProblems(system: System): Problem[] {
  const out: Problem[] = [];
  const readsOf = (step: unknown, keys: Set<string>): string[] => {
    const found = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== 'object') return;
      const expr = (value as { expr?: unknown }).expr;
      if (typeof expr === 'string') {
        let deps: readonly string[] = [];
        try { deps = compile(expr).deps; } catch { deps = []; }
        for (const dep of deps) { const head = dep.split('.')[0]!; if (keys.has(head)) found.add(head); }
      }
      Object.values(value).forEach(walk);
    };
    walk(step);
    return [...found];
  };
  for (const [id, effect] of Object.entries(system.effects)) {
    const each = (effect.params ?? []).filter(param => (param as { perTarget?: boolean }).perTarget);
    if (!each.length) continue;
    const keys = new Set(each.map(param => param.key));
    const steps = effect.steps ?? [];
    const loop = steps.findIndex(step => loopsAt(step) && (step as { of?: unknown }).of);
    for (const param of each) {
      const name = param.label ?? param.key;
      if (!param.ask) out.push({ where: { tab: 'effects', effect: id, key: param.key, part: 'params' }, level: 'error', text: `вход «${name}» спрашивается для каждой цели — ему нужен вопрос игроку («Спросить»)` });
      if (loop < 0) out.push({ where: { tab: 'effects', effect: id, key: param.key, part: 'params' }, level: 'error', text: `вход «${name}» — для каждой цели, а «${STEP_WORDS.each.label}» по целям у эффекта нет` });
    }
    (effect.cost ?? []).forEach((step, index) => {
      for (const key of readsOf(step, keys)) out.push({ where: { tab: 'effects', effect: id, step: index, part: 'cost' }, level: 'error', text: `«${key}» — своё у каждой цели, в «Плате» его не прочесть` });
    });
    steps.slice(0, Math.max(loop, 0)).forEach((step, index) => {
      for (const key of readsOf(step, keys)) out.push({ where: { tab: 'effects', effect: id, step: index }, level: 'error', text: `«${key}» — своё у каждой цели, до «${STEP_WORDS.each.label}» его не прочесть` });
    });
  }
  return out;
}

export function lintSystem(system: System, compendium?: Compendium): Problem[] {
  const declared = declaredOf(system);
  const out: Problem[] = [...perTargetProblems(system)];

  for (const [id, effect] of Object.entries(system.effects)) {
    for (const chain of chainsOf(id, effect)) {
      out.push(...stepProblems(chain.steps, chain.where));
      out.push(...thrownDiceProblems(chain.steps, chain.where));
      out.push(...rollStepProblems(system, effect, chain.steps, chain.where));
      const loops = chain.steps.flatMap((step, index) => (registry.get(step.type)?.loops ? [index] : []));
      for (const index of loops.slice(1)) {
        out.push({ where: chain.where(index), level: 'error', text: `«${STEP_WORDS.each.label}» в цепочке может быть только один` });
      }
      const arms = armsOf(chain.steps);
      for (const found of balance(chain.steps)) out.push({ where: chain.where(found.index), level: 'error', text: found.problem });
      for (const index of loops) {
        if (inBlock(arms, index)) out.push({ where: chain.where(index), level: 'error', text: `«${STEP_WORDS.each.label}» не ставится внутрь «Если» — цикл только верхним уровнем` });
      }
      const outputsOfCall = new Map<string, { label: string; keys: Set<string> }>();
      chain.steps.forEach((step, index) => {
        const called = (step as { effect?: unknown }).effect;
        const returns = step.type === 'emit' && step.id && typeof called === 'string' ? system.effects[called]?.returns : undefined;
        if (step.id && !returns?.length) outputsOfCall.delete(String(step.id));
        if (returns?.length) {
          outputsOfCall.set(String(step.id), { label: system.effects[String(called)]?.label ?? String(called), keys: new Set([...returns.map(column => column.key), 'amount', 'incoming', 'event', 'tags']) });
          return;
        }
        if (!outputsOfCall.size) return;
        const text = JSON.stringify(step);
        for (const [id, known] of outputsOfCall) {
          for (const found of text.matchAll(new RegExp(`@${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.([\\p{L}\\p{N}_]+)`, 'gu'))) {
            if (!known.keys.has(found[1]!)) out.push({ where: chain.where(index), level: 'error', text: `у «${known.label}» нет итога «${found[1]}»` });
          }
        }
      });
      chain.steps.forEach((step, index) => {
        if (step.if !== undefined && !isFlow(step)) out.push({ where: chain.where(index), level: 'error', text: 'у шага своё условие — условие теперь ставится блоком «Если»' });
        const cond = (step.if as { expr?: unknown } | undefined)?.expr;
        if (isFlow(step) && step.if !== undefined && (typeof cond !== 'string' || !cond.trim())) {
          out.push({ where: chain.where(index), level: 'error', text: 'не заполнено: условие' });
        }
        if (flowOf(step.type) === 'alt' || flowOf(step.type) === 'open') {
          const next = chain.steps[index + 1];
          if (!next || flowOf(next.type) === 'alt' || flowOf(next.type) === 'close') out.push({ where: chain.where(index), level: 'warn', text: 'пустая ветка — в ней нет шагов' });
        }
      });
      chain.steps.forEach((step, index) => {
        if (step.id && declared.field.has(String(step.id))) {
          out.push({
            where: chain.where(index), level: 'warn',
            text: `${STEP.one} «${step.id}» назван как поле листа — в формулах @${step.id} прочтёт поле, а не результат ${STEP.gen}`,
          });
        }
        const input = step.id ? (effect.params ?? []).find(param => param.key === step.id) : undefined;
        if (input) {
          out.push({
            where: chain.where(index), level: 'warn',
            text: input.kind === 'sheet'
              ? `${STEP.one} «${step.id}» назван как вход «${input.label || input.key}» — @${step.id} всегда читает ${SHEET.one}, результат ${STEP.gen} так не прочесть; лучше переименовать ${STEP.one}`
              : `${STEP.one} «${step.id}» назван как вход «${input.label || input.key}» — до ${STEP.gen} @${step.id} читает вход, после — результат ${STEP.gen}; лучше переименовать ${STEP.one}`,
          });
        }
        const word = step.id ? ENGINE_WORDS.get(step.id) : undefined;
        if (word) {
          out.push({
            where: chain.where(index), level: 'error',
            text: `${STEP.one} не может зваться «${step.id}» — это слово движка: ${word}`,
          });
        }
      });
    }
  }

  for (const [id, effect] of Object.entries(system.effects)) {
    (effect.on ?? []).forEach((handler, index) => {
      const heard = listenerOf(handler);
      if (heard.kind !== 'call') return;
      const calls = new Map<string, { label: string; keys: Set<string> }>();
      for (const source of sourcesOf(system, heard.key)) {
        for (const step of source.steps ?? []) {
          const called = (step as { effect?: unknown }).effect;
          const returns = step.type === 'emit' && step.id && typeof called === 'string' ? system.effects[called]?.returns : undefined;
          if (returns?.length) calls.set(String(step.id), { label: system.effects[String(called)]?.label ?? String(called), keys: new Set([...returns.map(column => column.key), 'amount', 'incoming', 'event', 'tags']) });
        }
      }
      const text = JSON.stringify({ if: handler.if, steps: handler.steps, cost: handler.cost });
      for (const [step, known] of calls) {
        for (const found of text.matchAll(new RegExp(`@${step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.([\\p{L}\\p{N}_]+)`, 'gu'))) {
          if (!known.keys.has(found[1]!)) out.push({ where: { tab: 'effects', effect: id, part: 'on', handler: index }, level: 'error', text: `у «${known.label}» нет итога «${found[1]}»` });
        }
      }
    });
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
  out.push(...shapeProblems(system, compendium));
  out.push(...cycleProblems(system));
  out.push(...paramProblems(system, compendium));
  out.push(...nameClashProblems(system));
  out.push(...recordCellProblems(system, compendium));
  out.push(...orphanProblems(system, compendium));
  out.push(...sheetKindProblems(system), ...layoutProblems(system));
  out.push(...editProblems(system, compendium));
  out.push(...rollEditProblems(system));
  out.push(...handlerDiceProblems(system));
  out.push(...sharedRollProblems(system));
  out.push(...declaredStageProblems(system));
  out.push(...costProblems(system));
  out.push(...seenProblems(system));
  out.push(...fieldRollProblems(system), ...viewProblems(system));
  out.push(...fieldNameProblems(system));
  out.push(...rowNameProblems(system));
  out.push(...labelTwinProblems(system));
  out.push(...tableFieldProblems(system));
  for (const found of [...variantProblems(system), ...cellScopeProblems(system)]) {
    if (!out.some(p => sameWhere(p.where, found.where) && p.text === found.text)) out.push({ where: found.where, level: 'error', text: found.text });
  }
  out.push(...danglingRows(system, compendium).map(d => ({ where: d.where, level: 'error' as const, text: d.text })));
  const seen = new Set<string>();
  return out.filter(problem => {
    const key = `${problem.level}|${problem.text}|${JSON.stringify(problem.where)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    parts.push(where.kind && system.sheets?.[where.kind] ? `${TABS.sheet} · тип листа` : TABS.records);
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

function rowLoopProblems(system: System, effect: Effect, steps: Step[], index: number, at: Where): Problem[] {
  const out: Problem[] = [];
  const raw = steps[index] as { rows?: unknown; as?: unknown };
  const id = String(raw.rows ?? '');
  const table = system.tables?.[id];
  if (!table) return [{ where: at, level: 'error', text: `«для каждой строки»: таблицы «${id}» нет` }];
  const label = table.label || id;
  if (isRange(table)) out.push({ where: at, level: 'error', text: `у таблицы «${label}» строки — промежутки, у них нет значения: перебирать нечего` });
  else if (!(table.rows ?? []).length) out.push({ where: at, level: 'error', text: `у таблицы «${label}» строк нет — перебирать нечего` });
  const as = typeof raw.as === 'string' ? raw.as.trim() : '';
  if (!as) {
    out.push({ where: at, level: 'error', text: `«для каждой строки «${label}»»: не сказано, как зовётся строка` });
    return out;
  }
  const taken: [boolean, string][] = [
    [(effect.params ?? []).some(param => param.key === as), 'вход эффекта'],
    [steps.some(step => step.id === as), STEP.one],
    [as === HOLDER || as === DESK_NAME || as === ROW, 'слово движка'],
    [hasField(system, as), 'поле листа'],
    [Boolean(system.tables?.[as]), 'таблица'],
    [recordKinds(system).some(([, kind]) => (kind.columns ?? []).some(prop => prop.key === as)), 'свойство записи'],
  ];
  const clash = taken.find(([hit]) => hit);
  if (clash) out.push({ where: at, level: 'error', text: `имя строки «${as}» уже занято: так зовётся ${clash[1]}` });
  return out;
}

function shapeProblems(system: System, compendium?: Compendium): Problem[] {
  const out: Problem[] = [];
  const called = new Set(Object.entries(system.effects).flatMap(([key, effect]) => [
    effect.steps ?? [], effect.cost ?? [], effect.attach ?? [], effect.detach ?? [],
    ...(effect.on ?? []).map(handler => handler.cost ?? []),
  ].flatMap(steps => emittedBy(steps, inputsOf(system, key)))));
  const sheetsOf = (effect: Effect): Map<string, boolean> =>
    new Map((effect.params ?? []).filter(p => p.kind === 'sheet').map(p => [p.key, Boolean(p.many)]));
  for (const [id, effect] of Object.entries(system.effects)) {
    const where: Where = { tab: 'effects', effect: id };
    if ((effect as { extends?: unknown }).extends !== undefined) out.push({ where, level: 'error', text: '«на основе» у эффекта больше нет — общее вызывается шагом «вызов» (например, в цене)' });
    const sheets = sheetsOf(effect);
    const paid = emittedBy(effect.cost);
    for (const twice of new Set(paid.filter((key, index) => paid.indexOf(key) !== index))) {
      out.push({ where: { ...where, part: 'cost' }, level: 'warn', text: `стоимость зовёт «${system.effects[twice]?.label ?? twice}» дважды: спишется два раза` });
    }
    for (const chain of chainsOf(id, effect)) {
      chain.steps.forEach((step, index) => {
        if (!loopsAt(step)) return;
        const raw = step as { of?: unknown; rows?: unknown; as?: unknown };
        const at = chain.where(index);
        const listed = raw.of !== undefined && raw.of !== '';
        const tabled = raw.rows !== undefined && raw.rows !== '';
        if (listed && tabled) {
          out.push({ where: at, level: 'error', text: '«для каждого» перебирает или вход-список, или строки таблицы — не оба сразу' });
          return;
        }
        if (!listed && !tabled) {
          out.push({ where: at, level: 'error', text: 'не заполнено: из какого списка' });
          return;
        }
        if (tabled) {
          out.push(...rowLoopProblems(system, effect, chain.steps, index, at));
          return;
        }
        if (raw.as !== undefined) out.push({ where: at, level: 'error', text: 'имя строки бывает только у цикла по таблице — у входа-списка имя одного задаёт сам вход' });
        if (chain.steps !== effect.steps) {
          out.push({ where: at, level: 'error', text: 'цикл по целям — только у действия кнопкой; в подписке, цене и при наложении перебирают строки таблицы' });
          return;
        }
        const of = typeof raw.of === 'string' ? raw.of : '';
        if (!sheets.get(of)) out.push({ where: at, level: 'error', text: `«для каждого» перебирает «${of || '?'}», а такого входа-списка листов у эффекта нет` });
        else if (!loopOf(effect.params, raw)) {
          const list = effect.params?.find(p => p.key === of);
          out.push({ where: { ...where, part: 'params', key: of }, level: 'error', text: `у входа «${list?.label ?? of}» не сказано, как зовётся один из списка` });
        }
        if (called.has(id)) out.push({ where: at, level: 'error', text: 'вызываемый эффект не перебирает цели — «для каждого» по листам работает только у действия кнопкой; строки таблицы перебирать можно' });
      });
    }
    const looped = (effect.steps ?? []).findIndex(step => loopParam(step as never));
    if (looped >= 0) {
      const inside = (effect.steps ?? []).slice(looped + 1).map(step => step.id).filter((one): one is string => Boolean(one));
      for (const column of effect.returns ?? []) {
        const expr = String((column.expr as { expr?: unknown } | undefined)?.expr ?? '');
        const seen = inside.find(one => new RegExp(`[@#]${one.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u').test(expr));
        if (seen) out.push({ where: { ...where, part: 'returns', key: column.key }, level: 'error', text: `итог «${column.label ?? column.key}» смотрит на ${STEP.one} «${seen}» внутри цикла — после цикла его нет` });
      }
    }
    if (effect.bond) {
      if (!sheets.has(effect.bond.by)) out.push({ where, level: 'error', text: `держатель выдаётся листу «${effect.bond.by}», а такого входа-листа у эффекта нет` });
      const holder = system.effects[effect.bond.effect];
      if (!holder || (holder.activation ?? 'manual') !== 'passive') out.push({ where, level: 'error', text: `держит «${effect.bond.effect}» — это должен быть висящий эффект` });
      const keys = new Set((holder?.params ?? []).map(param => param.key));
      for (const key of Object.keys(effect.bond.args ?? {})) {
        if (!effect.bond.many) out.push({ where, level: 'error', text: `держатель запоминает «${key}» только при многоместном держании` });
        else if (holder && !keys.has(key)) out.push({ where, level: 'error', text: `держатель «${holder.label ?? effect.bond.effect}» не знает входа «${key}»` });
      }
    }
    if (effect.duration?.by && !sheets.has(effect.duration.by)) {
      out.push({ where, level: 'error', text: `срок считает ходы листа «${effect.duration.by}», а такого входа-листа у эффекта нет` });
    }
    for (const chain of chainsOf(id, effect)) {
      chain.steps.forEach((step, index) => {
        const words = (STEP_WORDS as Record<string, { slots?: readonly { key: string }[] }>)[step.type];
        if (!words) return;
        const known = new Set(['id', 'type', 'if', ...(words.slots ?? []).map(slot => slot.key)]);
        for (const key of Object.keys(step)) {
          if (!known.has(key)) out.push({ where: chain.where(index), level: 'error', text: `у шага «${words === undefined ? step.type : (words as { label?: string }).label ?? step.type}» нет поля «${key}»` });
        }
      });
      chain.steps.forEach((step, index) => {
        if (step.type !== 'status') return;
        const target = (step as { effect?: unknown }).effect;
        const declared = typeof target === 'string' ? system.effects[target]?.params : undefined;
        if (!declared) return;
        for (const key of Object.keys(((step as { args?: Record<string, unknown> }).args) ?? {})) {
          if (!declared.some(p => p.key === key)) out.push({ where: chain.where(index), level: 'error', text: `«${system.effects[target as string]?.label ?? target}» не объявляет входа «${key}» — запомнить нечего` });
        }
      });
    }
    for (const tag of effect.tags ?? []) {
      for (const contract of contractsOf(system, tag)) {
        for (const input of contract.inputs ?? []) {
          const param = (effect.params ?? []).find(p => p.key === input.key);
          if (!param || param.kind !== input.kind || Boolean(param.many) !== Boolean(input.many)) {
            out.push({ where, level: 'error', text: `метка «${tag}» требует вход «${input.key}» (${input.kind}${input.many ? ', список' : ''}) — у эффекта его нет или он другого вида` });
          }
        }
        const steps = effect.steps ?? [];
        const split = steps.findIndex(step => splitsTargets(step));
        if (contract.each && (split < 0 || loopOf(effect.params, steps[split] as { of?: unknown })?.key !== contract.each)) {
          out.push({ where, level: 'error', text: `метка «${tag}» требует «для каждого» с именем «${contract.each}»` });
        }
        for (const output of contract.outputs ?? []) {
          const at = steps.findIndex(step => step.id === output);
          if (at < 0 || (contract.each && at < split)) out.push({ where, level: 'error', text: `метка «${tag}» требует шаг «${output}» внутри «для каждого»` });
        }
      }
    }
    (effect.on ?? []).forEach((handler, index) => {
      const heard = listenerOf(handler);
      if (heard.kind !== 'call' || heard.phase !== 'before' || !handler.confirm) return;
      if (called.has(heard.key) && !Object.values(system.tables ?? {}).some(table => (table.bindings ?? []).some(b => b.effect === heard.key))) {
        out.push({ where: { tab: 'effects', effect: id, part: 'on', handler: index }, level: 'error', text: `«${system.effects[heard.key]?.label ?? heard.key}» вызывается внутри других эффектов — спросить игрока до него нельзя, только сработать само` });
      }
    });
  }
  for (const key of Object.keys(system.tags ?? {})) {
    if (system.effects[key]) out.push({ where: { tab: 'effects', effect: key }, level: 'error', text: `«${key}» — и метка с договором, и эффект: подписка «${key}» станет двусмысленной` });
  }
  const lists = [
    ...kindsOf(system).flatMap(([kind, spec]) => (spec.bindings ?? []).map((binding, index) => ({ binding, where: { tab: 'records' as const, kind, part: 'bindings', binding: index }, props: propKeysOf(spec) }))),
    ...recordsOf(compendium).filter(record => record.bindings?.length).flatMap(record => bindingsOf(record, system).map(binding => ({ binding, where: { tab: 'book' as const, record: record.id }, props: propKeysOf(kindOfRecord(system, record)) }))),
  ];
  for (const { binding, where, props } of lists) {
    const effect = system.effects[binding.effect];
    if (!effect) continue;
    const table = tableOf(binding, effect);
    const sheets = sheetsOf(effect);
    const fills = Object.entries(table);
    if (fills.filter(([, fill]) => fill === 'actor').length !== 1 && sheets.size) out.push({ where, level: 'error', text: `кнопка «${binding.label ?? effect.label ?? binding.effect}»: ровно один вход заполняет «кто нажал»` });
    if (fills.filter(([, fill]) => fill === 'targets').length > 1) out.push({ where, level: 'error', text: `кнопка «${binding.label ?? effect.label ?? binding.effect}»: «выбранные» заполняет не больше одного входа` });
    for (const [key, fill] of fills) {
      if (!sheets.has(key)) out.push({ where, level: 'error', text: `кнопка «${binding.label ?? effect.label ?? binding.effect}» заполняет «${key}», а такого входа-листа нет` });
      else if (fill === 'actor' && sheets.get(key)) out.push({ where, level: 'error', text: `«кто нажал» — один лист, а вход «${key}» — список` });
    }
    if (where.tab !== 'book') continue;
    const args = argsWithProps(system, binding, props) ?? {};
    for (const param of effect.params ?? []) {
      if (!isBlank(args[param.key]) || table[param.key] || param.ask || param.optional || param.default !== undefined) continue;
      out.push({ where, level: 'error', text: `кнопка «${binding.label ?? effect.label ?? binding.effect}» не заполняет вход «${param.label ?? param.key}» эффекта «${effect.label ?? binding.effect}»` });
    }
  }
  return out;
}
