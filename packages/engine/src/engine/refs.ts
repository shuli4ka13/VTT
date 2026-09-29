import { dieText } from './lead-die.ts';
import { compile } from '../formula/index.ts';
import type { Tools, Value } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import { readCell } from './cells.ts';
import { rowOf } from './tables.ts';
import { referencedTable, splitPath, walk } from './navigate.ts';
import { VALUE_COLUMN } from '../model/tables.ts';
import { ownerOf, RECEIVER, SENDER, DESK } from './owners.ts';
import { rollNotation, multiplyNotation } from './dice.ts';
import type { Param, Die, System } from '../model/types.ts';
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

  sender?: Record<string, unknown>;

  stepIds?: ReadonlySet<string>;

  atReceiver?: boolean;

  alone?: boolean;

  recordScope?: boolean;
}

const FORMS = ['expr', 'const', 'param', 'prop', 'tag', 'constant'];

type AnyRef = Record<string, unknown>;

const knownOf = (ctx: RefContext): Record<string, unknown> => ({ ...(ctx.sender ?? {}), ...(ctx.results ?? {}) });

export function packRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  const r = ref as AnyRef;

  if ('const' in r) return { const: r.const };
  if ('expr' in r) return packExpr(String(r.expr), ctx);
  if ('param' in r) return packParam(String(r.param), Boolean(r.optional), ctx);
  if ('prop' in r) return packProp(String(r.prop), Boolean(r.optional), ctx);
  if ('tag' in r) return { tag: r.tag };
  if ('constant' in r) return { const: dieText(ctx.pass.system, String(r.constant)) };

  return unknownForm(r, ctx);
}

function packExpr(source: string, ctx: RefContext): unknown {
  const expr = withReceiverInputs(source, ctx);
  const deps = compile(expr).deps;
  if (deps.some(name => ownerOf(name)?.owner === RECEIVER)) {
    if (ctx.alone) {
      const name = deps.find(dep => ownerOf(dep)?.owner === RECEIVER)!;
      throw new EngineError(`${who(ctx)}: «${ownerOf(name)!.rest}» получателя — но в шагах отправителя получателя нет, они идут один раз до всех целей`);
    }
    const sent: Record<string, unknown> = {};
    const rows: Record<string, string> = {};
    for (const name of deps) {
      const owned = ownerOf(name);
      const chosen = owned?.owner === RECEIVER ? chosenRowOf(owned.rest, ctx) : null;
      if (chosen) rows[chosen.head] = chosen.table;
      const key = owned?.owner === RECEIVER ? chosen?.head : name;
      if (!key || key in sent) continue;
      const known = senderValue(key, ctx);
      if (known !== undefined) sent[key] = known;
    }
    return {
      expr, of: 'target',
      ...(Object.keys(sent).length ? { sent } : {}),
      ...(Object.keys(rows).length ? { rows } : {}),
    };
  }
  if (waitsForStep(expr, ctx)) {
    const sent: Record<string, unknown> = {};
    for (const name of deps) {
      if (waitingName(name, ctx)) continue;
      const known = senderValue(name, ctx);
      if (known !== undefined) sent[name] = known;
    }
    return { expr, later: true, ...(Object.keys(sent).length ? { sent } : {}) };
  }
  return { const: evaluate(expr, ctx) };
}

function chosenRowOf(name: string, ctx: RefContext): { head: string; table: string } | null {
  const head = splitPath(name)?.head;
  const table = head ? referencedTable(ctx.pass.system, head, ctx.paramDefs) : undefined;
  return head && table && (ctx.paramDefs || []).some(p => p.key === head) ? { head, table } : null;
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

  if (isFormula(decl, value)) return packExpr(value, inRecord(ctx));
  return { const: value };
}

const inRecord = (ctx: RefContext): RefContext => (ctx.props ? { ...ctx, recordScope: true } : ctx);

function packProp(key: string, optional: boolean, ctx: RefContext): unknown {
  if (!ctx.props) {
    if (optional) return { const: null };
    throw new EngineError(
      `${who(ctx)}: неоткуда взять свойство «${key}» — у источника нет записи со свойствами`);
  }
  if (ctx.props[key] === undefined) {
    if (optional) return { const: null };
    throw new EngineError(
      `${who(ctx)}: запись-источник не заполнила свойство «${key}»`);
  }
  return { const: ctx.props[key] };
}

const isFormula = (decl: Param | undefined, value: unknown): value is string =>
  decl?.kind === 'number' && typeof value === 'string';

const MAX_INPUT_DEPTH = 8;

const readsReceiver = (expr: string): boolean =>
  compile(expr).deps.some(name => ownerOf(name)?.owner === RECEIVER);

const nameRegex = (name: string): RegExp =>
  new RegExp(`[@#]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_.])`, 'gu');

const isRecordName = (name: string, ctx: RefContext): boolean =>
  Boolean(ctx.props) && (name in ctx.props! || (splitPath(name)?.head ?? '') in ctx.props!);

function recordNamesAsNumbers(expr: string, ctx: RefContext): string {
  let out = expr;
  for (const name of compile(expr).deps) {
    if (ownerOf(name) || !isRecordName(name, ctx)) continue;
    out = out.replace(nameRegex(name), `(${String(evaluate(`@${name}`, inRecord(ctx)))})`);
  }
  return out;
}

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
    const inner = withReceiverInputs(recordNamesAsNumbers(value, ctx), ctx, depth + 1);
    if (new RegExp(`^\\s*${nameRegex(name).source}\\s*$`, 'u').test(out)) return inner;
    out = out.replace(nameRegex(name), `(${inner})`);
  }
  return out;
}

