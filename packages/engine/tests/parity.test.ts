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
import { SAMPLE_SYSTEMS as OLD_SYSTEMS } from '../../../src/model/systems.js';
// @ts-expect-error
import { sheets as OLD_SHEETS } from '../../../src/model/sheets.js';
// @ts-expect-error
import { compendium as OLD_COMPENDIUM } from '../../../src/model/compendium.js';

import { calc, newPass } from '../src/engine/calc.ts';
import { exchange } from '../src/events/exchange.ts';
import { SAMPLE_SYSTEMS } from '../src/model/systems.ts';
import { sheets } from '../src/model/sheets.ts';
import { compendium } from '../src/model/compendium.ts';
import type { System, Sheet } from '../src/model/types.ts';

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

const attempt = (fn: () => unknown): Outcome => {
  try { return { ok: true, value: fn() }; } catch (err) {
    return { ok: false, error: (err as Error).constructor.name };
  }
};

describe('паритет со старым движком', () => {
  it('образцы совпадают побайтно — сверяем поведение, а не разные данные', () => {
    expect(JSON.stringify(SAMPLE_SYSTEMS)).toBe(JSON.stringify(OLD_SYSTEMS));
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

    expect(after).toEqual(before);
    expect(before.ok, 'ход вообще прошёл — иначе сверялись бы две ошибки').toBe(true);
  });
});
