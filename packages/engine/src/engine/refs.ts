import { compile } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import type { Param } from '../model/types.ts';
import type { Pass } from './calc.ts';

export interface RefContext {
  pass: Pass;

  owner?: string;

  props?: Record<string, unknown> | null;

  paramDefs?: Param[];

  params?: Record<string, unknown>;

  inputs?: Record<string, number | string>;

  results?: Record<string, unknown>;
}

const FORMS = ['const', 'expr', 'param', 'prop', 'item', 'tag', 'ref'];

type AnyRef = Record<string, unknown>;

const propKey = (ref: AnyRef): string => String('prop' in ref ? ref.prop : ref.item);

export function packRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  const r = ref as AnyRef;

  if ('const' in r) return { const: r.const };

  if ('expr' in r) {
    if ((r.of || 'sender') === 'target') {

      const names = Array.isArray(r.sender) ? r.sender : [];
      if (!names.length) return { expr: r.expr, of: 'target' };
      const sent: Record<string, unknown> = {};
      for (const name of names) sent[String(name)] = evaluate(`#${name}`, ctx);
      return { expr: r.expr, of: 'target', sent };
    }
    return { const: evaluate(r.expr, ctx) };
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

  if (decl.kind === 'expr') return packRef({ expr: value, of: decl.of }, ctx);
  if (decl.kind === 'tag') return { tag: value };
  return { const: value };
}

function fromArgs(key: string, ctx: RefContext): unknown {
  const asked = (ctx.inputs || {})[key];
  if (asked !== undefined) return asked;
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('prop' in arg) return (ctx.props || {})[String((arg as AnyRef).prop)];
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение или { prop }`);
}

export function resolveRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  const r = ref as AnyRef;

  if ('const' in r) return r.const;

  if ('expr' in r) {
    if ((r.of || 'sender') !== 'target') {
      throw new EngineError(
        `${who(ctx)}: выражение «${r.expr}» стороны отправителя пришло неразрешённым — конверт бит`);
    }
    return evaluate(r.expr, ctx, r.sent as Record<string, unknown> | undefined);
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

function evaluate(expr: unknown, ctx: RefContext, sent?: Record<string, unknown>): unknown {
  const results = ctx.results;
  const isField = (name: string) => ctx.pass.system.fields.some(f => f.tag === name);
  const resolve = (name: string) => {
    if (sent && name in sent) return sent[name];
    if (results && name in results && !isField(name)) return (results as Record<string, unknown>)[name];
    if (!isField(name)) {
      const named = namedValue(name, ctx);
      if (named !== undefined) return named;
    }
    return ctx.pass.resolve(name);
  };
  return compile(String(expr)).evaluate(resolve);
}

export function exactFieldOf(ref: unknown, ctx: RefContext): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as AnyRef;
  let text: unknown = null;
  if ('tag' in r) text = `#${String(r.tag)}`;
  else if ('expr' in r) text = r.expr;
  else if ('param' in r && ctx.params && String(r.param) in ctx.params) text = fromArgs(String(r.param), ctx);
  if (typeof text !== 'string') return null;
  const exact = /^\s*#([\p{L}\p{N}_-]+)\s*$/u.exec(text);
  return exact ? exact[1]! : null;
}

function namedValue(name: string, ctx: RefContext): unknown {
  if (ctx.inputs && name in ctx.inputs) return ctx.inputs[name];
  if (!(ctx.paramDefs || []).some(p => p.key === name)) return undefined;
  if (!ctx.params || !(name in ctx.params)) return undefined;
  const value = fromArgs(name, ctx);
  return value === null || typeof value === 'object' ? undefined : value;
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
