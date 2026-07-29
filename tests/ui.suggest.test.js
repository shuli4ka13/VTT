import { group, test, eq, deepEq, ok } from './harness.js';
import { suggest, applySuggestion } from '../src/ui/suggest.js';
import { system } from '../src/model/system.js';

// Подсказка ищется по тому, что человек набрал ЛЕЙБЛАМИ, а вставляется ТЕГ.
// Разрешение лейбла в тег происходит ровно один раз — в момент выбора из списка.
// В черновике оно происходило заново при каждом вычислении, регулярной заменой,
// и потому ломалось от переименования и от совпадения подстрок.
const at = (expr, caret = expr.length) => suggest(expr, caret, system);
const labels = result => result.matches.map(m => m.label || m.name);

group('подсказка при наборе', () => {
  group('поиск', () => {
    test('начало лейбла предлагает поле', () => {
      const found = at('Сил');
      ok(labels(found).includes('Сила'), `предложено: ${labels(found)}`);
    });

    test('регистр не важен', () => {
      ok(labels(at('сил')).includes('Сила'));
      ok(labels(at('СИЛ')).includes('Сила'));
    });

    test('лейбл из двух слов ищется целиком', () => {
      ok(labels(at('Модификатор Лов')).includes('Модификатор Ловкости'));
    });

    test('совпадений нет — и подсказок нет', () => {
      deepEq(at('Абракадабра').matches, []);
    });

    test('пустой ввод ничего не предлагает', () => {
      deepEq(at('').matches, []);
      deepEq(at('   ').matches, []);
    });

    test('точное начало показывается раньше совпадения в середине', () => {
      // «Сила» начинается с «Сил», «Модификатор Силы» лишь содержит
      const found = labels(at('Сил'));
      eq(found[0], 'Сила');
    });

    test('имена функций тоже предлагаются', () => {
      const found = at('flo');
      ok(labels(found).includes('floor'), `предложено: ${labels(found)}`);
    });
  });

  group('где именно набирают', () => {
    test('слово берётся от границы, а не с начала строки', () => {
      const found = at('#dex_mod + Сил');
      ok(labels(found).includes('Сила'));
      eq(found.query, 'Сил');
    });

    test('после скобки слово тоже находится', () => {
      eq(at('floor(Сил').query, 'Сил');
    });

    test('число слева не приклеивается к слову', () => {
      eq(at('2 + 10 Сил').query, 'Сил');
    });

    test('готовый тег не переспрашивают', () => {
      deepEq(at('#str').matches, []);
    });

    test('курсор в середине строки — слово берётся до курсора', () => {
      const found = suggest('Сил * 2', 3, system);
      eq(found.query, 'Сил');
      eq(found.to, 3, 'замена не должна съесть «* 2»');
    });
  });

  group('подстановка', () => {
    test('вместо набранного лейбла в строку встаёт тег', () => {
      const found = at('Сил');
      const { expr } = applySuggestion('Сил', found, found.matches[0]);
      eq(expr, '#str');
    });

    test('окружающий текст не трогается', () => {
      const found = at('#dex_mod + Сил');
      const { expr } = applySuggestion('#dex_mod + Сил', found, found.matches[0]);
      eq(expr, '#dex_mod + #str');
    });

    test('подстановка в середину строки не съедает хвост', () => {
      const found = suggest('Сил * 2', 3, system);
      const { expr, caret } = applySuggestion('Сил * 2', found, found.matches[0]);
      eq(expr, '#str * 2');
      eq(caret, 4, 'курсор сразу за тегом');
    });

    test('функция подставляется вместе с открывающей скобкой', () => {
      const found = at('flo');
      const fn = found.matches.find(m => m.kind === 'function');
      const { expr, caret } = applySuggestion('flo', found, fn);
      eq(expr, 'floor(');
      eq(caret, 6);
    });

    test('в строку никогда не попадает лейбл', () => {
      const found = at('Модификатор Лов');
      const { expr } = applySuggestion('Модификатор Лов', found, found.matches[0]);
      eq(expr.includes('Модификатор'), false);
      eq(expr, '#dex_mod');
    });
  });
});
