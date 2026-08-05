import { group, test, eq, ok } from './harness.js';
import { state, field } from '../src/ui/state.js';
import { addTable, renameTable, addRange, setRange, deleteRange, deleteTable, renderTables } from '../src/ui/rule-editor.js';
import { addField, setValueKind } from '../src/ui/field-editor.js';

// Таблица по диапазонам — третий способ вычислить поле (наравне с «хранимое»
// и «формула»), ради ступенчатых прогрессий вроде бонуса мастерства 5e.
// Движок её умел с самого начала (src/engine/tables.js); завести таблицу,
// поправить диапазоны или сделать поле табличным из конструктора было нельзя.

group('редактор таблиц по диапазонам', () => {
  test('новая таблица получает стабильный ключ и одну заготовленную строку', () => {
    const before = Object.keys(state.system.tables).length;
    const name = addTable();
    eq(Object.keys(state.system.tables).length, before + 1);
    const t = state.system.tables[name];
    eq(t.ranges.length, 1);

    renameTable(name, 'Урон по уровню');
    eq(state.system.tables[name].label, 'Урон по уровню');

    deleteTable(name);
    ok(!(name in state.system.tables));
  });

  test('строки диапазона добавляются, правятся числом и удаляются', () => {
    const name = addTable();
    addRange(name);
    eq(state.system.tables[name].ranges.length, 2);

    setRange(name, 1, 'from', '5');
    setRange(name, 1, 'to', '8');
    setRange(name, 1, 'value', '3');
    const row = state.system.tables[name].ranges[1];
    eq(row.from, 5); eq(row.to, 8); eq(row.value, 3);

    deleteRange(name, 0);
    eq(state.system.tables[name].ranges.length, 1);
    deleteTable(name);
  });

  test('удаление таблицы, на которую ссылается поле, отказано', () => {
    const name = addTable();
    const tag = addField('Тест');
    setValueKind(tag, 'table');
    field(tag).value.table = name;

    deleteTable(name);
    ok(name in state.system.tables, 'поле ссылается на таблицу — не даём унести');

    state.system.fields = state.system.fields.filter(f => f.tag !== tag);
    deleteTable(name);
    ok(!(name in state.system.tables));
  });

  test('секция рисуется и без единой таблицы — с кнопкой добавления', () => {
    const saved = state.system.tables;
    state.system.tables = {};
    ok(renderTables().includes('+ таблица'));
    state.system.tables = saved;
  });

  test('setValueKind переключает поле между хранимым / формулой / таблицей', () => {
    const tag = addField('Тест');
    setValueKind(tag, 'formula');
    eq(field(tag).value.kind, 'formula');

    const name = addTable();
    setValueKind(tag, 'table');
    eq(field(tag).value.kind, 'table');
    ok('table' in field(tag).value, 'ссылка на таблицу заведена сразу — не пустое поле без адреса');

    setValueKind(tag, 'stored');
    eq(field(tag).value.kind, 'stored');
    ok(typeof field(tag).value.default !== 'undefined');

    deleteTable(name);
    state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  });
});
