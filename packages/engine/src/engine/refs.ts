import { dieText } from './lead-die.ts';
import { compile } from '../formula/index.ts';
import type { Tools, Value } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import { readCell } from './cells.ts';
import { rowOf } from './tables.ts';
import { referencedTable, splitPath, walk } from './navigate.ts';
import { VALUE_COLUMN } from '../model/tables.ts';
import { ownerOf, SENDER, DESK } from './owners.ts';
import { diceTools } from '../core/roll.ts';
import type { Param, Die, System } from '../model/types.ts';
import type { Pass } from './calc.ts';
import { hasField } from '../model/sheet-columns.ts';
import { recordKinds } from '../model/owned.ts';
import { heldBy, propsOf, withLibrary, isBook } from '../model/owned.ts';
import { isSingle } from '../model/sheet-columns.ts';

export interface RefContext {
  pass: Pass;

  die?: Die;

  owner?: string;

  props?: Record<string, unknown> | null;

  paramDefs?: Param[];

  params?: Record<string, unknown>;

  inputs?: Record<string, number | string>;

  results?: Record<string, unknown>;

  sender?: Record<string, unknown>;

  stepIds?: ReadonlySet<string>;


  alone?: boolean;

  recordScope?: boolean;

  direct?: { me: Pass; target: Pass | null; names?: Pass };
}

const FORMS = ['expr', 'const', 'param', 'prop', 'tag', 'constant'];

type AnyRef = Record<string, unknown>;

const isRow = (one: unknown): boolean => Boolean(one) && typeof one === 'object' && !Array.isArray(one);

const stepInto = (at: unknown, key: string): unknown => {
  if (Array.isArray(at) && at.every(isRow) && !/^\d+$/.test(key)) return at.map(one => stepInto(one, key));
  return at && typeof at === 'object' ? (at as AnyRef)[key] : undefined;
};

const knownOf = (ctx: RefContext): Record<string, unknown> => ({ ...(ctx.sender ?? {}), ...(ctx.results ?? {}) });

function paramValue(key: string, optional: boolean, ctx: RefContext): unknown {
  const decl = (ctx.paramDefs || []).find(p => p.key === key);
  if (!decl) {
    throw new EngineError(`${who(ctx)}: эффект не объявляет параметра «${key}»`);
  }
  const value = fromArgs(key, ctx);
  if (value === undefined || value === '' || value === null) {
    if (optional) return null;
    throw new EngineError(`${who(ctx)}: параметр «${key}» не заполнен`);
  }

  if (isFormula(decl, value)) return evaluate(value, inRecord(ctx));
  return value;
}

const inRecord = (ctx: RefContext): RefContext => (ctx.props ? { ...ctx, recordScope: true } : ctx);

function propValue(key: string, optional: boolean, ctx: RefContext): unknown {
  if (!ctx.props) {
    if (optional) return null;
    throw new EngineError(
      `${who(ctx)}: неоткуда взять свойство «${key}» — у источника нет записи со свойствами`);
  }
  if (ctx.props[key] === undefined) {
    if (optional) return null;
    throw new EngineError(
      `${who(ctx)}: запись-источник не заполнила свойство «${key}»`);
  }
  return ctx.props[key];
}

const isFormula = (decl: Param | undefined, value: unknown): value is string =>
  decl?.kind === 'number' && typeof value === 'string';

const nameRegex = (name: string): RegExp =>
  new RegExp(`[@#]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_.])`, 'gu');

