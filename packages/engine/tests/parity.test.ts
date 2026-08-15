// Паритет: новый движок обязан считать ТО ЖЕ, что PoC.
//
// Тест импортирует обе реализации разом — старую (обычный ESM-JS в корне
// репозитория) и новую — и сверяет исходы на образцовых мирах. Пока он жив,
// «заодно улучшил» физически не пройдёт: любое расхождение чисел здесь
// падает как баг переноса.
//
// Сверяются не только значения, но и ОШИБКИ: обе стороны обязаны либо
// посчитать одинаково, либо сломаться одинаково. Иначе «стало не падать»
// прошло бы за улучшение, а это тоже расхождение поведения.

import { describe, it, expect } from 'vitest';

// @ts-expect-error — PoC на JS без деклараций, читается как есть.
import * as oldCalc from '../../../src/engine/calc.js';
// @ts-expect-error
import * as oldExchange from '../../../src/events/exchange.js';
// @ts-expect-error
import { SAMPLE_SYSTEMS as OLD_SYSTEMS, SAMPLE_WORLDS as OLD_WORLDS } from '../../../src/model/systems.js';
// @ts-expect-error
import { sheets as OLD_SHEETS } from '../../../src/model/sheets.js';
// @ts-expect-error
import { compendium as OLD_COMPENDIUM } from '../../../src/model/compendium.js';

import { calc, newPass } from '../src/engine/calc.ts';
import { exchange } from '../src/events/exchange.ts';
import { SAMPLE_SYSTEMS } from '../src/model/systems.ts';
import { unifyRecordRefs, unifyBounds } from '../src/model/unify.ts';
import { sheets, compendium } from './fixtures.ts';
import type { System, Sheet } from '../src/model/types.ts';

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

/** Каноничный вид: ключи по алфавиту вглубь. Сверка содержимого, не порядка. */
const canon = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canon)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value as object).sort()
      .map(key => [key, canon((value as Record<string, unknown>)[key])]))
    : value;

/**
 * Убрать УПРАЗДНЁННЫЙ ключ с обеих сторон сверки. Пользоваться только для
 * полей, которых в новой модели нет вовсе: сверка «как было» держится ровно
 * на том, что здесь перечислено мало и с объяснением на месте вызова.
 */
const retire = (value: unknown, key: string): unknown => Array.isArray(value)
  ? value.map(v => retire(v, key))
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as object)
      .filter(([k]) => k !== key).map(([k, v]) => [k, retire(v, key)]))
    : value;

const attempt = (fn: () => unknown): Outcome => {
  try { return { ok: true, value: fn() }; } catch (err) {
    return { ok: false, error: (err as Error).constructor.name };
  }
};

describe('паритет со старым движком', () => {
  it('образцы совпадают после миграции — сверяем поведение, а не разные данные', () => {
    // Форма ссылки на запись в новом стеке эволюционировала: прямое свойство
    // в слоте шага сменили потребность эффекта плюс аргумент привязки. Это
    // не «заодно улучшил», а объявленная миграция (unifyRecordRefs), которую
    // проходит каждый загружаемый мир. Поэтому старые образцы сверяются с
    // новыми ПОСЛЕ неё — и обязаны совпасть до последнего ключа. Порядок
    // ключей после миграции другой, содержимое — то же; сверяем канонично.
    //
    // unifyBounds — вторая объявленная миграция: границы значения переехали
    // с шагов «применить» на сами поля (floor/ceiling → min/max), потому что
    // «ХП не ниже нуля» — природа поля, а не каждого эффекта. Компендиум ей
    // нужен, чтобы разрешить мишень-параметр в теги, — СВОЙ компендиум
    // каждого мира: киберпанковый strike целится параметром, и чем тот
    // заполнен, знают только его собственные записи.
    type OldWorld = { system: System; compendium: typeof OLD_COMPENDIUM };
    expect(canon(SAMPLE_SYSTEMS)).toEqual(canon((OLD_WORLDS as OldWorld[]).map(world =>
      unifyBounds({ system: unifyRecordRefs(world.system), compendium: world.compendium }).system)));
    expect(JSON.stringify(sheets)).toBe(JSON.stringify(OLD_SHEETS));
    expect(JSON.stringify(compendium)).toBe(JSON.stringify(OLD_COMPENDIUM));
  });

  it('каждое поле каждого листа в каждой системе считается одинаково', () => {
    let checked = 0;

    for (const system of SAMPLE_SYSTEMS as System[]) {
      const mine = (sheets as Sheet[]).filter(s => s.systemId === system.id);
      // Лист без своей системы считать нечем — такие пары пропускаем,
      // иначе паритет сверял бы две одинаковые ошибки «нет поля».
      for (const sheet of mine) {
        for (const field of system.fields) {
          const before = attempt(() => oldCalc.calc(
            system, sheet, field.tag,
            oldCalc.newPass(system, sheet, { compendium }),
          ));
          const after = attempt(() => calc(
            system, sheet, field.tag,
            newPass(system, sheet, { compendium }),
          ));
          expect(after, `${system.name} · ${sheet.id} · ${field.tag}`).toEqual(before);
          checked++;
        }
      }
    }

    // Сторож самого паритета: пустой прогон «проходит» молча и потому опаснее
    // расхождения — он выглядит зелёным, ничего не проверив.
    expect(checked, 'паритету было что сверять').toBeGreaterThan(50);
  });

  it('ход целиком — атака с триггерной ответкой — даёт те же листы и те же отчёты', () => {
    // Кость детерминированная и ОДНА на оба движка по очереди: случайность
    // тут разрушила бы сверку, а не проверила её.
    const queue = (...values: number[]) => {
      let i = 0;
      return () => values[i++] ?? 1;
    };
    const rolls = [18, 5, 4, 3];

    const system = (SAMPLE_SYSTEMS as System[]).find(s => s.id === 'dnd5e-slice')!;
    const world = (sheets as Sheet[]).filter(s => s.systemId === system.id);
    const [from, to] = world;

    const args = {
      system, compendium,
      sheets: world,
      actionId: 'longsword-item:0',
      fromId: from!.id,
      toId: to!.id,
    };

    const before = attempt(() => oldExchange.exchange({ ...args, die: queue(...rolls) }));
    const after = attempt(() => exchange({ ...args, die: queue(...rolls) }));

    // `mode` из трассы ушёл вместе с самим понятием: режим броска сменился
    // списком применённых записей словаря «Правки броска». Это объявленная
    // смена модели, а не расхождение поведения — числа, кости и исходы ниже
    // сверяются как были, до последнего ключа.
    // floor/ceiling ушли из трассы вместе с шаговыми границами: движок
    // зажимает по границам ПОЛЯ (unifyBounds выше), и числа сходятся —
    // а ключей с нулями и null в новой трассе больше нет.
    const tidy = (o: Outcome) => retire(retire(retire(o, 'mode'), 'floor'), 'ceiling');
    expect(tidy(after)).toEqual(tidy(before));
    expect(before.ok, 'ход вообще прошёл — иначе сверялись бы две ошибки').toBe(true);
  });
});
