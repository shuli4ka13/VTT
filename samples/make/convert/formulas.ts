import { compile } from '../../../packages/engine/src/formula/index.ts';

type Loose = Record<string, any>;

export type Lane = 'target' | 'self';

const VALUE_SLOTS: Record<string, string[]> = {
  threshold: ['roll.bonus', 'versus', 'versus.roll.bonus'],
  compare: ['value', 'versus'],
  amount: ['bonus', 'fixed', 'margin', 'scale.times'],
  apply: ['value'],
  status: ['carry'],
  table: ['value'],
  emit: ['amount'],
};

const GUARD_SLOTS: Record<string, [string, Lane | null][]> = {
  amount: [['double', 'self'], ['scale.when', null]],
};

const text = (value: unknown): string => {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  const raw = String(value);
  return raw.includes('"') ? `'${raw}'` : `"${raw}"`;
};

const fieldName = (tag: string, lane: Lane): string => (lane === 'target' ? `@получатель.${tag}` : `@${tag}`);

const checked = (expr: string, where: string): string => {
  try { compile(expr); } catch (err) { throw new Error(`${where}: «${expr}» не разбирается — ${(err as Error).message}`, { cause: err }); }
  return expr;
};

export function valueText(ref: unknown, lane: Lane, where: string): string | null {
  if (ref === null || ref === undefined) return null;
  if (typeof ref !== 'object') return text(ref);
  const r = ref as Loose;
  if ('expr' in r) return String(r.expr);
  if ('const' in r) return r.const === null || r.const === undefined ? null : text(r.const);
  if ('tag' in r) return fieldName(String(r.tag), lane);
  if ('param' in r) return `@${String(r.param)}`;
  if ('prop' in r) return `@${String(r.prop)}`;
  if ('item' in r) return `@${String(r.item)}`;
  if ('ref' in r) return `@${String(r.ref)}`;
  if ('table' in r) {
    const by = valueText(r.by, lane, where);
    const column = r.column && r.column !== 'value' ? `, ${text(r.column)}` : '';
    return `таблица(${text(r.table)}, ${by}${column})`;
  }
  throw new Error(`${where}: неизвестная форма ${JSON.stringify(ref)}`);
}

const isNew = (ref: unknown): boolean =>
  !!ref && typeof ref === 'object' && Object.keys(ref as object).length === 1 && 'expr' in (ref as object);

function toFormula(ref: unknown, lane: Lane, where: string): Loose | undefined {
  if (isNew(ref)) return ref as Loose;
  const expr = valueText(ref, lane, where);
  return expr === null ? undefined : { expr: checked(expr, where) };
}

const limitText = (limit: unknown, lane: Lane, where: string): string =>
  (limit && typeof limit === 'object' ? valueText(limit, lane, where)! : text(limit));

export function guardText(guard: unknown, lane: Lane, where: string): string | null {
  if (guard === null || guard === undefined) return null;
  const g = guard as Loose;
  if ('expr' in g) return String(g.expr);
  if ('const' in g) return g.const ? 'да' : 'нет';
  if (!('ref' in g)) throw new Error(`${where}: условие неизвестной формы ${JSON.stringify(guard)}`);
  const name = `@${String(g.ref)}`;
  const parts: string[] = [];
  let negate = Boolean(g.not);
  if (g.is !== undefined) {
    parts.push(`${name} ${negate ? '!=' : '=='} ${text(g.is)}`);
    negate = false;
  }
  if (g.atLeast !== undefined) parts.push(`${name} >= ${limitText(g.atLeast, lane, where)}`);
  if (g.atMost !== undefined) parts.push(`${name} <= ${limitText(g.atMost, lane, where)}`);
  if (g.has !== undefined) parts.push(`есть(${name}, ${text(g.has)})`);
  if (g.where) parts.push(`есть(таблица(${text(g.where.table)}, ${name}, ${text(g.where.column)}), ${text(g.where.is)})`);
  if (!parts.length) parts.push(name);
  const joined = parts.length > 1 ? `все(${parts.join(', ')})` : parts[0]!;
  return negate ? `не(${joined})` : joined;
}

function toGuard(guard: unknown, lane: Lane, where: string): Loose | undefined {
  if (isNew(guard)) return guard as Loose;
  const expr = guardText(guard, lane, where);
  return expr === null ? undefined : { expr: checked(expr, where) };
}

const readPath = (node: Loose, path: string[]): unknown =>
  path.reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Loose)[key] : undefined), node);

function writePath(node: Loose, path: string[], value: unknown): void {
  const parent = readPath(node, path.slice(0, -1)) as Loose | undefined;
  if (!parent || typeof parent !== 'object') return;
  const key = path.at(-1)!;
  if (value === undefined) delete parent[key];
  else parent[key] = value;
}

