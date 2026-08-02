// Шаг «величина»: вычислить число и отдать его дальше по имени.
//
// Слот source — откуда величина берётся; словарь для конструктора с примерами
// систем лежит в src/model/amount-sources.js, тест держит их согласованными:
//   'roll'   — свой бросок костей плюс бонусы (5e: кость оружия + Сила)
//   'margin' — база плюс превышение НАЗВАННОГО шага-порога (Shadowrun, Fate)
//   'item'   — фиксированное значение из записи-источника (киберпанк: урон числом)
//
// Кости бросает отправитель при упаковке — это ЕГО бросок урона. Превышение
// добирается у получателя: раньше оно попросту неизвестно.

import { rollNotation } from '../dice.js';
import { packRef, resolveOptionalNumber } from '../refs.js';
import { EngineError } from '../errors.js';

export const type = 'amount';
export const label = 'Величина';
export const hint = 'Вычислить число: бросок, превышение или фикс предмета.';

export const SOURCES = ['roll', 'margin', 'item'];

export const slots = [
  { key: 'source', label: 'Источник', kind: 'choice', options: SOURCES },
  { key: 'dice', label: 'Кости', kind: 'ref' },
  { key: 'fixed', label: 'Фикс', kind: 'ref' },
  { key: 'bonus', label: 'Бонус', kind: 'ref' },
  { key: 'margin', label: 'Превышение шага', kind: 'ref' },
];

export function pack(step, ctx) {
  const source = constant(packRef(step.source, ctx), ctx, 'источник величины');
  if (!SOURCES.includes(source)) {
    throw new EngineError(
      `${who(ctx)}: неизвестный источник величины «${source}» — умею: ${SOURCES.join(', ')}`);
  }

  // Слоты пакуются ДО проверок: пустота могла быть и законной (optional),
  // а вот для выбранного источника его слот пустым быть не может.
  const notation = step.dice ? constant(packRef(step.dice, ctx), ctx, 'кости величины') : null;
  const fixed = step.fixed !== undefined ? packRef(step.fixed, ctx) : null;
  const bonus = step.bonus !== undefined ? packRef(step.bonus, ctx) : null;
  const margin = step.margin !== undefined ? packRef(step.margin, ctx) : null;

  if (source === 'roll' && !notation) {
    throw new EngineError(`${who(ctx)}: источнику «свой бросок» нужны кости — слот dice пуст`);
  }
  if (source === 'item' && (fixed === null || (typeof fixed === 'object' && fixed.const == null))) {
    throw new EngineError(`${who(ctx)}: источнику «фикс предмета» нужен заполненный слот fixed`);
  }
  if (source === 'margin' && !margin) {
    throw new EngineError(
      `${who(ctx)}: источнику «превышение» нужен слот margin — превышение какого шага брать?`);
  }

  return {
    source,
    rolled: notation ? rollNotation(notation, ctx.die) : { notation: null, rolls: [], total: 0 },
    fixed, bonus, margin,
  };
}

export function resolve(step, ctx) {
  const flat = resolveOptionalNumber(step.fixed, ctx, 'фикс величины') ?? 0;
  const bonus = resolveOptionalNumber(step.bonus, ctx, 'бонус величины') ?? 0;
  const margin = resolveOptionalNumber(step.margin, ctx, 'превышение для величины') ?? 0;
  const total = step.rolled.total + flat + bonus + margin;

  return {
    value: total,
    trace: {
      source: step.source,
      notation: step.rolled.notation, rolls: step.rolled.rolls,
      flat, bonus, margin, total,
    },
    break: null,
  };
}

// Слоты, которые обязаны быть известны отправителю уже при упаковке:
// источник и нотация костей. Ссылка на результат шага здесь бессмысленна.
function constant(packed, ctx, what) {
  if (packed === null || typeof packed !== 'object') return packed;
  if ('const' in packed) return packed.const;
  throw new EngineError(
    `${who(ctx)}: ${what} должен быть известен отправителю, а пришло ${JSON.stringify(packed)}`);
}

function who(ctx) {
  return ctx.owner || 'правило';
}
