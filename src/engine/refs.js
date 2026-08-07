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

import { compile } from '../formula/index.js';
import { EngineError } from './errors.js';

const FORMS = ['const', 'expr', 'param', 'prop', 'item', 'tag', 'ref'];

// `item` — прежнее имя формы `prop`. Старые системы читали так свойства
// оружия; форма обобщена на любую запись-источник, имя оставлено рабочим.
const propKey = ref => ('prop' in ref ? ref.prop : ref.item);

// ── сторона отправителя ──────────────────────────────────────────────────────
// Возвращает структурную ссылку для конверта: своё — числом ({ const }),
// целевое — нетронутым.

export function packRef(ref, ctx) {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  if ('const' in ref) return { const: ref.const };

  if ('expr' in ref) {
    if ((ref.of || 'sender') === 'target') return { expr: ref.expr, of: 'target' };
    return { const: evaluate(ref.expr, ctx) };
  }

  // optional: true — пустота объявлена в данных и потому законна. Так живут
  // взаимоисключающие слоты (кости ИЛИ фикс предмета): эффект заполняет один,
  // второй честно даёт null, а не роняет упаковку.
  if ('param' in ref) return packParam(ref.param, ref.optional, ctx);

  if ('prop' in ref || 'item' in ref) {
    const key = propKey(ref);
    if (!ctx.props) {
      if (ref.optional) return { const: null };
      throw new EngineError(
        `${who(ctx)}: неоткуда взять свойство «${key}» — у источника нет записи со свойствами`);
    }
    if (ctx.props[key] === undefined) {
      if (ref.optional) return { const: null };
      throw new EngineError(
        `${who(ctx)}: запись-источник не заполнила свойство «${key}»`);
    }
    return { const: ctx.props[key] };
  }

  if ('tag' in ref) return { tag: ref.tag };
  if ('ref' in ref) return { ref: ref.ref };

  return unknownForm(ref, ctx);
}

// Параметр подставляется ровно один раз, при упаковке: в конверте { param }
// не встречается. Как читать значение, говорит объявление эффекта.
//
// Аргумент из записи компендиума бывает двух видов: готовое значение
// (строка, число) либо { prop: 'ключ' } — «возьми из свойств самой записи».
// Второй вид и делает род ФОРМОЙ заполнения: привязка рода написана один раз,
// а каждая запись подставляет в неё свои циферки.
function packParam(key, optional, ctx) {
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

function fromArgs(key, ctx) {
  const arg = (ctx.params || {})[key];
  if (arg === null || typeof arg !== 'object') return arg;
  if ('prop' in arg) return (ctx.props || {})[arg.prop];
  throw new EngineError(
    `${who(ctx)}: аргумент «${key}» неизвестной формы ${JSON.stringify(arg)} — умею значение или { prop }`);
}

// ── сторона получателя ──────────────────────────────────────────────────────
// Здесь всё обязано разрешиться до значения. { param } и неразрешённое
// выражение отправителя законно прийти не могли — это подделка конверта.

export function resolveRef(ref, ctx) {
  if (ref === null || ref === undefined || typeof ref !== 'object') return ref ?? null;

  if ('const' in ref) return ref.const;

  if ('expr' in ref) {
    if ((ref.of || 'sender') !== 'target') {
      throw new EngineError(
        `${who(ctx)}: выражение «${ref.expr}» стороны отправителя пришло неразрешённым — конверт бит`);
    }
    return evaluate(ref.expr, ctx);
  }

  if ('param' in ref) {
    throw new EngineError(
      `${who(ctx)}: параметр «${ref.param}» не был упакован отправителем — конверт бит`);
  }

  if ('prop' in ref || 'item' in ref) {
    throw new EngineError(
      `${who(ctx)}: свойство записи «${propKey(ref)}» пришло неразрешённым — конверт бит`);
  }

  if ('tag' in ref) return ctx.pass.resolve(ref.tag);

  if ('ref' in ref) {
    const [head, ...path] = String(ref.ref).split('.');
    if (!(head in (ctx.results || {}))) {
      throw new EngineError(
        `${who(ctx)}: шаг «${head}» результата не оставил — он вообще был раньше по цепочке?`);
    }
    let value = ctx.results[head];
    for (const key of path) {
      if (value === null || typeof value !== 'object' || !(key in value)) {
        throw new EngineError(`${who(ctx)}: у результата шага «${head}» нет «${path.join('.')}»`);
      }
      value = value[key];
    }
    return value;
  }

  return unknownForm(ref, ctx);
}

export function resolveNumber(ref, ctx, what) {
  const value = resolveRef(ref, ctx);
  if (typeof value !== 'number') {
    throw new EngineError(
      `${who(ctx)}: ${what} — не число (${describe(ref)} даёт ${typeof value})`);
  }
  return value;
}

// Для слотов, где пустота законна (объявлена через optional): null — это null,
// а вот НЕ-число, которое числом притворялось, — по-прежнему ошибка.
export function resolveOptionalNumber(ref, ctx, what) {
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

function evaluate(expr, ctx) {
  return compile(String(expr)).evaluate(ctx.pass.resolve);
}

function who(ctx) {
  return ctx.owner || 'правило';
}

function describe(ref) {
  if (ref === null || typeof ref !== 'object') return JSON.stringify(ref);
  const form = FORMS.find(f => f in ref);
  return form ? `«${form}: ${ref[form]}»` : JSON.stringify(ref);
}

function unknownForm(ref, ctx) {
  throw new EngineError(
    `${who(ctx)}: ссылка неизвестной формы ${JSON.stringify(ref)} — умею ${FORMS.join(', ')}`);
}
