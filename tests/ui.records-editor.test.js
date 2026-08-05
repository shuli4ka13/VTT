import { group, test, eq, ok, deepEq } from './harness.js';
import { state } from '../src/ui/state.js';
import {
  addKind, setKind, deleteKind,
  addProp, setProp, deleteProp,
  copyKindFrom,
} from '../src/ui/records-editor.js';
import { SAMPLE_SYSTEMS } from '../src/model/systems.js';

// Редактор родов записей: автор задаёт, ЧТО может лежать в компендиуме его
// системы. У рода — стабильный машинный ключ и человеческий лейбл (тот же
// инвариант, что у тега поля): «Оружие» переименовывается в «Атакующие
// предметы», и ни одна запись, ни одно правило не ломаются. Рода можно
// подтянуть шаблоном из любой образцовой системы и отредактировать.

group('редактор родов записей', () => {
  test('новый род получает стабильный ключ и редактируемые слова', () => {
    const rk = addKind('item');
    ok(state.system.records[rk], 'род появился в системе');
    eq(state.system.records[rk].kind, 'item', 'базис — из короткого словаря движка');

    setKind(rk, 'label', 'Атакующие предметы');
    setKind(rk, 'hint', 'Всё, чем бьют.');
    eq(state.system.records[rk].label, 'Атакующие предметы');

    // Переименование лейбла не трогает ключ — записи держатся за ключ.
    setKind(rk, 'label', 'Совсем другое имя');
    ok(state.system.records[rk], 'ключ тот же, запись на месте');
    deleteKind(rk);
  });

  test('базис менять нельзя после создания — как тип поля не меняется под записями', () => {
    const rk = addKind('effect');
    setKind(rk, 'kind', 'action');
    eq(state.system.records[rk].kind, 'effect', 'базис неизменен');
    deleteKind(rk);
  });

  test('свойству рода — стабильный ключ, лейбл и вид; переименование безвредно', () => {
    const rk = addKind('item');
    const key = addProp(rk);
    const props = state.system.records[rk].props;
    eq(props.length, 1);
    eq(props[0].key, key);

    setProp(rk, key, 'label', 'Прочность');
    setProp(rk, key, 'kind', 'number');
    eq(props[0].label, 'Прочность');
    eq(props[0].kind, 'number');

    setProp(rk, key, 'label', 'Другое имя');
    eq(props[0].key, key, 'ключ свойства стабилен — ссылки правил не ломаются');

    deleteProp(rk, key);
    eq(state.system.records[rk].props.length, 0);
    deleteKind(rk);
  });

  test('шаблон: род подтягивается из любой образцовой системы и правится у себя', () => {
    const donor = SAMPLE_SYSTEMS.find(s => s.id === 'cp-slice');
    ok(donor, 'киберпанк доступен как донор шаблона');

    const rk = copyKindFrom(donor, 'weapon');
    const copy = state.system.records[rk];
    ok(copy, 'копия появилась в моей системе');
    eq(copy.label, donor.records.weapon.label, 'слова приехали');
    ok((copy.props || []).some(p => p.key === 'damage_flat'), 'и свойства приехали');

    // Копия — своя: правка не трогает донора.
    setKind(rk, 'label', 'Хромированные стволы');
    eq(donor.records.weapon.label, 'Оружие', 'донор не изменился');
    deleteKind(rk);
  });

  test('копия при конфликте ключа получает новый ключ, а не затирает мой род', () => {
    const donor = SAMPLE_SYSTEMS.find(s => s.id === 'cp-slice');
    const mineLabel = state.system.records.weapon.label;
    const rk = copyKindFrom(donor, 'weapon');
    ok(rk !== 'weapon', 'ключ не столкнулся');
    eq(state.system.records.weapon.label, mineLabel, 'мой род цел');
    deleteKind(rk);
  });

  test('удаление рода не роняет записи: они честно падают в запасной словарь движка', () => {
    const rk = addKind('item');
    state.compendium.items.push({ id: 'сирота', rk, label: 'Сирота', modifiers: [] });
    deleteKind(rk);
    eq(state.system.records[rk], undefined);
    ok(state.compendium.items.some(i => i.id === 'сирота'), 'запись жива');
    state.compendium.items = state.compendium.items.filter(i => i.id !== 'сирота');
  });

  test('обе образцовые системы доступны как доноры шаблонов', () => {
    ok(SAMPLE_SYSTEMS.length >= 2);
    ok(SAMPLE_SYSTEMS.every(s => s.id && s.records && s.name));
  });
});