const isRollSpec = (value: unknown): boolean => !!value && typeof value === 'object' && 'roll' in (value as object);

function convertStep(step: Loose, lane: Lane, where: string): void {
  for (const slot of VALUE_SLOTS[step.type] ?? []) {
    const path = slot.split('.');
    if (slot === 'versus' && isRollSpec(step.versus)) continue;
    const value = readPath(step, path);
    if (value === undefined) continue;
    writePath(step, path, toFormula(value, lane, `${where} · ${slot}`));
  }
  for (const [slot, own] of GUARD_SLOTS[step.type] ?? []) {
    const path = slot.split('.');
    const value = readPath(step, path);
    if (value === undefined) continue;
    writePath(step, path, toGuard(value, own ?? lane, `${where} · ${slot}`));
  }
  if (step.type === 'amount' && step.count !== undefined) {
    step.count = toFormula(step.count, 'self', `${where} · count`);
    if (step.count === undefined) delete step.count;
  }
  if (step.type === 'emit' && step.args && typeof step.args === 'object') {
    for (const [key, arg] of Object.entries(step.args as Loose)) {
      if (arg && typeof arg === 'object' && ('ref' in arg || 'tag' in arg || 'item' in arg || 'table' in arg)) {
        step.args[key] = toFormula(arg, lane, `${where} · аргумент ${key}`);
      }
    }
  }
  if (step.when !== undefined) {
    const when = toGuard(step.when, lane, `${where} · условие`);
    if (when) step.when = when; else delete step.when;
  }
}

const convertChain = (steps: unknown, lane: Lane, where: string): void => {
  if (!Array.isArray(steps)) return;
  steps.forEach((step, index) => convertStep(step as Loose, lane, `${where} · шаг ${step?.id ?? index}`));
};

function convertEffect(id: string, effect: Loose): void {
  convertChain(effect.steps, 'target', id);
  convertChain(effect.self, 'self', `${id} · со мной`);
  convertChain(effect.attach, 'self', `${id} · при наложении`);
  convertChain(effect.detach, 'self', `${id} · при спадании`);
  (effect.on ?? []).forEach((handler: Loose, index: number) => {
    const where = `${id} · когда ${index}`;
    convertChain(handler.steps, handler.to === 'other' ? 'target' : 'self', where);
    convertChain(handler.self, 'self', `${where} · со мной`);
    if (handler.if !== undefined && handler.if !== null) {
      const guard = toGuard(handler.if, 'self', `${where} · только если`);
      if (guard) handler.if = guard; else delete handler.if;
    }
  });
}

function convertArgs(args: unknown, where: string): void {
  if (!args || typeof args !== 'object') return;
  for (const [key, arg] of Object.entries(args as Loose)) {
    if (arg && typeof arg === 'object' && ('table' in arg || 'item' in arg || 'ref' in arg || 'tag' in arg)) {
      (args as Loose)[key] = toFormula(arg, 'self', `${where} · ${key}`);
    }
  }
}

export function formulasOf<T extends { system: Loose; compendium?: Loose }>(world: T): T {
  const next = JSON.parse(JSON.stringify(world)) as T;
  const { system, compendium } = next;
  for (const field of system.fields ?? []) {
    const value = field.value;
    if (value?.kind === 'table') {
      const column = value.column && value.column !== 'value' ? `, ${text(value.column)}` : '';
      field.value = { kind: 'formula', expr: checked(`таблица(${text(value.table)}, ${value.arg}${column})`, `поле ${field.tag}`) };
    }
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) convertEffect(id, effect as Loose);
  for (const constant of Object.values(system.constants ?? {}) as Loose[]) {
    for (const term of constant.dice ?? []) {
      if (term.count && typeof term.count === 'object') term.count = toFormula(term.count, 'self', 'кость');
    }
  }
  if (system.initiative?.bonus) system.initiative.bonus = toFormula(system.initiative.bonus, 'self', 'инициатива');
  for (const [key, kind] of Object.entries(system.records ?? {}) as [string, Loose][]) {
    (kind.bindings ?? []).forEach((binding: Loose, index: number) => convertArgs(binding.args, `${key} · привязка ${index}`));
  }
  for (const list of [compendium?.items ?? [], compendium?.actions ?? []]) {
    for (const record of list as Loose[]) {
      (record.activities ?? []).forEach((binding: Loose, index: number) => convertArgs(binding.args, `${record.id} · действие ${index}`));
      convertArgs(record.args, record.id);
    }
  }
  return next;
}
