import { describe, it, expect } from 'vitest';
import { translateFormula, diceText, NEUTRAL_WORDS as N, RU_WORDS as RU } from '../src/formula/words.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';

const exprs = (value: unknown, out: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach(item => exprs(item, out));
  else if (value && typeof value === 'object') {
    const own = value as Record<string, unknown>;
    if (typeof own.expr === 'string') out.push(own.expr);
    Object.values(own).forEach(item => exprs(item, out));
  }
  return out;
};

describe('слова формул: перевод по словам', () => {
  it('слова логики, «если», функции и кость переводятся, имена и текст в кавычках — нет', () => {
    const ru = 'если(@цель.хп <= 0 и не пусто(@носитель.имя), округлить вниз(@урон / 2), большее из(1, 2к6)) + сумма(@а, "и не да")';
    const en = 'if(@цель.хп <= 0 and not empty(@носитель.имя), floor(@урон / 2), max(1, 2d6)) + sum(@а, "и не да")';
    expect(translateFormula(ru, RU, N)).toBe(en);
    expect(translateFormula(en, N, RU)).toBe(ru);
  });

  it('пробелы и скобки переносятся буква в букву', () => {
    const ru = '  (  @а==да )  или   нет ';
    expect(translateFormula(ru, RU, N)).toBe('  (  @а==true )  or   false ');
    expect(translateFormula(translateFormula(ru, RU, N), N, RU)).toBe(ru);
  });

  it('текст в кавычках, целиком совпавший с записью кости, — кость', () => {
    expect(translateFormula('@класс.кость или "1к8"', RU, N)).toBe('@класс.кость or "1d8"');
    expect(translateFormula('"к8 урона"', RU, N)).toBe('"к8 урона"');
  });

  it('имя функции без скобки и неразобранная строка не трогаются', () => {
    expect(translateFormula('@сумма + сумма', RU, N)).toBe('@сумма + сумма');
    expect(translateFormula('если("не закрыто', RU, N)).toBe('если("не закрыто');
  });

  it('кость как значение', () => {
    expect(diceText('2к6', N, RU)).toBe('2d6');
    expect(diceText('2d6', RU)).toBe('2к6');
    expect(diceText('меч', N, RU)).toBe('меч');
  });

  it('нейтральная запись каждой формулы каждого образца переживает показ по-русски и сохранение', () => {
    let seen = 0;
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
      for (const expr of exprs(world)) {
        seen += 1;
        const neutral = translateFormula(expr, RU, N);
        expect(translateFormula(translateFormula(neutral, N, RU), RU, N), expr).toBe(neutral);
      }
    }
    expect(seen).toBeGreaterThan(3000);
  });
});
