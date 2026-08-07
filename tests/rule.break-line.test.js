import { group, test, eq, ok } from './harness.js';
import * as threshold from '../src/engine/steps/threshold.js';
import * as compare from '../src/engine/steps/compare.js';
import { registry } from '../src/engine/steps/index.js';
import { verdictOf } from '../src/ui/effect-editor.js';

// Конвейер — прямая линия с РАЗВИЛКАМИ досрочного выхода, и каждая развилка
// должна быть подписана словами своего шага: «промах» и «броня не пробита» —
// разные истории. Раньше все обрывы рисовались одной серой строкой «может
// оборвать цепочку», и киберпанковский удар выглядел прямой линией без ветвлений.

group('шаг сам подписывает свою развилку (breakLine)', () => {
  test('порог: слова зависят от направления продолжения', () => {
    ok(threshold.breakLine({}).includes('не взят'), 'атака: обрыв при промахе');
    ok(threshold.breakLine({ continueOn: 'fail' }).includes('взят'), 'спасбросок: обрыв, если цель устояла');
  });

  test('сравнение: слова зависят от условия обрыва, «никогда» — развилки нет', () => {
    ok(compare.breakLine({}).includes('меньше'), 'умолчание — строго меньше порога');
    ok(compare.breakLine({ breakIf: 'atMost' }).includes('не выше'));
    eq(compare.breakLine({ breakIf: 'never' }), null, 'сравнение ради разницы — линия остаётся прямой');
  });

  test('контракт реестра: обрывающий шаг обязан уметь подписать развилку', () => {
    for (const mod of registry.values()) {
      if (mod.mayBreak && !mod.type.includes('заглушка')) {
        eq(typeof mod.breakLine, 'function', `${mod.type}: обрывает, но не подписывает развилку`);
      }
    }
  });

  test('приговор не пугает обрывом, когда сравнение стоит «никогда»', () => {
    const rule = {
      label: 'Только разница', params: [],
      steps: [{ id: 'diff', type: 'compare', value: { const: 5 }, versus: { const: 3 }, breakIf: 'never' }],
    };
    const verdict = verdictOf(rule);
    eq(verdict.ok, true);
    ok(!verdict.text.includes('оборваться'), 'обрыва нет — и приговор о нём молчит');
  });
});
