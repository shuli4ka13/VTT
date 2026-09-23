import { compile } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import { readCell } from './cells.ts';
import { referencedTable, splitPath, walk } from './navigate.ts';
import { VALUE_COLUMN } from '../model/tables.ts';
import { ownerOf, RECEIVER, SENDER, DESK } from './owners.ts';
import { rollNotation, multiplyNotation } from './dice.ts';
import type { Param, Die } from '../model/types.ts';
import type { Pass } from './calc.ts';

export interface RefContext {
  pass: Pass;

  die?: Die;

  owner?: string;

  props?: Record<string, unknown> | null;

  paramDefs?: Param[];

  params?: Record<string, unknown>;

  inputs?: Record<string, number | string>;

  results?: Record<string, unknown>;

  atReceiver?: boolean;

  alone?: boolean;
}

const FORMS = ['const', 'expr', 'param', 'prop', 'item', 'tag', 'ref', 'table'];

type AnyRef = Record<string, unknown>;

const propKey = (ref: AnyRef): string => String('prop' in ref ? ref.prop : ref.item);

export function packRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  const r = ref as AnyRef;

  if ('const' in r) return { const: r.const };

  if ('expr' in r) {
    const expr = withReceiverInputs(String(r.expr), ctx);
    const deps = compile(expr).deps;
    if (deps.some(name => ownerOf(name)?.owner === RECEIVER)) {
      if (ctx.alone) {
        const name = deps.find(dep => ownerOf(dep)?.owner === RECEIVER)!;
        throw new EngineError(`${who(ctx)}: «${ownerOf(name)!.rest}» получателя — но в шагах отправителя получателя нет, они идут один раз до всех целей`);
      }
      const sent: Record<string, unknown> = {};
      for (const name of deps) {
        if (ownerOf(name)?.owner === RECEIVER) continue;
        const known = senderValue(name, ctx);
        if (known !== undefined) sent[name] = known;
      }
      return { expr, of: 'target', ...(Object.keys(sent).length ? { sent } : {}) };
    }
    if (waitsForStep(expr, ctx)) {
      const sent: Record<string, unknown> = {};
      for (const name of deps) {
        if (name.includes('.') && !ownerOf(name)) continue;
        const known = senderValue(name, ctx);
        if (known !== undefined) sent[name] = known;
      }
      return { expr, later: true, ...(Object.keys(sent).length ? { sent } : {}) };
    }
    return { const: evaluate(expr, ctx) };
  }

  if ('param' in r) return packParam(String(r.param), Boolean(r.optional), ctx);

  if ('prop' in r || 'item' in r) {
    const key = propKey(r);
    if (!ctx.props) {
      if (r.optional) return { const: null };
      throw new EngineError(
        `${who(ctx)}: неоткуда взять свойство «${key}» — у источника нет записи со свойствами`);
    }
    if (ctx.props[key] === undefined) {
      if (r.optional) return { const: null };
      throw new EngineError(
        `${who(ctx)}: запись-источник не заполнила свойство «${key}»`);
    }
    return { const: ctx.props[key] };
  }

  if ('table' in r) {
    const packed = packRef((r as { by?: unknown }).by, ctx);
    const ready = packed && typeof packed === 'object' && 'const' in (packed as AnyRef);
    return ready
      ? { const: readCell(ctx.pass.system, ctx.pass, String(r.table), (packed as AnyRef).const, columnOf(r), who(ctx)) }
      : { table: r.table, by: packed, ...(r.column ? { column: r.column } : {}) };
  }

  if ('tag' in r) return { tag: r.tag };
  if ('ref' in r) {
    const head = String(r.ref).split('.')[0] ?? '';
    if (ctx.results && head in ctx.results) return { const: resolveRef(r, ctx) };
    return { ref: r.ref };
  }

  return unknownForm(r, ctx);
}

function packParam(key: string, optional: boolean, ctx: RefContext): unknown {
  const decl = (ctx.paramDefs || []).find(p => p.key === key);
  if (!decl) {
    throw new EngineError(`${who(ctx)}: эффект не объявляет параметра «${key}»`);
  }
  const value = fromArgs(key, ctx);
  if (value === undefined || value === '' || value === null) {
    if (optional) return { const: null };
    throw new EngineError(`${who(ctx)}: параметр «${key}» не заполнен`);
  }

  if (isFormula(decl, value)) return packRef({ expr: value }, ctx);
  return { const: value };
}

const isFormula = (decl: Param | undefined, value: unknown): value is string =>
  decl?.kind === 'number' && typeof value === 'string';

const MAX_INPUT_DEPTH = 8;

