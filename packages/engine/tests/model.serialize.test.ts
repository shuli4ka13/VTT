import { group, test, eq, ok, deepEq, deepSame, throws } from './harness.ts';
import { serializeSheet, deserializeSheet, SheetShapeError } from '../src/model/serialize.ts';
import { sheets } from './fixtures.ts';

const sample = () => ({
  id: 'test',
  systemId: 'dnd5e-slice',
  name: 'Тестовый',
  values: { str: 16, dex: 14, athletics_prof: true },
  has: [{ of: 'chain-mail' }, { of: 'longsword' }],
  effects: [],
  kind: 'pc',
});

group('сериализация листа', () => {
  test('строка выдерживает круг JSON → объект → JSON побайтно', () => {
    for (const sheet of sheets) {
      const once = serializeSheet(sheet);
      const twice = serializeSheet(deserializeSheet(once));
      eq(twice, once, `лист ${sheet.id}`);
    }
  });

  test('объект выдерживает круг объект → JSON → объект', () => {

    for (const sheet of sheets) {
      deepSame(deserializeSheet(serializeSheet(sheet)), sheet, `лист ${sheet.id}`);
    }
  });

  test('порядок ключей в values не влияет на результат', () => {
    const a = { ...sample(), values: { str: 16, dex: 14, athletics_prof: true } };
    const b = { ...sample(), values: { athletics_prof: true, dex: 14, str: 16 } };
    eq(serializeSheet(a), serializeSheet(b));
  });

  test('в сериализованном виде нет ничего, кроме объявленных полей DTO', () => {
    const keys = Object.keys(JSON.parse(serializeSheet(sample())));
    deepEq(keys.sort(), ['effects', 'has', 'id', 'kind', 'name', 'systemId', 'values']);
  });

  group('защита от вычисленных значений в DTO', () => {
    test('лишний ключ верхнего уровня отвергается с указанием имени', () => {
      const dirty = { ...sample(), computed: { str_mod: 3 } };
      throws(() => serializeSheet(dirty), SheetShapeError, 'computed');
    });

    test('метод на листе отвергается', () => {
      const dirty = sample();
      dirty.getModifier = () => 3;
      throws(() => serializeSheet(dirty), SheetShapeError, 'getModifier');
    });

    test('значение-функция внутри values отвергается', () => {
      const dirty = sample();
      dirty.values.str_mod = () => 3;
      throws(() => serializeSheet(dirty), SheetShapeError, 'str_mod');
    });

    test('вложенный объект внутри values отвергается — хранимое значение скалярно', () => {
      const dirty = sample();
      dirty.values.armor = { base: 16 };
      throws(() => serializeSheet(dirty), SheetShapeError, 'armor');
    });

    test('десериализация проверяет форму так же строго', () => {
      throws(() => deserializeSheet('{"id":"x","computed":{}}'), SheetShapeError);
    });
  });

  group('ссылки на записи компендиума', () => {
    test('лист хранит ссылки на действия, а не копии', () => {
      for (const sheet of sheets) {
        ok(Array.isArray(sheet.has), `у ${sheet.id} нет списка «что есть»`);
        for (const entry of sheet.has) eq(typeof entry.of, 'string', 'запись — ссылка, а не копия');
      }
    });

    test('объект вместо ссылки на действие отвергается', () => {
      const dirty = { ...sample(), records: [{ id: 'longsword', label: 'Копия' }] };
      throws(() => serializeSheet(dirty), SheetShapeError, 'действ');
    });

    test('без списка «что есть» лист неполон', () => {
      const { has, ...rest } = sample();
      throws(() => serializeSheet(rest), SheetShapeError, 'has');
    });
  });

  group('кто владеет листом', () => {
    test('лист знает, персонаж это игрока или ведущего', () => {
      for (const sheet of sheets) {
        ok(['pc', 'npc'].includes(sheet.kind), `у ${sheet.id} странный род: ${sheet.kind}`);
      }
    });

    test('посторонний род отвергается', () => {
      throws(() => serializeSheet({ ...sample(), kind: 'дракон' }), SheetShapeError, 'kind');
    });

    test('текстовое значение — законный скаляр', () => {
      const withText = { ...sample(), values: { ...sample().values, race: 'Полурослик' } };
      const back = deserializeSheet(serializeSheet(withText));
      eq(back.values.race, 'Полурослик');
    });
  });

  group('образцовые листы', () => {
    test('их ровно два и они разные', () => {
      eq(sheets.length, 2);
      ok(sheets[0].id !== sheets[1].id);
    });

    test('оба ссылаются на одну и ту же систему', () => {
      eq(sheets[0].systemId, sheets[1].systemId);
    });

    test('ни в одном нет вычисленных значений', () => {
      for (const sheet of sheets) serializeSheet(sheet);
    });
  });
});