function fromArgs(key: string, ctx: RefContext): unknown {
  const asked = (ctx.inputs || {})[key];
  if (asked !== undefined) return asked;
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('prop' in arg) return (ctx.props || {})[String((arg as AnyRef).prop)];
  if ('const' in arg) return (arg as AnyRef).const;
  if ('expr' in arg) {
    const source = String((arg as AnyRef).expr);
    const decl = (ctx.paramDefs || []).find(p => p.key === key);
    if (decl?.kind === 'tag') return lonelyField(arg, ctx.pass.system) ?? evaluate(source, inRecord(ctx));
    return !decl || decl.kind === 'number' ? recordNamesInline(source, ctx) : evaluate(source, inRecord(ctx));
  }
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение, { const }, { prop } или { expr }`);
}

export function resolveRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;
  const r = ref as AnyRef;
  if ('const' in r) return r.const;
  if ('expr' in r) return evaluate(r.expr, ctx);
  if ('param' in r) return paramValue(String(r.param), Boolean(r.optional), ctx);
  if ('prop' in r) return propValue(String(r.prop), Boolean(r.optional), ctx);
  if ('tag' in r) return ctx.pass.resolve(String(r.tag));
  if ('constant' in r) return dieText(ctx.pass.system, String(r.constant));
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

function rowsOfTable(system: System, pass: Pass, name: string, column: string, owner: string): Value[] {
  const table = system.tables?.[name];
  if (!table) throw new EngineError(`«строки»: таблицы «${name}» нет`);
  if (!(table.columns ?? []).some(c => c.key === column)) {
    throw new EngineError(`«строки»: у таблицы «${table.label || name}» нет колонки «${column}»`);
  }
  if (isBook(table)) {
    if (!pass.compendium) throw new EngineError(`«строки»: записей «${table.label || name}» здесь не видно — книги нет`);
    return heldBy(pass.sheet, withLibrary(system, pass.compendium))
      .filter(held => held.record.table === name)
      .map(held => (propsOf(held.record, system, held.entry)?.[column] ?? '') as Value);
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
    rows: (name, column) => rowsOfTable(system, pass, name, column, owner),
  };
}

function evaluate(expr: unknown, given: RefContext): unknown {
  const ctx = given.direct?.names ? { ...given, pass: given.direct.names, direct: { ...given.direct, names: undefined } } : given;
  const results = ctx.results ?? {};
  const known = knownOf(ctx);
  const system = ctx.pass.system;
  const resolve = (name: string): unknown => {
    const owned = ownerOf(name);
    if (ctx.direct && owned && owned.owner !== DESK) {
      const pass = owned.owner === SENDER ? ctx.direct.me : ctx.direct.target;
      if (!pass) throw new EngineError(`${who(ctx)}: «${owned.rest}» получателя здесь не прочитать — у этого вызова нет цели`);
      return evaluate(`@${owned.rest}`, { ...ctx, pass });
    }
    if (owned?.owner === DESK) return ctx.pass.resolve(name);
    if (owned) return resolve(owned.rest);
    if (name in results && !isField(system, name)) return results[name];
    const dot = name.indexOf('.');
    if (dot > 0) {
      const head = name.slice(0, dot);
      for (const held of [known[head], ctx.sender?.[head]]) {
        if (!held || typeof held !== 'object') continue;
        const value = name.slice(dot + 1).split('.')
          .reduce<unknown>(stepInto, held);
        if (value !== undefined) return value;
      }
    }
    if (!isField(system, name)) {
      if (ctx.recordScope && ctx.props && name in ctx.props) return recordValue(name, ctx);
      if (ctx.recordScope && ctx.props && declaredProp(system, name)) return null;
      const named = namedValue(name, ctx);
      if (named !== undefined) return named;
      const split = splitPath(name);
      const table = split ? referencedTable(system, split.head, ctx.paramDefs) : undefined;
      if (split && table) return walk(system, ctx.pass, table, resolve(split.head), split.path, who(ctx));
      if (ctx.stepIds?.has(split?.head ?? name)) {
        throw new EngineError(`${who(ctx)}: шаг «${split?.head ?? name}» ещё не прошёл — его результата здесь нет`);
      }
    }
    return ctx.pass.resolve(name);
  };
  const tools = toolsOf(system, ctx.pass, who(ctx), ctx.die);
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
  if ('tag' in r) return String(r.tag);
  if (!('expr' in r) || typeof r.expr !== 'string') return null;
  const exact = /^\s*[@#]([\p{L}\p{N}_.-]+)\s*$/u.exec(r.expr);
  if (!exact) return null;
  const owned = ownerOf(exact[1]!);
  const name = owned ? owned.rest : exact[1]!;
  return !name.includes('.') || (system && hasField(system, name)) ? name : null;
}

function namedValue(name: string, ctx: RefContext): unknown {
  if (ctx.inputs && name in ctx.inputs) return ctx.inputs[name];

  const decl = (ctx.paramDefs || []).find(p => p.key === name);
  if (!decl) return undefined;
  const value = ctx.params && name in ctx.params ? fromArgs(name, ctx) : undefined;
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') {
    if (decl.optional) return null;
    throw new EngineError(`${who(ctx)}: параметр «${name}» не заполнен`);
  }
  if (typeof value === 'object') return undefined;
  if (decl.kind === 'tag' && typeof value === 'string') return ctx.pass.resolve(value);
  return isFormula(decl, value) ? evaluate(value, inRecord(ctx)) : value;
}

function recordNamesInline(expr: string, ctx: RefContext): string {
  if (!ctx.props) return expr;
  const props = ctx.props;
  const text = (name: string): string => {
    const value = props[name];
    const formula = typeof value === 'string' && recordKinds(ctx.pass.system)
      .some(([, kind]) => (kind.columns ?? []).some(prop => prop.key === name && prop.kind === 'expr'));
    return formula ? String(value) : JSON.stringify(value ?? null);
  };
  const lone = /^\s*[@#]([\p{L}\p{N}_]+)\s*$/u.exec(expr);
  if (lone && lone[1]! in props) return text(lone[1]!);
  let out = expr;
  for (const name of compile(expr).deps) {
    if (ownerOf(name) || !(name in props)) continue;
    out = out.replace(nameRegex(name), `(${text(name)})`);
  }
  return out;
}

const declaredProp = (system: System, name: string): boolean =>
  recordKinds(system).some(([, kind]) => (kind.columns ?? []).some(prop => prop.key === name));

function recordValue(name: string, ctx: RefContext): unknown {
  const value = ctx.props![name];
  const formula = recordKinds(ctx.pass.system)
      .some(([, kind]) => (kind.columns ?? []).some(prop => prop.key === name && prop.kind === 'expr'));
  return formula && typeof value === 'string' ? evaluate(value, ctx) : value;
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