const readsReceiver = (expr: string): boolean =>
  compile(expr).deps.some(name => ownerOf(name)?.owner === RECEIVER);

function withReceiverInputs(expr: string, ctx: RefContext, depth = 0): string {
  if (depth > MAX_INPUT_DEPTH) {
    throw new EngineError(`${who(ctx)}: входы-формулы ссылаются друг на друга по кругу`);
  }
  let out = expr;
  for (const name of compile(expr).deps) {
    if (ownerOf(name)) continue;
    const decl = (ctx.paramDefs || []).find(p => p.key === name);
    if (!decl || !ctx.params || !(name in ctx.params)) continue;
    const value = fromArgs(name, ctx);
    if (!isFormula(decl, value) || !readsReceiver(value)) continue;
    const inner = withReceiverInputs(value, ctx, depth + 1);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`[@#]${escaped}(?![\\p{L}\\p{N}_.])`, 'gu'), `(${inner})`);
  }
  return out;
}

const columnOf = (r: AnyRef): string => (typeof r.column === 'string' && r.column ? r.column : VALUE_COLUMN);

function fromArgs(key: string, ctx: RefContext): unknown {
  const asked = (ctx.inputs || {})[key];
  if (asked !== undefined) return asked;
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('prop' in arg) return (ctx.props || {})[String((arg as AnyRef).prop)];
  if ('const' in arg) return (arg as AnyRef).const;
  if ('table' in arg) {
    const by = (arg as AnyRef).by;
    const input = by && typeof by === 'object' && 'prop' in (by as AnyRef)
      ? (ctx.props || {})[String((by as AnyRef).prop)]
      : resolveRef(by, ctx);
    return readCell(ctx.pass.system, ctx.pass, String((arg as AnyRef).table), input, columnOf(arg as AnyRef), who(ctx));
  }
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение, { const }, { prop } или { table }`);
}

export function resolveRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  const r = ref as AnyRef;

  if ('const' in r) return r.const;

  if ('expr' in r) {
    if (r.later) return evaluate(r.expr, ctx, r.sent as Record<string, unknown> | undefined, true);
    if ((r.of || 'sender') !== 'target') {
      throw new EngineError(
        `${who(ctx)}: выражение «${r.expr}» стороны отправителя пришло неразрешённым — конверт бит`);
    }
    return evaluate(r.expr, ctx, r.sent as Record<string, unknown> | undefined, true);
  }

  if ('table' in r) {
    const by = resolveRef((r as { by?: unknown }).by, ctx);
    return readCell(ctx.pass.system, ctx.pass, String(r.table), by, columnOf(r), who(ctx));
  }


  if ('param' in r) {
    throw new EngineError(
      `${who(ctx)}: параметр «${r.param}» не был упакован отправителем — конверт бит`);
  }

  if ('prop' in r || 'item' in r) {
    throw new EngineError(
      `${who(ctx)}: свойство записи «${propKey(r)}» пришло неразрешённым — конверт бит`);
  }

  if ('tag' in r) return ctx.pass.resolve(String(r.tag));

  if ('ref' in r) {
    const [head, ...path] = String(r.ref).split('.');
    if (head === undefined) throw new EngineError(`${who(ctx)}: пустая ссылка на шаг`);
    if (!(head in (ctx.results || {}))) {
      throw new EngineError(
        `${who(ctx)}: шаг «${head}» результата не оставил — он вообще был раньше по цепочке?`);
    }
    let value: unknown = (ctx.results || {})[head];
    for (const key of path) {
      if (value === null || typeof value !== 'object' || !(key in value)) {
        throw new EngineError(`${who(ctx)}: у результата шага «${head}» нет «${path.join('.')}»`);
      }
      value = (value as AnyRef)[key];
    }
    return value;
  }

  return unknownForm(r, ctx);
}

export function resolveNumber(ref: unknown, ctx: RefContext, what: string): number {
  const value = resolveRef(ref, ctx);
  if (typeof value !== 'number') {
    throw new EngineError(
      `${who(ctx)}: ${what} — не число (${describe(ref)} даёт ${typeof value})`);
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

function waitsForStep(expr: string, ctx: RefContext): boolean {
  const fields = ctx.pass.system.fields;
  return compile(expr).deps.some(name => {
    if (ownerOf(name)) return false;
    const dot = name.indexOf('.');
    if (dot <= 0) return false;
    if (fields.some(field => field.tag === name)) return false;
    if (referencedTable(ctx.pass.system, name.slice(0, dot), ctx.paramDefs)) return false;
    const held = (ctx.results ?? {})[name.slice(0, dot)];
    return held === undefined || typeof held !== 'object';
  });
}

function evaluate(expr: unknown, ctx: RefContext, sent?: Record<string, unknown>, atReceiver = false): unknown {
  const results = ctx.results;
  const isField = (name: string) => ctx.pass.system.fields.some(f => f.tag === name);
  const resolve = (name: string): unknown => {
    if (sent && name in sent) return sent[name];
    const owned = ownerOf(name);
    if (owned && (atReceiver || ctx.atReceiver) && owned.owner === SENDER) {
      throw new EngineError(`${who(ctx)}: «${owned.rest}» отправителя не пришло в сообщении — отправитель должен был посчитать его у себя`);
    }
    if (owned?.owner === RECEIVER && !(atReceiver || ctx.atReceiver)) {
      throw new EngineError(`${who(ctx)}: «${owned.rest}» получателя здесь не прочитать — его считает получатель, у себя`);
    }
    if (owned?.owner === DESK) return ctx.pass.resolve(name);
    if (owned) return resolve(owned.rest);
    if (results && name in results && !isField(name)) return (results as Record<string, unknown>)[name];
    const dot = name.indexOf('.');
    if (dot > 0 && results) {
      const head = name.slice(0, dot);
      const held = (results as Record<string, unknown>)[head];
      if (held && typeof held === 'object') {
        const value = (held as Record<string, unknown>)[name.slice(dot + 1)];
        if (value !== undefined) return value;
      }
    }
    if (!isField(name)) {
      const named = namedValue(name, ctx);
      if (named !== undefined) return named;
      const split = splitPath(name);
      const table = split ? referencedTable(ctx.pass.system, split.head, ctx.paramDefs) : undefined;
      if (split && table) return walk(ctx.pass.system, ctx.pass, table, resolve(split.head), split.path, who(ctx));
    }
    return ctx.pass.resolve(name);
  };
  return compile(String(expr)).evaluate(resolve, {
    roll: (notation, times) => {
      if (!ctx.die) {
        throw new EngineError(`${who(ctx)}: «кинуть» здесь нельзя — кости бросает только шаг эффекта`);
      }
      const written = times > 1 ? multiplyNotation(notation, times) : notation;
      return rollNotation(written, ctx.die).total;
    },
  });
}

export function exactFieldOf(ref: unknown, ctx: RefContext): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as AnyRef;
  let text: unknown = null;
  if ('tag' in r) text = `@${String(r.tag)}`;
  else if ('expr' in r) text = r.expr;
  else if ('param' in r && ctx.params && String(r.param) in ctx.params) text = fromArgs(String(r.param), ctx);
  if (typeof text !== 'string') return null;
  const exact = /^\s*[@#]([\p{L}\p{N}_.-]+)\s*$/u.exec(text);
  if (!exact) return null;
  const owned = ownerOf(exact[1]!);
  if (owned) return owned.rest;
  return exact[1]!.includes('.') ? null : exact[1]!;
}

function senderValue(name: string, ctx: RefContext): unknown {
  if ((ctx.paramDefs || []).some(p => p.key === name)) {
    try {
      const packed = packParam(name, true, ctx);
      if (packed && typeof packed === 'object' && 'const' in (packed as AnyRef)) {
        return (packed as AnyRef).const;
      }
    } catch { /* потребность посчитает получатель */ }
  }
  try {
    return evaluate(`@${name}`, ctx);
  } catch {
    return undefined;
  }
}

function namedValue(name: string, ctx: RefContext): unknown {
  if (ctx.inputs && name in ctx.inputs) return ctx.inputs[name];

  const decl = (ctx.paramDefs || []).find(p => p.key === name);
  if (!decl) return undefined;
  if (!ctx.params || !(name in ctx.params)) return undefined;
  const value = fromArgs(name, ctx);
  if (Array.isArray(value)) return value;
  if (value === null || typeof value === 'object') return undefined;
  return isFormula(decl, value) ? evaluate(value, ctx) : value;
}

function who(ctx: RefContext): string {
  return ctx.owner || 'правило';
}

function describe(ref: unknown): string {
  if (ref === null || typeof ref !== 'object') return JSON.stringify(ref);
  const form = FORMS.find(f => f in (ref as AnyRef));
  return form ? `«${form}: ${(ref as AnyRef)[form]}»` : JSON.stringify(ref);
}

function unknownForm(ref: unknown, ctx: RefContext): never {
  throw new EngineError(
    `${who(ctx)}: ссылка неизвестной формы ${JSON.stringify(ref)} — умею ${FORMS.join(', ')}`);
}
