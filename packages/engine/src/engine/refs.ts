import { isFormulaCell, itemExpr } from '../model/sheet-columns.ts';
import { ITEM_NAME, asItem } from '../model/item-ref.ts';
import type { ItemRef } from '../model/item-ref.ts';
import { compile } from '../formula/index.ts';
import type { Tools, Value } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import { readCell } from './cells.ts';
import type { Scope } from './cells.ts';
import { rowOf } from './tables.ts';
import { referencedTable, splitPath, walk } from './navigate.ts';
import { VALUE_COLUMN, linkOf } from '../model/tables.ts';
import { diceTools } from '../core/roll.ts';
import type { Param, Die, System } from '../model/types.ts';
import type { Pass } from './calc.ts';
import { hasField } from '../model/sheet-columns.ts';
import { recordKinds } from '../model/owned.ts';
import { heldBy, propsOf, withLibrary, isBook, isUnder } from '../model/owned.ts';
import { isSingle } from '../model/sheet-columns.ts';
import { typeColumn } from '../model/inherit.ts';
import { isBlank, orDefault } from '../model/blank.ts';

export interface RefContext {
  pass: Pass;

  die?: Die;

  owner?: string;

  props?: Record<string, unknown> | null;

  item?: ItemRef;

  itemRead?: (column: string) => unknown;

  paramDefs?: Param[];

  params?: Record<string, unknown>;

  inputs?: Record<string, number | string>;

  results?: Record<string, unknown>;

  rolls?: Record<string, unknown>;

  stepIds?: ReadonlySet<string>;

  choiceOf?: (step: string, key: string) => string | undefined;


  alone?: boolean;

  recordScope?: boolean;

  sheets?: Sheets;

  bare?: boolean;

  lazy?: (name: string) => void;
}

export type Bound = string | readonly string[] | null;

export interface Sheets {
  bound: Readonly<Record<string, Bound>>;
  view: (id: string) => Pass;
}

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

export function sheetHead(name: string, sheets: Sheets | undefined): { head: string; rest: string | null } | null {
  if (!sheets) return null;
  const dot = name.indexOf('.');
  const head = dot > 0 ? name.slice(0, dot) : name;
  return hasOwn(sheets.bound, head) ? { head, rest: dot > 0 ? name.slice(dot + 1) : null } : null;
}

const DESK_NAME = 'стол';

const FORMS = ['expr'];

type AnyRef = Record<string, unknown>;

const isRow = (one: unknown): boolean => Boolean(one) && typeof one === 'object' && !Array.isArray(one);

const stepInto = (at: unknown, key: string): unknown => {
  if (Array.isArray(at) && at.every(isRow) && !/^\d+$/.test(key)) return at.map(one => stepInto(one, key));
  return at && typeof at === 'object' ? (at as AnyRef)[key] : undefined;
};

const knownOf = (ctx: RefContext): Record<string, unknown> => ({ ...(ctx.rolls ?? {}), ...(ctx.results ?? {}) });

const inRecord = (ctx: RefContext): RefContext => (ctx.props ? { ...ctx, recordScope: true } : ctx);

const isFormula = (decl: Param | undefined, value: unknown): value is string =>
  decl?.kind === 'number' && typeof value === 'string';

const isGiven = (arg: unknown): boolean => !isBlank(arg);

const nameRegex = (name: string): RegExp =>
  new RegExp(`[@#]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_.])`, 'gu');

const reading = new WeakMap<object, Set<string>>();

