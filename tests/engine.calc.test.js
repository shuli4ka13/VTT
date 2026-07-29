import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { calc, calcAll, newPass, dependenciesOf } from '../src/engine/calc.js';
import { UnknownTagError, CycleError, TableError } from '../src/engine/errors.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';

// Крошечная система «на коленке» — доказывает, что движок не знает ни одного
// конкретного имени стата. Ни «str», ни «level» здесь нет.
const tinySystem = (fields, tables = {}) => ({ id: 'tiny', name: 'Крошечная', tables, rolls: [], fields, actions: [] });
const tinySheet = values => ({ id: 't', systemId: 'tiny', name: 'Т', values, equipped: [], effects: [] });

const stored = (tag, def) => ({ tag, label: tag, group: 'g', value: { kind: 'stored', type: typeof def, default: def } });
const formula = (tag, expr) => ({ tag, label: tag, group: 'g', value: { kind: 'formula', expr } });

group('движок вычислений', () => {
  group('источники значения', () => {
    test('хранимое значение берётся из чарника', () => {
      eq(calc(system, arven, 'str'), 16);
    });

    test('если в чарнике значения нет — берётся умолчание из системы', () => {
      const empty = { ...arven, values: {} };
      eq(calc(system, empty, 'str'), 10);
      eq(calc(system, empty, 'armor_heavy'), false);
    });

    test('формула вычисляется, а не читается из чарника', () => {
      eq(calc(system, arven, 'str_mod'), 3);
      eq(calc(system, mirra, 'str_mod'), -1);
    });

    test('формула от формулы разворачивается на всю глубину', () => {
      // athletics → str_mod → str
      eq(calc(system, arven, 'athletics'), 3);
    });

    test('таблица по диапазонам ищет строку по значению аргумента', () => {
      eq(calc(system, { ...arven, values: { ...arven.values, level: 1 } }, 'prof_bonus'), 2);
      eq(calc(system, { ...arven, values: { ...arven.values, level: 5 } }, 'prof_bonus'), 3);
      eq(calc(system, { ...arven, values: { ...arven.values, level: 20 } }, 'prof_bonus'), 6);
    });

    test('аргумент таблицы — тоже формула, а не только прямая ссылка', () => {
      const sys = tinySystem(
        [stored('n', 4), { tag: 'grade', label: 'grade', group: 'g', value: { kind: 'table', table: 't', arg: '#n * 2' } }],
        { t: { label: 't', ranges: [{ from: 1, to: 7, value: 'мало' }, { from: 8, to: 20, value: 'много' }] } });
      eq(calc(sys, tinySheet({ n: 4 }), 'grade'), 'много');
    });

    test('значение вне всех диапазонов таблицы — внятная ошибка', () => {
      const broken = { ...arven, values: { ...arven.values, level: 99 } };
      throws(() => calc(system, broken, 'prof_bonus'), TableError, '99');
    });
  });

  group('условные правила', () => {
    test('в тяжёлом доспехе Ловкость к классу брони не прибавляется', () => {
      const heavy = { ...arven, values: { ...arven.values, ac_base: 16, armor_heavy: true } };
      eq(calc(system, heavy, 'ac'), 16);
    });

    test('без тяжёлого доспеха Ловкость прибавляется', () => {
      eq(calc(system, mirra, 'ac'), 14);
    });
  });

  group('движок системно-независим', () => {
    test('считает систему, в которой нет ни одного знакомого имени стата', () => {
      const sys = tinySystem([stored('крутость', 7), formula('удвоенная', '#крутость * 2')]);
      eq(calc(sys, tinySheet({ 'крутость': 7 }), 'удвоенная'), 14);
    });

    test('два разных чарника считаются по одной и той же системе', () => {
      eq(calc(system, arven, 'attack_bonus'), 6);
      eq(calc(system, mirra, 'attack_bonus'), 1);
    });

    test('новый стат добавляется правкой данных, движок не меняется', () => {
      const extended = {
        ...system,
        fields: [...system.fields, formula('initiative', '#dex_mod + #prof_bonus')],
      };
      eq(calc(extended, mirra, 'initiative'), 6);
    });
  });

  group('мемоизация в пределах одного прохода', () => {
    test('поле, нужное дважды, вычисляется один раз', () => {
      const sys = tinySystem([
        stored('base', 5),
        formula('doubled', '#base * 2'),
        formula('sum', '#doubled + #doubled'),
      ]);
      const sheet = tinySheet({ base: 5 });
      const pass = newPass(sys, sheet);
      eq(calc(sys, sheet, 'sum', pass), 20);
      eq(pass.computed.filter(t => t === 'doubled').length, 1, 'doubled должен считаться один раз');
    });

    test('разные проходы не делят кэш — иначе правка чарника не была бы видна', () => {
      const sys = tinySystem([stored('base', 1), formula('doubled', '#base * 2')]);
      eq(calc(sys, tinySheet({ base: 1 }), 'doubled'), 2);
      eq(calc(sys, tinySheet({ base: 10 }), 'doubled'), 20);
    });
  });

  group('ошибки', () => {
    test('запрос незнакомого тега называет тег', () => {
      throws(() => calc(system, arven, 'нетакого'), UnknownTagError, 'нетакого');
    });

    test('формула ссылается на необъявленный тег — ошибка называет обоих', () => {
      const sys = tinySystem([formula('a', '#призрак + 1')]);
      const err = throws(() => calc(sys, tinySheet({}), 'a'), UnknownTagError);
      ok(err.message.includes('призрак'), 'в сообщении должен быть отсутствующий тег');
      ok(err.message.includes('a'), 'в сообщении должно быть поле, из которого пришли');
    });

    test('прямой самоцикл даёт ошибку, а не зависание', () => {
      const sys = tinySystem([formula('a', '#a + 1')]);
      throws(() => calc(sys, tinySheet({}), 'a'), CycleError);
    });

    test('цикл через несколько полей даёт ошибку с полным путём', () => {
      const sys = tinySystem([formula('a', '#b'), formula('b', '#c'), formula('c', '#a')]);
      const err = throws(() => calc(sys, tinySheet({}), 'a'), CycleError);
      ok(err.message.includes('a → b → c → a'), `путь цикла в сообщении, получено: ${err.message}`);
    });

    test('битая формула в системе — ошибка при вычислении, а не молчаливый null', () => {
      const sys = tinySystem([formula('a', '1 +')]);
      throws(() => calc(sys, tinySheet({}), 'a'));
    });
  });

  group('зависимости поля', () => {
    test('у хранимого поля зависимостей нет', () => {
      deepEq(dependenciesOf(system, 'str'), []);
    });

    test('у формулы — теги из неё', () => {
      deepEq(dependenciesOf(system, 'ac'), ['ac_base', 'armor_heavy', 'dex_mod']);
    });

    test('у таблицы — теги из аргумента', () => {
      deepEq(dependenciesOf(system, 'prof_bonus'), ['level']);
    });
  });

  group('полный пересчёт', () => {
    test('calcAll возвращает значение для каждого объявленного поля', () => {
      const all = calcAll(system, arven);
      eq(Object.keys(all).length, system.fields.length);
      eq(all.str, 16);
      eq(all.athletics, 3);
      eq(all.spell_dc, 10);
    });

    test('вычисленные значения возвращаются отдельно и в чарник не попадают', () => {
      const before = JSON.stringify(arven);
      calcAll(system, arven);
      eq(JSON.stringify(arven), before, 'чарник не должен измениться после пересчёта');
    });
  });
});
