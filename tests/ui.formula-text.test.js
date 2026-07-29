import { group, test, eq, deepEq } from './harness.js';
import { toDisplay, toParts, insertRef, insertRefAt, removePart } from '../src/ui/formula-text.js';
import { system } from '../src/model/system.js';

group('формула на экране', () => {
  group('отображение лейблами', () => {
    test('тег заменяется человеческим именем', () => {
      eq(toDisplay('#str', system), 'Сила');
    });

    test('пользователь не видит ни одной решётки', () => {
      const shown = toDisplay('floor((#str - 10) / 2)', system);
      eq(shown, 'floor((Сила - 10) / 2)');
      eq(shown.includes('#'), false);
    });

    test('пробелы и скобки автора сохраняются как есть', () => {
      eq(toDisplay('#ac_base+(#armor_heavy?0:#dex_mod)', system),
        'База доспеха+(Доспех тяжёлый?0:Модификатор Ловкости)');
    });

    test('переименование лейбла меняет показ, но не формулу', () => {
      const renamed = {
        ...system,
        fields: system.fields.map(f => f.tag === 'str' ? { ...f, label: 'Мощь' } : f),
      };
      eq(toDisplay('#str + 1', renamed), 'Мощь + 1');
    });

    test('незнакомый тег показывается как есть — это видимая поломка, а не тихая', () => {
      eq(toDisplay('#призрак + 1', system), '#призрак + 1');
    });

    test('недописанная формула не роняет показ', () => {
      eq(toDisplay('#str + ', system), 'Сила + ');
      eq(toDisplay('#', system), '#');
    });
  });

  group('разбор на чипсы и текст', () => {
    test('ссылка становится чипсом с лейблом, остальное — текстом', () => {
      deepEq(toParts('#str + 1', system), [
        { kind: 'ref', tag: 'str', label: 'Сила' },
        { kind: 'text', text: ' + 1' },
      ]);
    });

    test('текст между двумя чипсами не теряется', () => {
      deepEq(toParts('#str * #dex', system), [
        { kind: 'ref', tag: 'str', label: 'Сила' },
        { kind: 'text', text: ' * ' },
        { kind: 'ref', tag: 'dex', label: 'Ловкость' },
      ]);
    });

    test('формула без ссылок — один кусок текста', () => {
      deepEq(toParts('1 + 2', system), [{ kind: 'text', text: '1 + 2' }]);
    });

    test('пустая формула не даёт кусков', () => {
      deepEq(toParts('', system), []);
    });
  });

  group('вставка зависимости', () => {
    test('в пустую формулу вставляется тег', () => {
      eq(insertRef('', 'str'), '#str');
    });

    test('к готовому выражению тег приписывается через пробел', () => {
      eq(insertRef('#str +', 'dex'), '#str + #dex');
    });

    test('после открывающей скобки лишний пробел не ставится', () => {
      eq(insertRef('floor(', 'str'), 'floor(#str');
    });

    test('после запятой пробел ставится', () => {
      eq(insertRef('max(#str,', 'dex'), 'max(#str, #dex');
    });

    test('вставляется именно тег, а не лейбл', () => {
      eq(insertRef('', 'str').includes('Сила'), false);
    });

    test('вставка идёт в позицию курсора, а не в конец', () => {
      // курсор между «floor(» и «)»
      eq(insertRef('floor()', 'str', 6), 'floor(#str)');
    });

    test('в середине выражения пробелы ставятся по надобности с обеих сторон', () => {
      eq(insertRef('1 + * 2', 'str', 4), '1 + #str * 2');
    });

    test('курсор в нуле — вставка в начало без пробела', () => {
      eq(insertRef(' + 2', 'str', 0), '#str + 2');
    });

    test('отдельно сообщает, куда встал курсор', () => {
      const { expr, caret } = insertRefAt('floor()', 'str', 6);
      eq(expr, 'floor(#str)');
      eq(caret, 10, 'курсор сразу за вставленным тегом');
    });
  });

  group('удаление куска', () => {
    test('чипс убирается вместе со своей ссылкой', () => {
      eq(removePart('#str + #dex', system, 2), '#str + ');
    });

    test('удаление первого куска не ломает остальное', () => {
      eq(removePart('#str + 1', system, 0), ' + 1');
    });
  });
});