function fromArgs(key: string, ctx: RefContext): unknown {
  const asked = (ctx.inputs || {})[key];
  if (asked !== undefined) return asked;
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('prop' in arg) return (ctx.props || {})[String((arg as AnyRef).prop)];
  if ('const' in arg) return (arg as AnyRef).const;
  if ('expr' in arg) return String((arg as AnyRef).expr);
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение, { const }, { prop } или { expr }`);
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
    return evaluate(r.expr, ctx, r.sent as Record<string, unknown> | undefined, true, r.rows as Record<string, string> | undefined);
  }

  if ('param' in r) {
    throw new EngineError(
      `${who(ctx)}: параметр «${r.param}» не был упакован отправителем — конверт бит`);
  }

  if ('prop' in r) {
    throw new EngineError(
      `${who(ctx)}: свойство записи «${r.prop}» пришло неразрешённым — конверт бит`);
  }

  if ('tag' in r) return ctx.pass.resolve(String(r.tag));

  return unknownForm(r, ctx);
}

export function holdsNow(condition: unknown, ctx: RefContext): boolean {
  if (condition === null || condition === undefined) return true;
  const value = resolveRef(packRef(condition, ctx), ctx);
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

const isField = (system: System, name: string): boolean => system.fields.some(field => field.tag === name);

function waitingName(name: string, ctx: RefContext): boolean {
  if (ownerOf(name)) return false;
  const system = ctx.pass.system;
  if (isField(system, name)) return false;
  const known = knownOf(ctx);
  const split = splitPath(name);
  const head = split?.head ?? name;
  if (!split) return Boolean(ctx.stepIds?.has(head)) && !(head in (ctx.results ?? {}));
  if (referencedTable(system, head, ctx.paramDefs)) return false;
  const held = known[head];
  if (held === undefined || held === null || typeof held !== 'object') return true;
  return split.path.reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as AnyRef)[key] : undefined), held) === undefined;
}

function waitsForStep(expr: string, ctx: RefContext): boolean {
  return compile(expr).deps.some(name => waitingName(name, ctx));
}

export function toolsOf(system: System, pass: Pass, owner: string, die?: Die): Tools {
  return {
    ...(die ? {
      roll: (notation: string, times: number, keep?: number) => {
        const written = times > 1 ? multiplyNotation(notation, times) : notation;
        const rolled = rollNotation(written, die);
        if (keep === undefined) return rolled.total;
        const sorted = [...rolled.rolls].sort((a, b) => (keep > 0 ? b - a : a - b));
        return sorted.slice(0, Math.abs(keep)).reduce((sum, value) => sum + value, 0);
      },
    } : {}),
    table: (name, key, column) => {
      const read = (one: unknown) => readCell(system, pass, name, one, column ?? VALUE_COLUMN, owner);
      if (!Array.isArray(key)) return read(key) as Value;
      return key.filter(one => rowOf(system, name, one)).map(read) as unknown as Value;
    },
  };
}

function evaluate(
  expr: unknown, ctx: RefContext, sent?: Record<string, unknown>, atReceiver = false, rows?: Record<string, string>,
): unknown {
  const results = ctx.results ?? {};
  const known = knownOf(ctx);
  const system = ctx.pass.system;
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
    if (name in results && !isField(system, name)) return results[name];
    const dot = name.indexOf('.');
    if (dot > 0) {
      const held = known[name.slice(0, dot)];
      if (held && typeof held === 'object') {
        const value = name.slice(dot + 1).split('.')
          .reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as AnyRef)[key] : undefined), held);
        if (value !== undefined) return value;
      }
    }
    if (!isField(system, name)) {
      const named = namedValue(name, ctx);
      if (named !== undefined) return named;
      if (ctx.recordScope && ctx.props && name in ctx.props) return recordValue(name, ctx);
      const split = splitPath(name);
      const table = split ? rows?.[split.head] ?? referencedTable(system, split.head, ctx.paramDefs) : undefined;
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

export function lonelyField(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as AnyRef;
  if ('tag' in r) return String(r.tag);
  if (!('expr' in r) || typeof r.expr !== 'string') return null;
  const exact = /^\s*[@#]([\p{L}\p{N}_.-]+)\s*$/u.exec(r.expr);
  if (!exact) return null;
  const owned = ownerOf(exact[1]!);
  const name = owned ? owned.rest : exact[1]!;
  return name.includes('.') ? null : name;
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
  const value = ctx.params && name in ctx.params ? fromArgs(name, ctx) : undefined;
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') {
    if (decl.optional) return null;
    throw new EngineError(`${who(ctx)}: параметр «${name}» не заполнен`);
  }
  if (typeof value === 'object') return undefined;
  return isFormula(decl, value) ? evaluate(value, inRecord(ctx)) : value;
}

function recordValue(name: string, ctx: RefContext): unknown {
  const value = ctx.props![name];
  const formula = Object.values(ctx.pass.system.records ?? {})
    .some(kind => (kind.props ?? []).some(prop => prop.key === name && prop.kind === 'expr'));
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