function fromArgs(key: string, ctx: RefContext): unknown {
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('sheet' in arg && 'tag' in arg) return arg;
  if ('expr' in arg) {
    const source = String((arg as AnyRef).expr);
    const decl = (ctx.paramDefs || []).find(p => p.key === key);
    if (!decl || decl.kind === 'number') return recordNamesInline(source, ctx);
    const busy = reading.get(arg) ?? new Set<string>();
    if (busy.has(key)) throw new EngineError(`${who(ctx)}: вход «${decl.label ?? key}» ссылается сам на себя`);
    busy.add(key);
    reading.set(arg, busy);
    try {
      return evaluate(source, inRecord(ctx));
    } finally {
      busy.delete(key);
    }
  }
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение или { expr }`);
}

export function resolveRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;
  const r = ref as AnyRef;
  if ('expr' in r) return evaluate(r.expr, ctx);
  return unknownForm(r, ctx);
}

export function holdsNow(condition: unknown, ctx: RefContext): boolean {
  if (condition === null || condition === undefined) return true;
  const value = resolveRef(condition, ctx);
  if (typeof value !== 'boolean') {
    throw new EngineError(`${who(ctx)}: условие должно давать да/нет, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

export function resolveNumber(ref: unknown, ctx: RefContext, what: string): number {
  const value = resolveRef(ref, ctx);
  if (typeof value !== 'number') {
    throw new EngineError(
      `${who(ctx)}: ${what} — не число (${describe(ref)} даёт ${value === null ? 'пусто' : typeof value})`);
  }
  return value;
}

export function resolveOptionalNumber(ref: unknown, ctx: RefContext, what: string): number | null {
  if (ref === null || ref === undefined) return null;
  const value = resolveRef(ref, ctx);
  if (value === null) return null;
  if (typeof value !== 'number') {
    throw new EngineError(
      `${who(ctx)}: ${what} — не число (${describe(ref)} даёт ${typeof value})`);
  }
  return value;
}

const isField = (system: System, name: string): boolean => hasField(system, name);

function rowsOfTable(system: System, pass: Pass, name: string, column: string, owner: string, host?: string): Value[] {
  const table = system.tables?.[name];
  if (!table) throw new EngineError(`«строки»: таблицы «${name}» нет`);
  if (!(table.columns ?? []).some(c => c.key === column)) {
    throw new EngineError(`«строки»: у таблицы «${table.label || name}» нет колонки «${column}»`);
  }
  if (isBook(table)) {
    if (!pass.compendium) throw new EngineError(`«строки»: записей «${table.label || name}» здесь не видно — книги нет`);
    return heldBy(pass.sheet, withLibrary(system, pass.compendium))
      .filter(held => isUnder(system, held.record.table, name) && (host === undefined || held.entry.in === host))
      .map(held => {
        const cells = propsOf(held.record, system, held.entry) ?? {};
        const value = cells[column];
        if (!isFormulaCell(value)) return (value ?? '') as Value;
        return evaluate(itemExpr(system, held.record.table!, cells, column, held.key), { pass, owner: `${owner}: «${held.record.label}»` }) as Value;
      });
  }
  if (isSingle(table)) return [pass.resolve(column) as Value];
  return (table.rows ?? []).map(row => readCell(system, pass, name, row.value, column, owner) as Value);
}

export function toolsOf(system: System, pass: Pass, owner: string, die?: Die): Tools {
  return {
    ...diceTools(die),
    table: (name, key, column) => {
      const read = (one: unknown) => readCell(system, pass, name, one, column ?? VALUE_COLUMN, owner);
      if (!Array.isArray(key)) return read(key) as Value;
      return key.filter(one => rowOf(system, name, one)).map(read) as unknown as Value;
    },
    rows: (name, column, host) => rowsOfTable(system, pass, name, column, owner, host),
  };
}

const ownLink = (system: System, type: unknown, column: string): string | undefined => {
  const found = typeColumn(system, typeof type === 'string' ? type : undefined, column);
  return found ? linkOf(found) : undefined;
};

const columnOfType = (system: System, type: unknown, column: string) =>
  typeColumn(system, typeof type === 'string' ? type : undefined, column);

function evaluate(expr: unknown, ctx: RefContext): unknown {
  const results = ctx.results ?? {};
  const known = knownOf(ctx);
  const system = ctx.pass.system;
  let scope: Scope | undefined;
  const resolve = (asked: string): unknown => {
    if (ctx.lazy) ctx.lazy(asked.split('.')[0]!);
    const record = Boolean(ctx.item || ctx.props);
    const name = record ? asItem(asked, ctx.paramDefs) : asked;
    if (record && name === ITEM_NAME) return ctx.item?.key ?? null;
    if (record && name.startsWith(`${ITEM_NAME}.`)) {
      const [column, ...rest] = name.slice(ITEM_NAME.length + 1).split('.') as [string, ...string[]];
      if (rest.length) {
        const link = ownLink(system, (ctx.paramDefs ?? []).find(param => param.kind === 'record' && asked !== name)?.from, column) ?? referencedTable(system, column);
        if (!link) throw new EngineError(`${who(ctx)}: «${column}» у вещи не из таблицы — «${rest.join('.')}» прочитать негде`);
        return walk(system, ctx.pass, link, resolve(`${ITEM_NAME}.${column}`), rest, who(ctx), scope);
      }
      const type = asked === name ? undefined : (ctx.paramDefs ?? []).find(param => param.kind === 'record')?.from;
      if (!ctx.props || !(column in ctx.props)) return type ? orDefault(null, columnOfType(system, type, column)) : null;
      if (ctx.itemRead) return type ? orDefault(ctx.itemRead(column), columnOfType(system, type, column)) : ctx.itemRead(column) ?? null;
      return type ? orDefault(recordValue(column, ctx), columnOfType(system, type, column)) : recordValue(column, { ...ctx, recordScope: true });
    }
    const onSheet = sheetHead(name, ctx.sheets);
    if (onSheet) {
      const bound = ctx.sheets!.bound[onSheet.head] ?? null;
      if (onSheet.rest === null) return bound;
      if (bound === null) throw new EngineError(`${who(ctx)}: «${onSheet.head}» не задан — «${onSheet.rest}» прочитать не у кого`);
      const view = ctx.sheets!.view;
      const rest = onSheet.rest;
      const split = splitPath(rest);
      const table = split && !isField(system, rest) ? referencedTable(system, split.head, ctx.paramDefs) : undefined;
      const read = (id: string): unknown => (split && table
        ? walk(system, view(id), table, (ctx.paramDefs ?? []).some(p => p.key === split.head) ? resolve(split.head) : view(id).resolve(split.head), split.path, who(ctx), scope)
        : view(id).resolve(rest));
      return Array.isArray(bound) ? bound.map(read) : read(bound as string);
    }
    if (name in results && (ctx.sheets || !isField(system, name))) return results[name];
    const dot = name.indexOf('.');
    if (dot > 0) {
      const head = name.slice(0, dot);
      if (head in results && results[head] === null) return null;
      for (const held of [known[head], ctx.rolls?.[head]]) {
        if (!held || typeof held !== 'object') continue;
        const keys = name.slice(dot + 1).split('.');
        const value = keys.reduce<unknown>(stepInto, held);
        if (value !== undefined) return value;
        const table = keys.length > 1 ? ctx.choiceOf?.(head, keys[0]!) : undefined;
        if (table) return walk(system, ctx.pass, table, stepInto(held, keys[0]!), keys.slice(1), who(ctx), scope);
      }
    }
    if (ctx.sheets || !isField(system, name)) {
      if (ctx.recordScope && ctx.props && name in ctx.props) return recordValue(name, ctx);
      if (ctx.recordScope && ctx.props && declaredProp(system, name)) return null;
      const named = namedValue(name, ctx);
      if (named !== undefined) return named;
      const split = splitPath(name);
      const table = split ? referencedTable(system, split.head, ctx.paramDefs) : undefined;
      if (split && table) return walk(system, ctx.pass, table, resolve(split.head), split.path, who(ctx), scope);
      if (ctx.stepIds?.has(split?.head ?? name)) {
        throw new EngineError(`${who(ctx)}: шаг «${split?.head ?? name}» ещё не прошёл — его результата здесь нет`);
      }
    }
    if (ctx.sheets && !ctx.bare && !name.startsWith(`${DESK_NAME}.`)) {
      throw new EngineError(`${who(ctx)}: «${name}» — чьё поле? Пишите через лист: ${Object.keys(ctx.sheets.bound).map(one => `@${one}.${name}`).join(', ') || `@носитель.${name}`}`);
    }
    return ctx.pass.resolve(name);
  };
  const tools = toolsOf(system, ctx.pass, who(ctx), ctx.die);
  if (ctx.sheets) {
    const owns = (head: string): boolean => head in results || head in (ctx.sheets?.bound ?? {}) || (ctx.paramDefs ?? []).some(param => param.key === head) || (Boolean(ctx.item) && head === ITEM_NAME);
    scope = { resolve, seen: new Set(), owns, tools: { ...tools, roll: () => { throw new EngineError(`${who(ctx)}: «кинуть» в клетке таблицы нельзя — кости бросает шаг эффекта`); } } };
  }
  return compile(String(expr)).evaluate(resolve, {
    ...tools,
    roll: tools.roll ?? (() => {
      throw new EngineError(`${who(ctx)}: «кинуть» здесь нельзя — кости бросает только шаг эффекта`);
    }),
  });
}

export function lonelyField(ref: unknown, system?: System): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as AnyRef;
  if (!('expr' in r) || typeof r.expr !== 'string') return null;
  const exact = /^\s*[@#]([\p{L}\p{N}_.-]+)\s*$/u.exec(r.expr);
  if (!exact) return null;
  const name = exact[1]!;
  return !name.includes('.') || (system && hasField(system, name)) ? name : null;
}

function namedValue(name: string, ctx: RefContext): unknown {
  const decl = (ctx.paramDefs || []).find(p => p.key === name);
  const passed = Boolean(decl) && isGiven((ctx.params || {})[name]);
  if (!passed && ctx.inputs && name in ctx.inputs) {
    const answer = ctx.inputs[name];
    return decl?.kind === 'boolean' && (answer === 'да' || answer === 'нет') ? answer === 'да' : answer;
  }
  if (!decl) return undefined;
  const value = ctx.params && name in ctx.params ? fromArgs(name, ctx) : undefined;
  if (Array.isArray(value)) return value;
  if (isBlank(value)) {
    if (decl.default !== undefined) return decl.default;
    if (decl.optional) return null;
    throw new EngineError(`${who(ctx)}: параметр «${name}» не заполнен`);
  }
  if (decl.kind === 'field' && typeof value === 'object' && value !== null && 'sheet' in value && 'tag' in value) {
    const field = value as { sheet: string; tag: string };
    return (ctx.sheets ? ctx.sheets.view(field.sheet) : ctx.pass).resolve(field.tag);
  }
  if (typeof value === 'object') return undefined;
  if (!isFormula(decl, value)) return value;
  const out = evaluate(value, inRecord(ctx));
  return isBlank(out) && decl.default !== undefined ? decl.default : out;
}

function recordNamesInline(expr: string, ctx: RefContext): string {
  if (!ctx.props) return expr;
  const props = ctx.props;
  const text = (name: string): string => {
    const value = props[name];
    return isFormulaCell(value) ? value.expr : JSON.stringify(value ?? null);
  };
  const lone = /^\s*[@#]([\p{L}\p{N}_]+)\s*$/u.exec(expr);
  if (lone && lone[1]! in props) return text(lone[1]!);
  let out = expr;
  for (const name of compile(expr).deps) {
    if (!(name in props)) continue;
    out = out.replace(nameRegex(name), `(${text(name)})`);
  }
  return out;
}

const declaredProp = (system: System, name: string): boolean =>
  recordKinds(system).some(([, kind]) => (kind.columns ?? []).some(prop => prop.key === name));

function recordValue(name: string, ctx: RefContext): unknown {
  const value = ctx.props![name];
  return isFormulaCell(value) ? evaluate(value.expr, ctx) : value;
}

function who(ctx: RefContext): string {
  return ctx.owner || 'правило';
}

function describe(ref: unknown): string {
  if (ref === null || typeof ref !== 'object') return JSON.stringify(ref);
  const form = FORMS.find(f => f in (ref as AnyRef));
  return form ? `«${(ref as AnyRef)[form]}»` : JSON.stringify(ref);
}

function unknownForm(ref: unknown, ctx: RefContext): never {
  throw new EngineError(
    `${who(ctx)}: ссылка неизвестной формы ${JSON.stringify(ref)} — умею ${FORMS.join(', ')}`);
}
