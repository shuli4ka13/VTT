// Структурные ссылки — язык слотов правила.
//
// Не строковый мини-язык нарочно: из структуры выводится интерфейс —
// конструктор показывает выпадашку с допустимыми значениями, а не поле
// свободного ввода. Строки-формулы внутри { expr } разбирает существующий
// парсер (src/formula), его контракт не меняется.
//
// Формы ссылок:
//   литерал (число/строка/null) — уже чистые данные, проходит как есть
//   { const: v }                — фиксированное значение
//   { expr: '#a + 1', of? }     — формула; of: 'sender' (умолчание) | 'target'
//   { param: 'key' }            — параметр эффекта, заполняет запись компендиума;
//                                 как его читать, говорит объявление в effect.params
//   { prop: 'damage_dice' }     — свойство ЗАПИСИ-ИСТОЧНИКА, сторона отправителя.
//                                 Читаются только свойства, объявленные родом
//                                 записи; `item` — прежнее имя той же формы
//   { tag: 'hp_max' }           — поле ЦЕЛИ, посчитает получатель своими формулами
//   { ref: 'шаг.путь' }         — именованный результат предыдущего шага
//
// Сторона — главное свойство. packRef (отправитель) разрешает только своё;
// всё целевое проносится в конверт нетронутым. Отправитель НЕ МОЖЕТ посчитать
// за цель по построению: у packRef просто нет результатов и листа цели.

import { compile } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import type { Param } from '../model/types.ts';
import type { Pass } from './calc.ts';

/**
 * Контекст разрешения ссылки. Сторона решается тем, ЧТО в нём лежит:
 * у отправителя нет ни результатов шагов, ни листа цели — поэтому посчитать
 * за цель он не может по построению, а не по договорённости.
 */
export interface RefContext {
  pass: Pass;
  /** Кто разрешает — попадает в текст ошибки. */
  owner?: string;
  /** Свойства записи-источника (циферки, заполненные по форме её рода). */
  props?: Record<string, unknown> | null;
  /** Объявленные эффектом параметры. */
  paramDefs?: Param[];
  /** Аргументы привязки: готовое значение либо { prop } — «возьми из записи». */
  params?: Record<string, unknown>;
  /** Результаты уже отработавших шагов — сторона получателя. */
  results?: Record<string, unknown>;
}

const FORMS = ['const', 'expr', 'param', 'prop', 'item', 'tag', 'ref'];

type AnyRef = Record<string, unknown>;

// `item` — прежнее имя формы `prop`. Старые системы читали так свойства
// оружия; форма обобщена на любую запись-источник, имя оставлено рабочим.
const propKey = (ref: AnyRef): string => String('prop' in ref ? ref.prop : ref.item);

// ── сторона отправителя ──────────────────────────────────────────────────────
// Возвращает структурную ссылку для конверта: своё — числом ({ const }),
// целевое — нетронутым.

export function packRef(ref: unknown, ctx: RefContext): unknown {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  const r = ref as AnyRef;

  if ('const' in r) return { const: r.const };

  if ('expr' in r) {
    if ((r.of || 'sender') === 'target') {
      // Имена из списка `sender` считает отправитель — здесь и сейчас,
      // своим листом — и кладёт в конверт ЧИСЛАМИ. Текст выражения не
      // меняется: у получателя эти имена разрешатся из `sent`, остальные —
      // его листом. Так одно выражение честно живёт на двух листах.
      const names = Array.isArray(r.sender) ? r.sender : [];
      if (!names.length) return { expr: r.expr, of: 'target' };
      const sent: Record<string, unknown> = {};
      for (const name of names) sent[String(name)] = evaluate(`#${name}`, ctx);
      return { expr: r.expr, of: 'target', sent };
    }
    return { const: evaluate(r.expr, ctx) };
  }

  // optional: true — пустота объявлена в данных и потому законна. Так живут
  // взаимоисключающие слоты (кости ИЛИ фикс предмета): эффект заполняет один,
  // второй честно даёт null, а не роняет упаковку.
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
  if ('ref' in r) return { ref: r.ref };

  return unknownForm(r, ctx);
}

// Параметр подставляется ровно один раз, при упаковке: в конверте { param }
// не встречается. Как читать значение, говорит объявление эффекта.
//
// Аргумент из записи компендиума бывает двух видов: готовое значение
// (строка, число) либо { prop: 'ключ' } — «возьми из свойств самой записи».
// Второй вид и делает род ФОРМОЙ заполнения: привязка рода написана один раз,
// а каждая запись подставляет в неё свои циферки.
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
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('prop' in arg) return (ctx.props || {})[String((arg as AnyRef).prop)];
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение или { prop }`);
}

// ── сторона получателя ──────────────────────────────────────────────────────
// Здесь всё обязано разрешиться до значения. { param } и неразрешённое
// выражение отправителя законно прийти не могли — это подделка конверта.

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

// Для слотов, где пустота законна (объявлена через optional): null — это null,
// а вот НЕ-число, которое числом притворялось, — по-прежнему ошибка.
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

// ── внутреннее ───────────────────────────────────────────────────────────────

/**
 * Вычислить выражение. Имя в формуле — это поле листа, а если поля с таким
 * именем нет, то РЕЗУЛЬТАТ ШАГА выше по цепочке.
 *
 * Зачем: кость бросает отправитель, а формулу считает лист получателя, и
 * до сих пор из-за этого «новое значение поля» нельзя было написать одним
 * выражением — «ХП минус кость урона» приходилось собирать из направления
 * и величины порознь. Теперь брошенное число у формулы есть под своим
 * именем, и «чем поле станет» пишется как обычная математика.
 *
 * Присланное — сильнее всего: имя из `sent` посчитал отправитель, и оно
 * ОБЯЗАНО победить одноимённое поле получателя — в этом весь смысл пометки
 * «у отправителя»: Сила бьющего, а не жертвы.
 *
 * Дальше поле важнее шага: мир, где поле и шаг названы одинаково, продолжает
 * считать поле — иначе переименование шага молча меняло бы смысл формул.
 */
function evaluate(expr: unknown, ctx: RefContext, sent?: Record<string, unknown>): unknown {
  const results = ctx.results;
  const resolve = (name: string) => {
    if (sent && name in sent) return sent[name];
    if (results && name in results) {
      const known = ctx.pass.system.fields.some(f => f.tag === name);
      if (!known) return (results as Record<string, unknown>)[name];
    }
    return ctx.pass.resolve(name);
  };
  return compile(String(expr)).evaluate(resolve);
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
